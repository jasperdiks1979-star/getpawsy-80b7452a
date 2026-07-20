import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Creative-fatigue detector.
 *
 * Compares ROAS over a recent window (default last 7d) vs a prior window
 * (the previous 7d) per (channel, hook_family) arm. Arms that drop below
 * `dropPct` while having `minConversions` are flagged as fatigued.
 *
 * For each fatigued arm we:
 *  - persist a verdict row to `mi_tuning_state` (scope: `arm_fatigue`)
 *  - optionally trigger `mi-bulk-variants` to spin up fresh creative variants
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const body = await req.json().catch(() => ({} as any));
    const recentDays = Math.max(1, Number(body?.recent_days ?? 7));
    const priorDays = Math.max(1, Number(body?.prior_days ?? 7));
    const cpc = Number(body?.cpc_estimate ?? 0.25);
    const dropPct = Number(body?.drop_pct ?? 0.4); // 40% ROAS decline
    const minConv = Math.max(1, Number(body?.min_conversions ?? 3));
    const triggerVariants = body?.trigger_variants !== false;
    const dryRun = body?.dry_run === true;

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const now = Date.now();
    const recentStart = new Date(now - recentDays * 86400_000).toISOString();
    const priorStart = new Date(now - (recentDays + priorDays) * 86400_000).toISOString();
    const priorEnd = recentStart;

    type Bucket = { revenue: number; conversions: number; clicks: number };
    async function computeArms(start: string, end: string | null): Promise<Map<string, Bucket>> {
      let oq = sb.from("orders").select("id,user_id,total_amount,created_at,status").gte("created_at", start).in("status", ["paid", "fulfilled", "shipped", "completed"]);
      if (end) oq = oq.lt("created_at", end);
      let uq = sb.from("utm_session_log").select("session_id,visitor_id,utm_source,utm_campaign,utm_content,created_at,is_internal").gte("created_at", start).eq("is_internal", false);
      if (end) uq = uq.lt("created_at", end);
      let cq = sb.from("mi_channel_metrics").select("channel,hook_family,clicks,captured_at").gte("captured_at", start);
      if (end) cq = cq.lt("captured_at", end);

      const [{ data: orders }, { data: utm }, { data: cm }] = await Promise.all([oq, uq, cq]);
      const byVisitor = new Map<string, any>();
      for (const r of utm ?? []) {
        if (!r.visitor_id || !r.utm_source) continue;
        const prev = byVisitor.get(String(r.visitor_id));
        if (!prev || new Date(r.created_at) > new Date(prev.created_at)) byVisitor.set(String(r.visitor_id), r);
      }
      const buckets = new Map<string, Bucket>();
      for (const o of orders ?? []) {
        const visitor = (o as any).user_id;
        if (!visitor) continue;
        const u = byVisitor.get(String(visitor));
        if (!u) continue;
        const channel = String(u.utm_source).toLowerCase();
        if (channel !== "pinterest" && channel !== "tiktok") continue;
        const hook = (u.utm_campaign ?? u.utm_content ?? "unknown").toString().split("_")[0];
        const k = `${channel}::${hook}`;
        const cur = buckets.get(k) ?? { revenue: 0, conversions: 0, clicks: 0 };
        cur.revenue += Number(o.total_amount ?? 0);
        cur.conversions += 1;
        buckets.set(k, cur);
      }
      for (const m of cm ?? []) {
        if (!m.channel || !m.hook_family) continue;
        const k = `${String(m.channel).toLowerCase()}::${m.hook_family}`;
        const cur = buckets.get(k) ?? { revenue: 0, conversions: 0, clicks: 0 };
        cur.clicks += Number(m.clicks ?? 0);
        buckets.set(k, cur);
      }
      return buckets;
    }

    const [recent, prior] = await Promise.all([
      computeArms(recentStart, null),
      computeArms(priorStart, priorEnd),
    ]);

    function roas(b: Bucket | undefined): number {
      if (!b) return 0;
      const spend = b.clicks * cpc;
      return spend > 0 ? b.revenue / spend : b.revenue;
    }

    const verdicts: any[] = [];
    const allKeys = new Set([...recent.keys(), ...prior.keys()]);
    for (const k of allKeys) {
      const [channel, hook] = k.split("::");
      const r = recent.get(k);
      const p = prior.get(k);
      const rRoas = roas(r);
      const pRoas = roas(p);
      const totalConv = (r?.conversions ?? 0) + (p?.conversions ?? 0);
      if (totalConv < minConv) continue;
      const decline = pRoas > 0 ? (pRoas - rRoas) / pRoas : 0;
      const fatigued = decline >= dropPct && pRoas > 0;
      verdicts.push({
        channel,
        hook_family: hook,
        recent_roas: Number(rRoas.toFixed(3)),
        prior_roas: Number(pRoas.toFixed(3)),
        decline: Number(decline.toFixed(3)),
        recent_conv: r?.conversions ?? 0,
        prior_conv: p?.conversions ?? 0,
        verdict: fatigued ? "fatigued" : "healthy",
      });
    }

    const fatiguedArms = verdicts.filter((v) => v.verdict === "fatigued");

    if (!dryRun && verdicts.length) {
      const stateRows = verdicts.map((v) => ({
        scope: "arm_fatigue",
        key: `${v.channel}::${v.hook_family}`,
        value: v.decline,
        metadata: { ...v, computed_at: new Date().toISOString() },
      }));
      await sb.from("mi_tuning_state").upsert(stateRows, { onConflict: "scope,key" });
    }

    let variantsTriggered = 0;
    const variantResults: any[] = [];
    if (!dryRun && triggerVariants && fatiguedArms.length) {
      const base = Deno.env.get("SUPABASE_URL")!;
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const families = Array.from(new Set(fatiguedArms.map((v) => v.hook_family)));
      try {
        const r = await fetch(`${base}/functions/v1/mi-bulk-variants`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ hook_families: families, reason: "fatigue_refresh" }),
        });
        const j = await r.json().catch(() => ({}));
        variantsTriggered = families.length;
        variantResults.push({ ok: r.ok, families, result: j });
      } catch (e: any) {
        variantResults.push({ ok: false, error: e?.message ?? String(e) });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        recent_days: recentDays,
        prior_days: priorDays,
        drop_pct: dropPct,
        arms: verdicts.length,
        fatigued: fatiguedArms.length,
        variants_triggered: variantsTriggered,
        verdicts,
        variant_results: variantResults,
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