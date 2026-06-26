import { corsHeaders, requireAdmin, svc, ok, err, canRun, logDecision } from "../_shared/acos-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("loser_detect"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const sb = svc();
  const { data: m } = await sb
    .from("acos_product_metrics_hourly")
    .select("product_id, ctr, saves, impressions, outbound_clicks, purchases, revenue")
    .gte("observed_at", new Date(Date.now() - 72 * 3600_000).toISOString());

  // Bucket by product
  const by = new Map<string, { imp: number; clk: number; sav: number; pur: number; rev: number; n: number }>();
  for (const r of m ?? []) {
    const c = by.get(r.product_id) ?? { imp: 0, clk: 0, sav: 0, pur: 0, rev: 0, n: 0 };
    c.imp += Number(r.impressions ?? 0);
    c.clk += Number(r.outbound_clicks ?? 0);
    c.sav += Number(r.saves ?? 0);
    c.pur += Number(r.purchases ?? 0);
    c.rev += Number(r.revenue ?? 0);
    c.n += 1;
    by.set(r.product_id, c);
  }
  const inserts: Array<Record<string, unknown>> = [];
  for (const [pid, c] of by) {
    if (c.imp >= 500 && c.clk === 0) inserts.push({ product_id: pid, signal_type: "no_clicks", metric_value: 0, consecutive_periods: c.n, recommendation: "rewrite titles/descriptions, regenerate creative", evidence: c });
    if (c.imp >= 500 && (c.clk / c.imp) < 0.002) inserts.push({ product_id: pid, signal_type: "poor_ctr", metric_value: c.clk / c.imp, consecutive_periods: c.n, recommendation: "rotate creative family, new AI imagery", evidence: c });
    if (c.clk >= 100 && c.pur === 0) inserts.push({ product_id: pid, signal_type: "no_sales", metric_value: 0, consecutive_periods: c.n, recommendation: "PDP audit, price check, trust signals", evidence: c });
  }
  if (inserts.length) {
    const { error: e } = await sb.from("acos_loser_signals").insert(inserts);
    if (e) return err(e.message);
  }
  await logDecision({ engine: "loser_detect", action: "detect", reason: `${inserts.length} loser signals` });
  return ok({ signals: inserts.length });
});