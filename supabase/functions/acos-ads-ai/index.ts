import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("ads_ai"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const sb = svc();
  const { data: winners } = await sb.from("acos_winner_signals").select("product_id, signal_type, metric_value").gte("detected_at", new Date(Date.now()-24*3600_000).toISOString()).order("metric_value",{ascending:false}).limit(50);
  const rows = (winners ?? []).map((w) => ({
    product_id: w.product_id,
    pin_ref: null,
    action: "recommend_launch",
    current_budget: 0,
    recommended_budget: 5,
    reason: `winner: ${w.signal_type}`,
    evidence: { metric_value: w.metric_value },
    status: "pending",
  }));
  if (rows.length) { const { error } = await sb.from("acos_ads_recommendations").insert(rows); if (error) return err(error.message); }
  return ok({ recommendations: rows.length, mutationsAllowed: gate.mutationsAllowed });
});