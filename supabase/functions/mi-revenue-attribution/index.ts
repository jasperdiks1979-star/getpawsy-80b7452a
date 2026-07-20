import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Revenue attribution loop:
 *  - Joins paid `orders` to `utm_session_log` via session_id / visitor_id.
 *  - Buckets revenue by (channel, hook_family) where channel = utm_source
 *    (pinterest|tiktok) and hook_family = utm_campaign or utm_content prefix.
 *  - Computes ROAS = revenue / est_spend (est_spend defaults to clicks * cpc).
 *  - Writes per-arm rows to `mi_arm_revenue` and merges into `mi_tuning_state`
 *    `bandit_arm` rows so the bandit allocator can rank by ROAS instead of CTR.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const body = await req.json().catch(() => ({} as any));
    const windowDays = Number(body?.window_days ?? 14);
    const cpcEstimate = Number(body?.cpc_estimate ?? 0.25); // assumed avg CPC for organic-equiv spend
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

    // 1. Pull recent paid orders.
    const { data: orders } = await sb
      .from("orders")
      .select("id,user_id,total_amount,currency,created_at,customer_email")
      .gte("created_at", since)
      .in("status", ["paid", "fulfilled", "shipped", "completed"]);
    const orderRows = orders ?? [];

    // 2. Pull UTM sessions in the same window.
    const { data: utm } = await sb
      .from("utm_session_log")
      .select("session_id,visitor_id,utm_source,utm_medium,utm_campaign,utm_content,created_at,is_internal")
      .gte("created_at", since)
      .eq("is_internal", false);
    const utmRows = (utm ?? []).filter((r) => r.utm_source && (r.utm_campaign || r.utm_content));

    // Index: visitor_id -> latest UTM row.
    const byVisitor = new Map<string, any>();
    for (const r of utmRows) {
      if (!r.visitor_id) continue;
      const prev = byVisitor.get(r.visitor_id);
      if (!prev || new Date(r.created_at) > new Date(prev.created_at)) byVisitor.set(r.visitor_id, r);
    }

    // 3. Pull channel metrics for click totals (spend estimation).
    const { data: cm } = await sb
      .from("mi_channel_metrics")
      .select("channel,hook_family,clicks,conversions,impressions")
      .gte("captured_at", since);
    const clicksByArm = new Map<string, { clicks: number; conv: number; imp: number }>();
    for (const m of cm ?? []) {
      if (!m.channel || !m.hook_family) continue;
      const k = `${m.channel}::${m.hook_family}`;
      const cur = clicksByArm.get(k) ?? { clicks: 0, conv: 0, imp: 0 };
      cur.clicks += Number(m.clicks ?? 0);
      cur.conv += Number(m.conversions ?? 0);
      cur.imp += Number(m.impressions ?? 0);
      clicksByArm.set(k, cur);
    }

    // 4. Attribute orders to arms via visitor_id (fallback: skip).
    type Bucket = { revenue: number; conversions: number };
    const buckets = new Map<string, Bucket>();
    let attributed = 0;
    for (const o of orderRows) {
      const visitor = (o as any).user_id ?? null;
      if (!visitor) continue;
      const utmRow = byVisitor.get(String(visitor));
      if (!utmRow) continue;
      const channel = String(utmRow.utm_source).toLowerCase();
      if (channel !== "pinterest" && channel !== "tiktok") continue;
      const hookFamily = (utmRow.utm_campaign ?? utmRow.utm_content ?? "unknown").toString().split("_")[0];
      const key = `${channel}::${hookFamily}`;
      const cur = buckets.get(key) ?? { revenue: 0, conversions: 0 };
      cur.revenue += Number(o.total_amount ?? 0);
      cur.conversions += 1;
      buckets.set(key, cur);
      attributed++;
    }

    // 5. Upsert mi_arm_revenue + merge into mi_tuning_state.
    const upserts: any[] = [];
    const stateUpserts: any[] = [];
    for (const [key, bucket] of buckets) {
      const [channel, hookFamily] = key.split("::");
      const armClicks = clicksByArm.get(key)?.clicks ?? 0;
      const estSpend = armClicks * cpcEstimate;
      const roas = estSpend > 0 ? bucket.revenue / estSpend : bucket.revenue;
      const rpc = armClicks > 0 ? bucket.revenue / armClicks : 0;
      upserts.push({
        channel,
        hook_family: hookFamily,
        window_days: windowDays,
        conversions: bucket.conversions,
        revenue: Number(bucket.revenue.toFixed(2)),
        est_spend: Number(estSpend.toFixed(2)),
        roas: Number(roas.toFixed(3)),
        rev_per_click: Number(rpc.toFixed(4)),
        metadata: { cpc_estimate: cpcEstimate, clicks: armClicks },
        computed_at: new Date().toISOString(),
      });
      stateUpserts.push({
        scope: "bandit_arm",
        key: hookFamily,
        value: roas,
        metadata: {
          channel,
          revenue: bucket.revenue,
          conversions: bucket.conversions,
          est_spend: estSpend,
          rev_per_click: rpc,
          window_days: windowDays,
          source: "revenue-attribution",
          updated_at: new Date().toISOString(),
        },
      });
    }

    if (upserts.length) {
      const { error } = await sb.from("mi_arm_revenue").upsert(upserts, { onConflict: "channel,hook_family,window_days" });
      if (error) throw error;
    }
    if (stateUpserts.length) {
      // Best-effort merge — don't overwrite CTR-based bandit_arm values, store as separate scope.
      const roasRows = stateUpserts.map((r) => ({ ...r, scope: "bandit_arm_roas" }));
      await sb.from("mi_tuning_state").upsert(roasRows, { onConflict: "scope,key" });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        attributed_orders: attributed,
        total_orders: orderRows.length,
        arms: upserts.length,
        rows: upserts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, traceId, message: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});