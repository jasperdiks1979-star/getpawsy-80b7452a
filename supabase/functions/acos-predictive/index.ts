import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("predictive"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const sb = svc();
  const { data: m } = await sb.from("acos_product_metrics_hourly").select("product_id, revenue, observed_at").gte("observed_at", new Date(Date.now()-14*86400000).toISOString());
  const by = new Map<string, number[]>();
  for (const r of m ?? []) { const arr = by.get(r.product_id) ?? []; arr.push(Number(r.revenue ?? 0)); by.set(r.product_id, arr); }
  const rows: Array<Record<string,unknown>> = [];
  for (const [pid, arr] of by) {
    const avg = arr.reduce((s,n)=>s+n,0) / Math.max(1, arr.length);
    for (const [h, mult] of [["24h",1],["7d",7],["30d",30]] as Array<[string,number]>) {
      rows.push({ scope: "product", scope_ref: pid, metric: "revenue", horizon: h, point: avg*mult, lo: avg*mult*0.7, hi: avg*mult*1.3, confidence: Math.min(1, arr.length/24), method: "naive_mean_x_horizon" });
    }
  }
  const allRev = (m ?? []).reduce((s,r)=>s+Number(r.revenue ?? 0), 0);
  const dailyAvg = allRev / 14;
  for (const [h, mult] of [["24h",1],["7d",7],["30d",30]] as Array<[string,number]>) {
    rows.push({ scope: "platform", scope_ref: null, metric: "revenue", horizon: h, point: dailyAvg*mult, lo: dailyAvg*mult*0.6, hi: dailyAvg*mult*1.4, confidence: 0.6, method: "naive_mean_x_horizon" });
  }
  if (rows.length) { const { error } = await sb.from("acos_predictions").insert(rows); if (error) return err(error.message); }
  return ok({ forecasts: rows.length });
});