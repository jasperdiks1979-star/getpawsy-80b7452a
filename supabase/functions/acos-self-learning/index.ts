import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("self_learning"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const sb = svc();
  const { data: winners } = await sb.from("acos_winner_signals").select("signal_type, metric_value").gte("detected_at", new Date(Date.now()-30*86400000).toISOString());
  const byType = new Map<string,{sum:number;n:number}>();
  for (const w of winners ?? []) { const c = byType.get(w.signal_type) ?? {sum:0,n:0}; c.sum += Number(w.metric_value ?? 0); c.n += 1; byType.set(w.signal_type, c); }
  const rows = Array.from(byType).map(([t, c]) => ({ dimension: "winner_axis", value: t, metric: "avg_signal", uplift: c.sum/Math.max(1,c.n), sample_size: c.n, confidence: Math.min(1, c.n/50), evidence: {} }));
  if (rows.length) { const { error } = await sb.from("acos_learning_insights").insert(rows); if (error) return err(error.message); }
  return ok({ insights: rows.length });
});