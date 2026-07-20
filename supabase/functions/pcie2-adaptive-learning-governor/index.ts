// Adaptive Learning Governor: decides when to learn, slow, pause, recover.
// Computes volatility, drift, seasonality, outliers; sets learning_speed;
// freezes rules and protects long-term winners.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type State = "LEARNING" | "CAUTIOUS" | "PAUSED" | "RECOVERY";

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}
function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function cv(xs: number[]) {
  const m = mean(xs);
  return m > 0 ? stdev(xs) / m : 0;
}
function iqrOutliers(xs: number[]): number {
  if (xs.length < 4) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const q1 = s[Math.floor(s.length * 0.25)];
  const q3 = s[Math.floor(s.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return xs.filter((x) => x < lo || x > hi).length;
}

function detectSeason(now = new Date()): string | null {
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  const dow = now.getUTCDay();
  // Black Friday window
  if (m === 11 && d >= 20) return "black_friday";
  if (m === 12 && d <= 26) return "christmas";
  if (m === 8) return "back_to_school";
  if (m === 7 || (m === 8 && d <= 15)) return "summer";
  if (m === 1 || m === 2) return "winter";
  if (dow === 0 || dow === 6) return "weekend";
  return null;
}

function decideState(args: {
  volatility: number;
  drift: number;
  reliability: number;
  prev: State;
}): { state: State; speed: number; reason: string } {
  const { volatility, drift, reliability, prev } = args;
  // Thresholds
  if (volatility > 0.6 || drift > 0.5 || reliability < 0.25) {
    return { state: "PAUSED", speed: 0, reason: "Volatility/drift exceeded safe bounds" };
  }
  if (volatility > 0.35 || drift > 0.3 || reliability < 0.45) {
    return { state: "CAUTIOUS", speed: 0.35, reason: "Confidence decreasing; slowing learning" };
  }
  if (prev === "PAUSED") {
    return { state: "RECOVERY", speed: 0.2, reason: "Resuming gradually from pause" };
  }
  if (prev === "RECOVERY" && reliability < 0.7) {
    return { state: "RECOVERY", speed: 0.5, reason: "Recovery ramp continues" };
  }
  return { state: "LEARNING", speed: 1.0, reason: "Stable evidence; normal adaptation" };
}

function halfLifeForVolatility(v: number): number {
  // Higher volatility => longer half-life (decay slower so noise doesn't dominate)
  if (v > 0.5) return 180;
  if (v > 0.3) return 90;
  if (v > 0.15) return 60;
  return 30;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const started = new Date().toISOString();
  const actions: any[] = [];

  try {
    // 1) Pull recent performance window (last 30d)
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: perf } = await supa
      .from("pcie2_pin_performance")
      .select("ctr, saves, purchases, revenue, created_at")
      .gte("created_at", since)
      .limit(5000);

    const rows = perf ?? [];
    const ctrs = rows.map((r: any) => Number(r.ctr ?? 0)).filter((x) => Number.isFinite(x));
    const saves = rows.map((r: any) => Number(r.saves ?? 0));
    const purchases = rows.map((r: any) => Number(r.purchases ?? 0));
    const revenue = rows.map((r: any) => Number(r.revenue ?? 0));

    const ctr_vol = cv(ctrs);
    const save_vol = cv(saves);
    const pur_vol = cv(purchases);
    const rev_vol = cv(revenue);
    const volatility = Math.max(ctr_vol, save_vol, pur_vol, rev_vol);

    // 2) Outliers
    const outliers = iqrOutliers(ctrs) + iqrOutliers(revenue);

    // 3) Drift: compare last 7d mean vs prior 23d mean for CTR
    const cutoff = Date.now() - 7 * 86400_000;
    const recent = rows.filter((r: any) => new Date(r.created_at).getTime() >= cutoff).map((r: any) => Number(r.ctr ?? 0));
    const older = rows.filter((r: any) => new Date(r.created_at).getTime() < cutoff).map((r: any) => Number(r.ctr ?? 0));
    const mr = mean(recent), mo = mean(older);
    const drift = mo > 0 ? Math.abs(mr - mo) / mo : 0;

    // 4) Reliability proxy from trait weights
    const { data: weights } = await supa.from("pcie2_trait_weights").select("confidence,sample_size");
    const confs = (weights ?? []).map((w: any) => Number(w.confidence ?? 0));
    const reliability = mean(confs);
    const sampleN = (weights ?? []).reduce((a: number, w: any) => a + Number(w.sample_size ?? 0), 0);

    // 5) Prev state
    const { data: stateRow } = await supa
      .from("pcie2_alg_state").select("*").eq("scope", "global").maybeSingle();
    const prev: State = (stateRow?.state as State) ?? "LEARNING";

    const decision = decideState({ volatility, drift, reliability, prev });
    const season = detectSeason();
    const halfLife = halfLifeForVolatility(volatility);

    // Stability/accuracy heuristics
    const stability = Math.max(0, 1 - volatility);
    const drift_score = Math.min(1, drift);
    const model_confidence = Math.min(1, reliability * (1 - drift_score) * stability);

    // 6) Protect long-term winners (revenue top 5%)
    const { data: lineage } = await supa
      .from("v_creative_revenue_lineage")
      .select("pcie2_creative_id, total_revenue, total_orders, first_seen")
      .order("total_revenue", { ascending: false })
      .limit(50);
    const winners = (lineage ?? []).filter((r: any) =>
      Number(r.total_revenue ?? 0) > 0 &&
      Number(r.total_orders ?? 0) >= 3 &&
      r.first_seen && (Date.now() - new Date(r.first_seen).getTime()) > 30 * 86400_000
    );
    if (winners.length) {
      const until = new Date(Date.now() + 30 * 86400_000).toISOString();
      await supa.from("pcie2_protected_winners").insert(
        winners.map((w: any) => ({
          creative_id: w.pcie2_creative_id,
          reason: "Top lifetime revenue, sustained >30d",
          lifetime_revenue: w.total_revenue,
          protected_until: until,
        })),
      );
      actions.push({ type: "protect_winners", count: winners.length });
    }

    // 7) Freeze rules if PAUSED or seasonal anomaly
    if (decision.state === "PAUSED" || season === "black_friday" || season === "christmas") {
      const until = new Date(Date.now() + 7 * 86400_000).toISOString();
      await supa.from("pcie2_frozen_rules").insert({
        rule_key: "trait_weight_updates",
        reason: `state=${decision.state} season=${season ?? "none"} vol=${volatility.toFixed(3)}`,
        frozen_until: until,
      });
      actions.push({ type: "freeze_rules", until });
    }

    // 8) Persist state
    const upsert = {
      scope: "global",
      state: decision.state,
      learning_speed: decision.speed,
      confidence: reliability,
      evidence_drift: drift,
      ctr_volatility: ctr_vol,
      save_volatility: save_vol,
      purchase_volatility: pur_vol,
      revenue_volatility: rev_vol,
      season_tag: season,
      outlier_count: outliers,
      decay_half_life_days: halfLife,
      stability_score: stability,
      reliability_score: reliability,
      drift_score,
      prediction_accuracy: 0,
      decision_accuracy: 0,
      model_confidence,
      reason: decision.reason,
      updated_at: new Date().toISOString(),
    };
    await supa.from("pcie2_alg_state").upsert(upsert, { onConflict: "scope" });

    await supa.from("pcie2_alg_runs").insert({
      started_at: started,
      finished_at: new Date().toISOString(),
      prev_state: prev,
      new_state: decision.state,
      actions,
      metrics: {
        volatility, drift, reliability, outliers, season,
        ctr_vol, save_vol, pur_vol, rev_vol, sampleN, halfLife,
        model_confidence, stability,
      },
      notes: decision.reason,
    });

    return new Response(
      JSON.stringify({ ok: true, state: decision.state, speed: decision.speed, season, volatility, drift, reliability, actions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});