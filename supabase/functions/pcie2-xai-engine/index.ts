/**
 * pcie2-xai-engine
 *
 * Explainable AI Decision Engine. Two responsibilities:
 *  1) Read-only snapshot for the Pinterest Health dashboard
 *     (decision feed, top/worst, evaluation, score).
 *  2) Nightly self-evaluation: attach outcomes to pending decisions
 *     and compute calibration / explainability / quality metrics.
 *
 * All other engines emit decisions via `_shared/xai-decision.ts`.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function loadSnapshot(sb: ReturnType<typeof admin>) {
  const [{ data: feed }, { data: evals }] = await Promise.all([
    sb.from("pcie2_xai_decisions")
      .select("id, source_engine, decision_type, subject_kind, subject_id, summary, plain_english, reason_codes, confidence, expected_lift, risk, explainability_score, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    sb.from("pcie2_xai_evaluations")
      .select("*").order("evaluated_at", { ascending: false }).limit(7),
  ]);

  const ids = (feed ?? []).map((d) => d.id);
  const { data: outcomes } = ids.length
    ? await sb.from("pcie2_xai_outcomes")
        .select("decision_id, actual_lift, revenue_impact_cents, ctr_impact, save_impact, purchase_impact, was_correct, prediction_error")
        .in("decision_id", ids)
    : { data: [] as Array<Record<string, unknown>> };

  const byDecision = new Map<string, Record<string, unknown>>();
  for (const o of outcomes ?? []) byDecision.set(String(o.decision_id), o);

  const decorated = (feed ?? []).map((d) => ({ ...d, outcome: byDecision.get(d.id) ?? null }));

  const evaluated = decorated.filter((d) => d.outcome);
  const sorted = [...evaluated].sort((a, b) => {
    const ar = Number((a.outcome as { revenue_impact_cents?: number } | null)?.revenue_impact_cents ?? 0);
    const br = Number((b.outcome as { revenue_impact_cents?: number } | null)?.revenue_impact_cents ?? 0);
    return br - ar;
  });

  return {
    feed: decorated,
    top_decisions: sorted.slice(0, 5),
    worst_decisions: sorted.slice(-5).reverse(),
    evaluations: evals ?? [],
    latest_evaluation: (evals ?? [])[0] ?? null,
  };
}

/**
 * Approximate outcome estimation. We pull a 7-day post-decision
 * window from `pcie2_pin_performance` aggregated against the previous
 * 7 days as baseline. Best-effort: when the decision has no linkable
 * subject we mark it as `neutral` rather than fabricating numbers.
 */
async function evaluatePending(sb: ReturnType<typeof admin>): Promise<{
  evaluated: number;
  correct: number;
  avg_error: number;
}> {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: pending } = await sb.from("pcie2_xai_decisions")
    .select("id, expected_lift, confidence, created_at, subject_kind, subject_id")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(200);

  if (!pending?.length) return { evaluated: 0, correct: 0, avg_error: 0 };

  let correct = 0;
  let totalErr = 0;
  let n = 0;

  for (const d of pending) {
    let actualLift: number | null = null;
    let revenueDelta = 0;
    let ctrDelta = 0;
    let saveDelta = 0;
    let purchaseDelta = 0;

    if (d.subject_kind === "product" && d.subject_id) {
      const decidedAt = new Date(d.created_at).toISOString();
      const baselineStart = new Date(new Date(d.created_at).getTime() - 7 * 24 * 3600 * 1000).toISOString();
      const after = await sb.from("pcie2_pin_performance")
        .select("ctr, save_rate, outbound_clicks, revenue_cents")
        .eq("product_id", d.subject_id)
        .gte("date", decidedAt.slice(0, 10));
      const before = await sb.from("pcie2_pin_performance")
        .select("ctr, save_rate, outbound_clicks, revenue_cents")
        .eq("product_id", d.subject_id)
        .gte("date", baselineStart.slice(0, 10))
        .lt("date", decidedAt.slice(0, 10));

      const avg = (rows: Array<Record<string, unknown>> | null, col: string) => {
        if (!rows?.length) return 0;
        const vals = rows.map((r) => Number(r[col] ?? 0)).filter((v) => !Number.isNaN(v));
        if (!vals.length) return 0;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };
      const ctrA = avg(after.data, "ctr");
      const ctrB = avg(before.data, "ctr");
      const saveA = avg(after.data, "save_rate");
      const saveB = avg(before.data, "save_rate");
      const revA = (after.data ?? []).reduce((s, r) => s + Number(r.revenue_cents ?? 0), 0);
      const revB = (before.data ?? []).reduce((s, r) => s + Number(r.revenue_cents ?? 0), 0);
      ctrDelta = ctrB ? (ctrA - ctrB) / ctrB : 0;
      saveDelta = saveB ? (saveA - saveB) / saveB : 0;
      revenueDelta = revA - revB;
      purchaseDelta = 0;
      actualLift = ctrDelta; // primary metric proxy
    }

    const expected = Number(d.expected_lift ?? 0);
    const err = actualLift != null ? Math.abs(expected - actualLift) : null;
    const wasCorrect = actualLift != null
      ? (Math.sign(expected) === Math.sign(actualLift) || (Math.abs(expected) < 0.02 && Math.abs(actualLift) < 0.05))
      : null;

    await sb.from("pcie2_xai_outcomes").insert({
      decision_id: d.id,
      window_days: 7,
      actual_lift: actualLift,
      revenue_impact_cents: Math.round(revenueDelta),
      ctr_impact: ctrDelta,
      save_impact: saveDelta,
      purchase_impact: purchaseDelta,
      prediction_error: err,
      was_correct: wasCorrect,
      notes: actualLift == null ? "no measurable subject signal" : null,
    });

    await sb.from("pcie2_xai_decisions").update({
      status: actualLift == null ? "neutral" : wasCorrect ? "validated" : "missed",
    }).eq("id", d.id);

    if (err != null) { totalErr += err; n++; if (wasCorrect) correct++; }
  }

  return { evaluated: pending.length, correct, avg_error: n ? totalErr / n : 0 };
}

async function runSelfEvaluation(sb: ReturnType<typeof admin>) {
  const windowStart = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const evalResult = await evaluatePending(sb);

  const { data: recent } = await sb.from("pcie2_xai_decisions")
    .select("id, confidence, explainability_score, reason_codes, evidence_sample_size, evidence_freshness_days")
    .gte("created_at", windowStart);

  const { data: outcomes } = await sb.from("pcie2_xai_outcomes")
    .select("decision_id, was_correct, prediction_error, revenue_impact_cents, actual_lift")
    .gte("measured_at", windowStart);

  const total = recent?.length ?? 0;
  const evaluated = outcomes?.length ?? 0;
  const correct = (outcomes ?? []).filter((o) => o.was_correct === true).length;
  const accuracy = evaluated ? correct / evaluated : 0;
  const avgErr = evaluated
    ? (outcomes ?? []).reduce((s, o) => s + Number(o.prediction_error ?? 0), 0) / evaluated
    : 0;

  const explain = total
    ? (recent ?? []).reduce((s, r) => s + Number(r.explainability_score ?? 0), 0) / total
    : 0;
  const evidenceComplete = total
    ? (recent ?? []).filter((r) => (r.evidence_sample_size ?? 0) > 0).length / total
    : 0;
  const traceability = total
    ? (recent ?? []).filter((r) => Array.isArray(r.reason_codes) && r.reason_codes.length > 0).length / total
    : 0;
  const missing = total
    ? (recent ?? []).filter((r) => !(r.evidence_sample_size ?? 0) || !(r.reason_codes ?? []).length).length / total
    : 0;

  // Confidence calibration: |avg(confidence) − accuracy|, smaller is better.
  const avgConf = total
    ? (recent ?? []).reduce((s, r) => s + Number(r.confidence ?? 0), 0) / total
    : 0;
  const calibration = 1 - Math.min(1, Math.abs(avgConf - accuracy) * 2);

  const quality = Math.round(
    100 * (0.35 * accuracy + 0.25 * explain + 0.2 * traceability + 0.2 * calibration),
  );

  const sortedByRevenue = [...(outcomes ?? [])].sort(
    (a, b) => Number(b.revenue_impact_cents ?? 0) - Number(a.revenue_impact_cents ?? 0),
  );
  const highestRoi = sortedByRevenue[0]?.decision_id ?? null;
  const mostExpensive = sortedByRevenue.at(-1)?.decision_id ?? null;
  const sortedByCorrect = [...(outcomes ?? [])].sort(
    (a, b) => Number(b.actual_lift ?? 0) - Number(a.actual_lift ?? 0),
  );
  const best = sortedByCorrect[0]?.decision_id ?? null;
  const worst = sortedByCorrect.at(-1)?.decision_id ?? null;

  const { data: row } = await sb.from("pcie2_xai_evaluations").insert({
    window_days: 14,
    total_decisions: total,
    evaluated_decisions: evaluated,
    correct_predictions: correct,
    prediction_accuracy: accuracy,
    avg_prediction_error: avgErr,
    confidence_calibration: calibration,
    explainability_score: explain,
    evidence_completeness: evidenceComplete,
    decision_traceability: traceability,
    missing_evidence_pct: missing,
    decision_quality_score: quality,
    best_decision_id: best,
    worst_decision_id: worst,
    highest_roi_decision_id: highestRoi,
    most_expensive_mistake_id: mostExpensive,
    summary: { evalResult, avg_confidence: avgConf },
  }).select().maybeSingle();

  return { evaluation: row, evalResult };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = admin();
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? (req.method === "POST" ? "run" : "snapshot");

  try {
    if (action === "snapshot") {
      const snap = await loadSnapshot(sb);
      return new Response(JSON.stringify({ ok: true, ...snap }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "run") {
      const res = await runSelfEvaluation(sb);
      const snap = await loadSnapshot(sb);
      return new Response(JSON.stringify({ ok: true, ...res, ...snap }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: false, error: "unknown_action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});