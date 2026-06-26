import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";

function categorize(score: number): string {
  if (score >= 85) return "champion";
  if (score >= 75) return "scale_now";
  if (score >= 60) return "growing";
  if (score >= 45) return "stable";
  if (score >= 30) return "needs_improvement";
  if (score >= 15) return "low_priority";
  return "archive_candidate";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("score_engine"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);

  const sb = svc();
  const { data: metrics } = await sb
    .from("acos_product_metrics_hourly")
    .select("product_id, ctr, saves, revenue, gross_margin, inventory_health, trend_score, velocity, confidence")
    .gte("observed_at", new Date(Date.now() - 24 * 3600_000).toISOString());

  const byProduct = new Map<string, { ctr: number; saves: number; rev: number; gm: number; inv: number; trend: number; vel: number; conf: number; n: number }>();
  for (const m of metrics ?? []) {
    const cur = byProduct.get(m.product_id) ?? { ctr: 0, saves: 0, rev: 0, gm: 0, inv: 0, trend: 0, vel: 0, conf: 0, n: 0 };
    cur.ctr += Number(m.ctr ?? 0);
    cur.saves += Number(m.saves ?? 0);
    cur.rev += Number(m.revenue ?? 0);
    cur.gm += Number(m.gross_margin ?? 0);
    cur.inv += Number(m.inventory_health ?? 0);
    cur.trend += Number(m.trend_score ?? 0);
    cur.vel += Number(m.velocity ?? 0);
    cur.conf += Number(m.confidence ?? 0);
    cur.n += 1;
    byProduct.set(m.product_id, cur);
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const [pid, a] of byProduct) {
    const n = Math.max(1, a.n);
    const components = {
      pinterest_engagement: Math.min(100, (a.ctr / n) * 5000),
      traffic_quality: Math.min(100, (a.saves / n) * 10),
      purchase_rate: Math.min(100, Math.log10(1 + a.rev) * 20),
      profit_margin: Math.min(100, (a.gm / n) * 100),
      inventory: Math.min(100, (a.inv / n) * 100),
      trend: Math.min(100, (a.trend / n) * 100),
      velocity: Math.min(100, (a.vel / n) * 2),
      confidence: Math.min(100, (a.conf / n) * 100),
    };
    const weights: Record<string, number> = { pinterest_engagement: 0.18, traffic_quality: 0.10, purchase_rate: 0.20, profit_margin: 0.22, inventory: 0.10, trend: 0.10, velocity: 0.05, confidence: 0.05 };
    const score = Object.entries(components).reduce((s, [k, v]) => s + (weights[k] ?? 0) * Number(v), 0);
    rows.push({ product_id: pid, score, category: categorize(score), components, reasons: [] });
  }
  if (rows.length) {
    const { error: e } = await sb.from("acos_product_scores").insert(rows);
    if (e) return err(e.message);
  }
  return ok({ scored: rows.length });
});