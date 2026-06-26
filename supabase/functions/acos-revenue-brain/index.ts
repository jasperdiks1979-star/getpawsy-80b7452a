import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("revenue_brain"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);

  const sb = svc();
  const url = new URL(req.url);
  const limit = Math.min(2000, Number(url.searchParams.get("limit") ?? 500));

  // Read recent product performance signals; reuse what exists today.
  const { data: products, error: pErr } = await sb
    .from("products")
    .select("id, sku, price, cost_price, us_stock, eu_stock, stock, slug")
    .limit(limit);
  if (pErr) return err(pErr.message);

  // Pull rough metrics from existing tables (best-effort, observation-only).
  const productIds = (products ?? []).map((p) => p.id);
  const { data: perf } = await sb
    .from("pinterest_pin_performance")
    .select("product_id, impressions, outbound_clicks, saves, revenue, ctr")
    .in("product_id", productIds)
    .gte("created_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString());

  const agg = new Map<string, { imp: number; clk: number; sav: number; rev: number }>();
  for (const r of perf ?? []) {
    const cur = agg.get(r.product_id) ?? { imp: 0, clk: 0, sav: 0, rev: 0 };
    cur.imp += Number(r.impressions ?? 0);
    cur.clk += Number(r.outbound_clicks ?? 0);
    cur.sav += Number(r.saves ?? 0);
    cur.rev += Number(r.revenue ?? 0);
    agg.set(r.product_id, cur);
  }

  const hour = new Date(); hour.setMinutes(0, 0, 0);
  const rows = (products ?? []).map((p) => {
    const a = agg.get(p.id) ?? { imp: 0, clk: 0, sav: 0, rev: 0 };
    const price = Number(p.price ?? 0);
    const cost = Number(p.cost_price ?? 0);
    const ctr = a.imp > 0 ? a.clk / a.imp : 0;
    const grossMargin = price > 0 ? (price - cost) / price : 0;
    const stock = Number(p.us_stock ?? 0) + Number(p.eu_stock ?? 0) + Number(p.stock ?? 0);
    const inventoryHealth = Math.min(1, stock / 50);
    return {
      product_id: p.id,
      observed_at: hour.toISOString(),
      impressions: a.imp,
      outbound_clicks: a.clk,
      ctr,
      saves: a.sav,
      revenue: a.rev,
      gross_profit: a.rev * grossMargin,
      gross_margin: grossMargin,
      net_margin: grossMargin - 0.05,
      aov: a.clk > 0 ? a.rev / Math.max(1, a.clk * 0.02) : 0,
      rpm: a.imp > 0 ? (a.rev / a.imp) * 1000 : 0,
      inventory_health: inventoryHealth,
      velocity: a.imp / 7,
      trend_score: Math.tanh((a.imp + a.sav * 5) / 1000),
      confidence: Math.min(1, a.imp / 500),
      source: { window_days: 7 },
    };
  });

  if (rows.length > 0) {
    const { error: uErr } = await sb.from("acos_product_metrics_hourly").upsert(rows, { onConflict: "product_id,observed_at" });
    if (uErr) return err(uErr.message);
  }

  return ok({ written: rows.length });
});