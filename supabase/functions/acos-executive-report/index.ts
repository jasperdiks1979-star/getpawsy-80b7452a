import { corsHeaders, requireAdmin, svc, ok } from "../_shared/acos-common.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const sb = svc();
  const [winners, losers, scores, preds, decisions, runs] = await Promise.all([
    sb.from("acos_winner_signals").select("product_id, signal_type, metric_value").order("detected_at",{ascending:false}).limit(20),
    sb.from("acos_loser_signals").select("product_id, signal_type").order("detected_at",{ascending:false}).limit(20),
    sb.from("acos_product_scores").select("product_id, score, category").order("score",{ascending:false}).limit(20),
    sb.from("acos_predictions").select("scope, metric, horizon, point, lo, hi").eq("scope","platform"),
    sb.from("acos_decisions").select("engine, action, status, created_at").order("created_at",{ascending:false}).limit(50),
    sb.from("acos_orchestrator_runs").select("cadence,status,started_at,finished_at,duration_ms").order("started_at",{ascending:false}).limit(10),
  ]);
  return ok({ generated_at: new Date().toISOString(), winners: winners.data, losers: losers.data, top_products: scores.data, forecasts: preds.data, decisions: decisions.data, runs: runs.data });
});