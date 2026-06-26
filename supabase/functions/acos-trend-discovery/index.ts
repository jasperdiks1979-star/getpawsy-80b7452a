import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("trend_discovery"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const sb = svc();
  const { data: signals } = await sb.from("pinterest_trend_signals").select("topic, category, momentum, source").gte("created_at", new Date(Date.now()-7*86400000).toISOString()).limit(200);
  const rows = (signals ?? []).map((s) => ({
    source: s.source ?? "pinterest_trends",
    topic: s.topic,
    category: s.category,
    momentum: Number(s.momentum ?? 0),
    confidence: 0.6,
    suggested_products: [],
    suggested_campaigns: [],
    raw: s,
  }));
  if (rows.length) { const { error } = await sb.from("acos_trend_opportunities").insert(rows); if (error) return err(error.message); }
  return ok({ opportunities: rows.length });
});