/**
 * Governance Operator — single edge function that:
 *   1. action=evaluate  → scans pending ledger rows older than the
 *      eval window, joins to revenue evidence (orders), and closes
 *      each row with actual_value / outcome / ROI via updateOutcome.
 *   2. action=briefing  → returns the one-page Daily Executive Briefing
 *      computed live from the ledger + orders. Evidence only.
 *
 * No new tables. No parallel logs. Reuses governance_decision_log.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { updateOutcome } from "../_shared/governanceLedger.ts";

const EVAL_WINDOW_HOURS = 24;

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function evaluatePending() {
  const sb = svc();
  const cutoff = new Date(Date.now() - EVAL_WINDOW_HOURS * 3600_000).toISOString();
  const { data: pending } = await sb
    .from("governance_decision_log")
    .select("id, source_engine, decision_type, expected_metric, expected_value, timestamp")
    .eq("learning_status", "pending")
    .lt("timestamp", cutoff)
    .limit(200);
  let closed = 0;
  for (const row of (pending as any[]) ?? []) {
    // Evidence: revenue in the window between decision and now.
    const { data: orders } = await sb
      .from("orders")
      .select("total_amount, created_at")
      .gte("created_at", row.timestamp)
      .lte("created_at", new Date().toISOString());
    const actual = (orders ?? []).reduce((s: number, o: any) => s + Number(o.total_amount ?? 0), 0);
    const expected = Number(row.expected_value ?? 0);
    const outcome = expected === 0 ? "neutral" : actual >= expected * 0.8 ? "success" : actual >= expected * 0.4 ? "partial" : "failure";
    const roi = expected > 0 ? actual / expected : null;
    await updateOutcome({
      id: row.id,
      actualMetric: row.expected_metric ?? "revenue_cents",
      actualValue: actual,
      outcome,
      roi: roi ?? undefined,
      learningStatus: "evaluated",
    });
    closed++;
  }
  return { closed, scanned: (pending ?? []).length };
}

async function briefing() {
  const sb = svc();
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ data: recent }, { data: evaluated }, { data: orders7d }] = await Promise.all([
    sb.from("governance_decision_log").select("source_engine, decision_type, expected_value, confidence, timestamp").gte("timestamp", since7d).order("timestamp", { ascending: false }).limit(50),
    sb.from("governance_decision_log").select("expected_value, actual_value, outcome, roi, source_engine").eq("learning_status", "evaluated").gte("timestamp", since30d),
    sb.from("orders").select("total_amount, created_at").gte("created_at", since7d),
  ]);
  const evals = (evaluated as any[]) ?? [];
  const successCount = evals.filter((r) => r.outcome === "success").length;
  const accuracy = evals.length ? successCount / evals.length : 0;
  const revenue7d = (orders7d ?? []).reduce((s: number, o: any) => s + Number(o.total_amount ?? 0), 0);
  const seatScores: Record<string, { n: number; success: number }> = {};
  for (const r of evals) {
    const k = r.source_engine ?? "unknown";
    seatScores[k] ??= { n: 0, success: 0 };
    seatScores[k].n++;
    if (r.outcome === "success") seatScores[k].success++;
  }
  return {
    generated_at: new Date().toISOString(),
    decisions_7d: (recent ?? []).length,
    decisions_evaluated_30d: evals.length,
    prediction_accuracy: accuracy,
    revenue_7d_cents: revenue7d,
    engine_calibration: Object.fromEntries(
      Object.entries(seatScores).map(([k, v]) => [k, { decisions: v.n, accuracy: v.n ? v.success / v.n : 0 }]),
    ),
    top_recent: (recent ?? []).slice(0, 10),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "evaluate";
    const result = action === "briefing" ? await briefing() : await evaluatePending();
    return new Response(JSON.stringify({ ok: true, action, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});