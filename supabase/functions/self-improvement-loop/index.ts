import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-source",
};

// Self-Improvement Loop
// Runs nightly. Reads Pinterest performance, profit verdicts, and order data
// over the last 7 days and automatically:
//   - pauses losing pins (low CTR, no saves, no clicks)
//   - boosts winning pins/products (high saves, purchases)
//   - retrains pinterest_pattern_weights based on signal lift
//   - bumps publishing frequency for proven winners
//   - sidelines unprofitable products via autopilot overrides

function safeNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const trigger = req.headers.get("x-cron-source") ? "cron" : "manual";

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Open a run record
  const { data: runRow } = await sb.from("self_improvement_runs")
    .insert({ trigger, status: "running" })
    .select("id").single();
  const runId = (runRow as any)?.id as string | undefined;

  const actions: any[] = [];
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();

  async function recordAction(action_type: string, target_kind: string, target_ref: string, reason: string, before: any, after: any) {
    actions.push({ action_type, target_kind, target_ref, reason });
    if (runId) {
      await sb.from("self_improvement_actions").insert({
        run_id: runId, action_type, target_kind, target_ref, reason, before, after,
      });
    }
  }

  try {
    // --- 1. Aggregate Pinterest signals per pin (7d)
    const { data: perf } = await sb
      .from("pinterest_pin_performance")
      .select("id,pin_id,product_id,impressions,clicks,saves,ctr,performance_score,hook_angle,status")
      .gte("created_at", since7)
      .limit(10000);

    let winners = 0;
    let losers = 0;

    for (const p of perf ?? []) {
      const r = p as any;
      const imp = safeNum(r.impressions);
      const clk = safeNum(r.clicks);
      const sav = safeNum(r.saves);
      const ctr = imp > 0 ? clk / imp : 0;

      // Loser: enough impressions, no engagement
      if (imp >= 1000 && sav === 0 && ctr < 0.005 && r.status !== "paused") {
        await sb.from("pinterest_pin_performance")
          .update({ status: "paused" }).eq("id", r.id);
        await recordAction("pause_pin", "pinterest_pin", r.pin_id ?? r.id,
          `Low engagement: ${imp} imp, ${sav} saves, CTR ${(ctr * 100).toFixed(2)}%`,
          { status: r.status, impressions: imp, ctr }, { status: "paused" });
        losers++;
      }
      // Winner: solid CTR + saves
      else if (sav >= 5 && ctr >= 0.015 && r.status === "active") {
        const newScore = Math.min(100, safeNum(r.performance_score) + 10);
        await sb.from("pinterest_pin_performance")
          .update({ performance_score: newScore }).eq("id", r.id);
        await recordAction("boost_pin", "pinterest_pin", r.pin_id ?? r.id,
          `Strong engagement: ${sav} saves, CTR ${(ctr * 100).toFixed(2)}%`,
          { performance_score: r.performance_score }, { performance_score: newScore });
        winners++;
      }
    }

    // --- 2. Retrain pattern weights from hook_angle performance
    const angleStats = new Map<string, { imp: number; clk: number; sav: number; n: number }>();
    for (const p of perf ?? []) {
      const angle = (p as any).hook_angle as string | null;
      if (!angle) continue;
      const cur = angleStats.get(angle) ?? { imp: 0, clk: 0, sav: 0, n: 0 };
      cur.imp += safeNum((p as any).impressions);
      cur.clk += safeNum((p as any).clicks);
      cur.sav += safeNum((p as any).saves);
      cur.n += 1;
      angleStats.set(angle, cur);
    }
    let patternUpdates = 0;
    for (const [angle, s] of angleStats.entries()) {
      if (s.n < 3) continue;
      const ctr = s.imp > 0 ? s.clk / s.imp : 0;
      const saveRate = s.imp > 0 ? s.sav / s.imp : 0;
      const composite = Math.max(0, Math.min(100, Math.round((ctr * 1000 + saveRate * 2000) / 2)));
      await sb.from("pinterest_pattern_weights").upsert({
        pattern_id: `angle:${angle}`,
        hook_category: angle,
        niche_key: "global",
        composite_score: composite,
        sample_size: s.n,
        updated_at: new Date().toISOString(),
      }, { onConflict: "pattern_id,hook_category,niche_key" });
      patternUpdates++;
    }

    // --- 3. Aggregate revenue (7d) for run totals
    const PAID = ["paid", "fulfilled", "shipped", "delivered", "completed"];
    const { data: orders } = await sb
      .from("orders").select("total,items,status,created_at")
      .gte("created_at", since7).in("status", PAID).limit(5000);
    let revenue7 = 0;
    let profit7 = 0;
    for (const o of orders ?? []) {
      revenue7 += safeNum((o as any).total);
      const items = (o as any).items;
      if (Array.isArray(items)) {
        for (const it of items) {
          const price = safeNum(it?.price);
          const cost = safeNum(it?.cost_price);
          const qty = safeNum(it?.quantity ?? 1);
          profit7 += (price - cost) * qty;
        }
      }
    }

    // --- 4. Sideline unprofitable products (today's hot_score < 30 + high impressions, no purchases)
    const today = new Date().toISOString().slice(0, 10);
    const { data: hot } = await sb.from("hot_product_scores")
      .select("product_id,hot_score,pinterest_impressions_30d,units_30d")
      .eq("day", today).limit(2000);
    for (const h of hot ?? []) {
      const r = h as any;
      if (safeNum(r.hot_score) < 30 && safeNum(r.pinterest_impressions_30d) > 5000 && safeNum(r.units_30d) === 0) {
        await sb.from("pinterest_autopilot_overrides").upsert({
          product_id: r.product_id,
          action: "paused",
          reason: `Self-improvement: low hot_score ${r.hot_score}, no conversions on ${r.pinterest_impressions_30d} imp`,
          expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
        }, { onConflict: "product_id" });
        await recordAction("sideline_product", "product", r.product_id,
          `Unprofitable: no purchases on ${r.pinterest_impressions_30d} impressions`,
          { hot_score: r.hot_score }, { action: "paused" });
      }
    }

    // --- 5. Scale publishing frequency if revenue trend positive
    const { data: priorRun } = await sb
      .from("self_improvement_runs")
      .select("revenue_7d")
      .lt("started_at", new Date(Date.now() - 86400_000).toISOString())
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    const prevRev = safeNum((priorRun as any)?.revenue_7d);
    if (prevRev > 0 && revenue7 > prevRev * 1.15) {
      const { data: cfg } = await sb.from("pinterest_autopilot_config")
        .select("daily_post_target").eq("id", 1).maybeSingle();
      const cur = safeNum((cfg as any)?.daily_post_target) || 5;
      const next = Math.min(12, cur + 1);
      if (next !== cur) {
        await sb.from("pinterest_autopilot_config")
          .update({ daily_post_target: next }).eq("id", 1);
        await recordAction("scale_publishing", "autopilot_config", "1",
          `Revenue up ${(((revenue7 - prevRev) / prevRev) * 100).toFixed(1)}% — increasing daily posts`,
          { daily_post_target: cur }, { daily_post_target: next });
      }
    } else if (prevRev > 0 && revenue7 < prevRev * 0.7) {
      const { data: cfg } = await sb.from("pinterest_autopilot_config")
        .select("daily_post_target").eq("id", 1).maybeSingle();
      const cur = safeNum((cfg as any)?.daily_post_target) || 5;
      const next = Math.max(2, cur - 1);
      if (next !== cur) {
        await sb.from("pinterest_autopilot_config")
          .update({ daily_post_target: next }).eq("id", 1);
        await recordAction("throttle_publishing", "autopilot_config", "1",
          `Revenue down — throttling daily posts`,
          { daily_post_target: cur }, { daily_post_target: next });
      }
    }

    // Close the run
    if (runId) {
      await sb.from("self_improvement_runs").update({
        finished_at: new Date().toISOString(),
        status: "ok",
        revenue_7d: revenue7,
        profit_7d: profit7,
        winners_count: winners,
        losers_count: losers,
        actions_taken: actions.length,
        pattern_weights_updated: patternUpdates,
        payload: { trace: traceId },
      }).eq("id", runId);
    }

    return new Response(JSON.stringify({
      ok: true, traceId, runId,
      winners, losers, actions: actions.length, patternUpdates,
      revenue_7d: revenue7, profit_7d: profit7,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId) {
      await sb.from("self_improvement_runs").update({
        finished_at: new Date().toISOString(), status: "error", notes: msg,
      }).eq("id", runId);
    }
    return new Response(JSON.stringify({ ok: false, traceId, message: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  }
});