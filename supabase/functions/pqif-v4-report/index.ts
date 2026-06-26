// PQIF v4 — Report snapshot. Returns JSON summary used by the admin dashboard
// and downloadable as the JSON portion of the implementation report.
import { corsHeaders, svc, isPublishingBlocked } from "../_shared/pqif-v4-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const s = svc();
  const [runs, strategies, experiments, regen, retired, decisions, ranks] = await Promise.all([
    s.from("pqif_v4_runs").select("*").order("started_at", { ascending: false }).limit(20),
    s.from("pqif_v4_strategies").select("status").limit(2000),
    s.from("pqif_v4_experiments").select("status").limit(2000),
    s.from("pqif_v4_regeneration_queue").select("status").limit(5000),
    s.from("pqif_v4_retired_pins").select("id").limit(5000),
    s.from("pqif_v4_decisions").select("decision_type, verdict, created_at").order("created_at", { ascending: false }).limit(50),
    s.from("pqif_v4_product_ranks").select("product_id, revenue_potential, rank").order("rank").limit(20),
  ]);
  const tally = (rows: any[] | null, key: string) =>
    Object.fromEntries(Object.entries((rows ?? []).reduce<Record<string, number>>((a, r) => { const k = r[key] ?? "unknown"; a[k] = (a[k] ?? 0) + 1; return a; }, {})));
  const block = await isPublishingBlocked();
  return new Response(JSON.stringify({
    ok: true, generated_at: new Date().toISOString(),
    publishing: block,
    runs: runs.data ?? [],
    strategies_by_status: tally(strategies.data, "status"),
    experiments_by_status: tally(experiments.data, "status"),
    regeneration_by_status: tally(regen.data, "status"),
    retired_pins_total: (retired.data ?? []).length,
    recent_decisions: decisions.data ?? [],
    top_revenue_potential: ranks.data ?? [],
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});