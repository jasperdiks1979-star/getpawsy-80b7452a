import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Phase 20 — Audience clustering.
 *
 * Defines visitor cohorts as (utm_source × landing_page bucket) and computes
 * which (channel, hook_family) arms convert best for each cohort. Results are
 * persisted to `mi_audience_clusters` and a top-arm-per-cohort summary lands
 * in `mi_tuning_state` under scope=`audience_cluster` so the bandit allocator
 * (and future targeting layers) can use cohort-aware boosts.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const body = await req.json().catch(() => ({} as any));
    const windowDays = Number(body?.window_days ?? 21);
    const minConv = Number(body?.min_conversions ?? 2);
    const dryRun = !!body?.dry_run;
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

    // 1. Recent paid orders.
    const { data: orders } = await sb
      .from("orders")
      .select("id,user_id,total_amount,created_at")
      .gte("created_at", since)
      .in("status", ["paid", "fulfilled", "shipped", "completed"]);
    const orderRows = orders ?? [];

    // 2. UTM sessions in window.
    const { data: utm } = await sb
      .from("utm_session_log")
      .select("session_id,visitor_id,utm_source,utm_campaign,utm_content,landing_page,referrer,created_at,is_internal")
      .gte("created_at", since)
      .eq("is_internal", false);
    const utmRows = (utm ?? []).filter((r) => r.utm_source && (r.utm_campaign || r.utm_content));

    // Latest UTM per visitor.
    const byVisitor = new Map<string, any>();
    for (const r of utmRows) {
      if (!r.visitor_id) continue;
      const prev = byVisitor.get(r.visitor_id);
      if (!prev || new Date(r.created_at) > new Date(prev.created_at)) byVisitor.set(r.visitor_id, r);
    }

    // 3. Build cohort buckets.
    const landingBucket = (lp: string | null) => {
      if (!lp) return "root";
      const p = String(lp).split("?")[0];
      const seg = p.split("/").filter(Boolean)[0] ?? "root";
      return seg.toLowerCase().slice(0, 32);
    };

    type Bucket = { revenue: number; conversions: number; cohort_source: string; cohort_landing: string };
    const arms = new Map<string, Bucket>(); // key = cohort||channel||hook
    let attributed = 0;

    for (const o of orderRows) {
      const visitor = (o as any).user_id ?? null;
      if (!visitor) continue;
      const utmRow = byVisitor.get(String(visitor));
      if (!utmRow) continue;
      const channel = String(utmRow.utm_source).toLowerCase();
      if (channel !== "pinterest" && channel !== "tiktok") continue;
      const hookFamily = (utmRow.utm_campaign ?? utmRow.utm_content ?? "unknown")
        .toString()
        .split("_")[0]
        .toLowerCase();
      const cohortSource = channel;
      const cohortLanding = landingBucket(utmRow.landing_page);
      const cohortKey = `${cohortSource}:${cohortLanding}`;
      const armKey = `${cohortKey}||${channel}||${hookFamily}`;
      const cur = arms.get(armKey) ?? {
        revenue: 0,
        conversions: 0,
        cohort_source: cohortSource,
        cohort_landing: cohortLanding,
      };
      cur.revenue += Number(o.total_amount ?? 0);
      cur.conversions += 1;
      arms.set(armKey, cur);
      attributed++;
    }

    // 4. Compute cohort totals + arm share.
    const cohortTotals = new Map<string, { revenue: number; conv: number }>();
    for (const [k, v] of arms) {
      const cohortKey = k.split("||")[0];
      const tot = cohortTotals.get(cohortKey) ?? { revenue: 0, conv: 0 };
      tot.revenue += v.revenue;
      tot.conv += v.conversions;
      cohortTotals.set(cohortKey, tot);
    }

    const rows: any[] = [];
    const topByCohort = new Map<string, { channel: string; hook_family: string; revenue: number; conversions: number; share: number }>();
    for (const [k, v] of arms) {
      const [cohortKey, channel, hookFamily] = k.split("||");
      if (v.conversions < minConv) continue;
      const tot = cohortTotals.get(cohortKey)!;
      const share = tot.revenue > 0 ? v.revenue / tot.revenue : 0;
      rows.push({
        cohort_key: cohortKey,
        cohort_source: v.cohort_source,
        cohort_landing: v.cohort_landing,
        channel,
        hook_family: hookFamily,
        conversions: v.conversions,
        revenue: Number(v.revenue.toFixed(2)),
        share: Number(share.toFixed(4)),
        metadata: { window_days: windowDays },
        computed_at: new Date().toISOString(),
      });
      const cur = topByCohort.get(cohortKey);
      if (!cur || v.revenue > cur.revenue) {
        topByCohort.set(cohortKey, { channel, hook_family: hookFamily, revenue: v.revenue, conversions: v.conversions, share });
      }
    }

    // 5. Persist.
    if (!dryRun && rows.length) {
      const { error } = await sb
        .from("mi_audience_clusters")
        .upsert(rows, { onConflict: "cohort_key,channel,hook_family" });
      if (error) throw error;

      const stateRows = Array.from(topByCohort.entries()).map(([cohortKey, top]) => ({
        scope: "audience_cluster",
        key: cohortKey,
        value: top.share,
        metadata: {
          channel: top.channel,
          hook_family: top.hook_family,
          revenue: top.revenue,
          conversions: top.conversions,
          window_days: windowDays,
          source: "audience-cluster",
          updated_at: new Date().toISOString(),
        },
      }));
      if (stateRows.length) {
        await sb.from("mi_tuning_state").upsert(stateRows, { onConflict: "scope,key" });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        cohorts: cohortTotals.size,
        arms: rows.length,
        attributed_orders: attributed,
        total_orders: orderRows.length,
        top_per_cohort: Array.from(topByCohort.entries()).map(([k, v]) => ({ cohort_key: k, ...v })),
        rows,
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