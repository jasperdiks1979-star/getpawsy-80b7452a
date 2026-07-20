// Meta Intelligence Layer (MIL) — orchestrator
// Reviews every registered AI engine: scores decisions, calibrates confidence,
// updates a leaderboard, and writes a strategic briefing. Read-only by default;
// weight adjustments require mil_settings.autonomy.auto_adjust_weights = true.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Decision = {
  id: string;
  engine_key: string;
  confidence: number | null;
  expected_outcome: Record<string, unknown>;
  actual_outcome: Record<string, unknown> | null;
  financial_impact_cents: number | null;
  business_impact_score: number | null;
  status: string;
  decided_at: string;
};

function grade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function num(x: unknown): number | null {
  if (x == null) return null;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function accuracyOf(expected: unknown, actual: unknown): number | null {
  const e = num(expected);
  const a = num(actual);
  if (e == null || a == null) return null;
  if (e === 0 && a === 0) return 1;
  const denom = Math.max(Math.abs(e), Math.abs(a), 1e-6);
  return Math.max(0, 1 - Math.abs(e - a) / denom);
}

async function reviewEngine(supa: ReturnType<typeof createClient>, engineKey: string, since: string) {
  const { data, error } = await supa
    .from("mil_decisions")
    .select("id, engine_key, confidence, expected_outcome, actual_outcome, financial_impact_cents, business_impact_score, status, decided_at")
    .eq("engine_key", engineKey)
    .gte("decided_at", since)
    .limit(2000);
  if (error) throw error;
  const decisions = (data ?? []) as Decision[];
  const evaluated = decisions.filter((d) => d.actual_outcome);

  const accs = { ctr: [] as number[], cvr: [] as number[], roas: [] as number[], rev: [] as number[] };
  let profit = 0;
  let confSum = 0;
  let successHits = 0;

  for (const d of evaluated) {
    const exp = d.expected_outcome ?? {};
    const act = d.actual_outcome ?? {};
    const ctr = accuracyOf((exp as any).ctr, (act as any).ctr); if (ctr != null) accs.ctr.push(ctr);
    const cvr = accuracyOf((exp as any).cvr, (act as any).cvr); if (cvr != null) accs.cvr.push(cvr);
    const roas = accuracyOf((exp as any).roas, (act as any).roas); if (roas != null) accs.roas.push(roas);
    const rev = accuracyOf((exp as any).revenue_cents, (act as any).revenue_cents); if (rev != null) accs.rev.push(rev);
    if (d.financial_impact_cents) profit += d.financial_impact_cents;
    if (d.confidence != null) {
      confSum += d.confidence;
      const ok = (act as any).success === true || ((act as any).revenue_cents ?? 0) > 0;
      if (ok) successHits++;
    }
  }

  const avg = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  const ctrAcc = avg(accs.ctr);
  const cvrAcc = avg(accs.cvr);
  const roasAcc = avg(accs.roas);
  const revAcc = avg(accs.rev);
  const predAcc = avg([ctrAcc, cvrAcc, roasAcc, revAcc].filter((x): x is number => x != null));
  const decisionQuality = evaluated.length === 0 ? null : Math.min(1, evaluated.length / 50);
  const novelty = null;
  const businessValue = profit > 0 ? Math.min(1, profit / 1_000_000) : 0;
  const overall = (() => {
    const parts = [predAcc ?? 0.5, decisionQuality ?? 0.3, businessValue].filter((x) => x != null) as number[];
    return parts.length ? Math.round(parts.reduce((s, x) => s + x, 0) / parts.length * 100) : null;
  })();

  // Calibration: predicted avg confidence vs actual success rate
  const predictedAvg = evaluated.length ? confSum / evaluated.length : null;
  const actualSuccess = evaluated.length ? successHits / evaluated.length : null;
  const calibrationError = predictedAvg != null && actualSuccess != null ? Math.abs(predictedAvg - actualSuccess) : null;

  return {
    engine_key: engineKey,
    sample_size: evaluated.length,
    decision_quality: decisionQuality,
    prediction_accuracy: predAcc,
    ctr_accuracy: ctrAcc,
    conversion_accuracy: cvrAcc,
    roas_accuracy: roasAcc,
    profit_contribution_cents: profit,
    novelty_score: novelty,
    business_value: businessValue,
    overall_grade: overall,
    letter_grade: overall != null ? grade(overall) : null,
    predicted_avg: predictedAvg,
    actual_success_rate: actualSuccess,
    calibration_error: calibrationError,
  };
}

async function runReview(supa: ReturnType<typeof createClient>, trigger: string) {
  const { data: run } = await supa.from("mil_runs").insert({ trigger }).select("id").single();
  const runId = (run as { id: string }).id;
  const t0 = Date.now();
  try {
    const { data: registry } = await supa.from("mil_ai_registry").select("engine_key, weight, status").eq("status", "active");
    const engines = (registry ?? []) as Array<{ engine_key: string; weight: number; status: string }>;
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const periodStart = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const periodEnd = new Date().toISOString().slice(0, 10);

    const reviews: any[] = [];
    for (const e of engines) {
      const r = await reviewEngine(supa, e.engine_key, since);
      reviews.push(r);
      await supa.from("mil_performance_reviews").upsert({
        engine_key: r.engine_key,
        period_start: periodStart,
        period_end: periodEnd,
        decision_quality: r.decision_quality,
        prediction_accuracy: r.prediction_accuracy,
        ctr_accuracy: r.ctr_accuracy,
        conversion_accuracy: r.conversion_accuracy,
        roas_accuracy: r.roas_accuracy,
        profit_contribution_cents: r.profit_contribution_cents,
        novelty_score: r.novelty_score,
        business_value: r.business_value,
        overall_grade: r.overall_grade,
        letter_grade: r.letter_grade,
        sample_size: r.sample_size,
        details: r,
      }, { onConflict: "engine_key,period_start" });

      if (r.predicted_avg != null && r.actual_success_rate != null) {
        await supa.from("mil_confidence_calibration").insert({
          engine_key: r.engine_key,
          bucket_low: 0,
          bucket_high: 1,
          predicted_avg: r.predicted_avg,
          actual_success_rate: r.actual_success_rate,
          sample_size: r.sample_size,
          calibration_error: r.calibration_error,
          recommended_adjustment: r.predicted_avg - r.actual_success_rate,
          period_start: periodStart,
          period_end: periodEnd,
        });
      }
    }

    const sorted = [...reviews].sort((a, b) => (b.overall_grade ?? 0) - (a.overall_grade ?? 0));
    const byProfit = [...reviews].sort((a, b) => (b.profit_contribution_cents ?? 0) - (a.profit_contribution_cents ?? 0));
    const byAccuracy = [...reviews].sort((a, b) => (b.prediction_accuracy ?? 0) - (a.prediction_accuracy ?? 0));

    await supa.from("mil_leaderboard_snapshots").insert({
      rankings: sorted.map((r, i) => ({ rank: i + 1, engine: r.engine_key, grade: r.overall_grade, letter: r.letter_grade })),
      most_accurate: byAccuracy[0]?.engine_key ?? null,
      most_profitable: byProfit[0]?.engine_key ?? null,
      fastest_learning: sorted[0]?.engine_key ?? null,
      worst_performer: sorted[sorted.length - 1]?.engine_key ?? null,
    });

    // Optional weight adjustment (gated)
    const { data: settings } = await supa.from("mil_settings").select("key, value").eq("key", "autonomy").maybeSingle();
    const autonomy = ((settings as any)?.value ?? {}) as { auto_adjust_weights?: boolean; min_sample_size?: number };
    let adjustments = 0;
    if (autonomy.auto_adjust_weights) {
      for (const r of reviews) {
        if ((r.sample_size ?? 0) < (autonomy.min_sample_size ?? 20)) continue;
        const cur = engines.find((e) => e.engine_key === r.engine_key)?.weight ?? 1;
        const target = r.overall_grade == null ? cur : Math.max(0.1, Math.min(1.5, 0.4 + (r.overall_grade / 100)));
        const next = cur + (target - cur) * 0.25;
        if (Math.abs(next - cur) >= 0.01) {
          await supa.from("mil_ai_registry").update({ weight: next, updated_at: new Date().toISOString() }).eq("engine_key", r.engine_key);
          adjustments++;
        }
      }
    }

    await supa.from("mil_runs").update({
      ended_at: new Date().toISOString(),
      status: "completed",
      engines_reviewed: reviews.length,
      decisions_evaluated: reviews.reduce((s, r) => s + (r.sample_size ?? 0), 0),
      weight_adjustments: adjustments,
      summary: { top: sorted[0]?.engine_key, bottom: sorted[sorted.length - 1]?.engine_key, ms: Date.now() - t0 },
    }).eq("id", runId);

    return { runId, reviews, adjustments };
  } catch (e) {
    await supa.from("mil_runs").update({ ended_at: new Date().toISOString(), status: "failed", error: String(e) }).eq("id", runId);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? "snapshot";

    if (action === "run") {
      const result = await runReview(supa, body.trigger ?? "manual");
      return new Response(JSON.stringify({ ok: true, ...result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [registry, reviews, leaderboard, runs, calib] = await Promise.all([
      supa.from("mil_ai_registry").select("*").order("display_name"),
      supa.from("mil_performance_reviews").select("*").order("period_end", { ascending: false }).limit(60),
      supa.from("mil_leaderboard_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
      supa.from("mil_runs").select("*").order("started_at", { ascending: false }).limit(20),
      supa.from("mil_confidence_calibration").select("*").order("created_at", { ascending: false }).limit(60),
    ]);

    return new Response(JSON.stringify({
      ok: true,
      registry: registry.data ?? [],
      reviews: reviews.data ?? [],
      leaderboard: leaderboard.data ?? null,
      runs: runs.data ?? [],
      calibration: calib.data ?? [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});