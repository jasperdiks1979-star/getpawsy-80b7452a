import { corsHeaders, requireAdmin, svc, ok, err, canRun, logDecision } from "../_shared/acos-common.ts";

const DIMENSIONS: Array<[string, string, "desc" | "asc"]> = [
  ["highest_ctr", "ctr", "desc"],
  ["highest_saves", "saves", "desc"],
  ["highest_revenue", "revenue", "desc"],
  ["highest_cvr", "cvr", "desc"],
  ["highest_roas", "roas", "desc"],
  ["highest_margin", "gross_margin", "desc"],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("winner_detect"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);

  const sb = svc();
  const { data: m } = await sb
    .from("acos_product_metrics_hourly")
    .select("product_id, ctr, saves, revenue, cvr, roas, gross_margin")
    .gte("observed_at", new Date(Date.now() - 24 * 3600_000).toISOString());

  const inserts: Array<Record<string, unknown>> = [];
  for (const [name, metric, dir] of DIMENSIONS) {
    const sorted = (m ?? []).slice().sort((a, b) => dir === "desc" ? Number(b[metric as keyof typeof b] ?? 0) - Number(a[metric as keyof typeof a] ?? 0) : Number(a[metric as keyof typeof a] ?? 0) - Number(b[metric as keyof typeof b] ?? 0));
    const top = sorted.slice(0, 10);
    top.forEach((r, i) => inserts.push({
      product_id: r.product_id,
      signal_type: name,
      metric_value: Number(r[metric as keyof typeof r] ?? 0),
      rank: i + 1,
      recommendation: "increase publishing priority, generate more variants, consider advertising",
      evidence: { metric, value: r[metric as keyof typeof r] },
    }));
  }
  if (inserts.length) {
    const { error: e } = await sb.from("acos_winner_signals").insert(inserts);
    if (e) return err(e.message);
  }
  await logDecision({ engine: "winner_detect", action: "detect", reason: `${inserts.length} winner signals` });
  return ok({ signals: inserts.length });
});