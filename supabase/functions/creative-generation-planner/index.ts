import { admin, cors, jsonResp, fetchEligibleProducts, loadBudget } from "../_shared/creative-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = admin();
    const products = await fetchEligibleProducts(sb, 800);
    const budget = await loadBudget(sb);

    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: recent } = await sb.from("creative_assets").select("product_id, category_slug").gte("created_at", since);
    const prodCov = new Map<string, number>();
    const catCov = new Map<string, number>();
    for (const r of recent ?? []) {
      prodCov.set(r.product_id, (prodCov.get(r.product_id) ?? 0) + 1);
      if (r.category_slug) catCov.set(r.category_slug, (catCov.get(r.category_slug) ?? 0) + 1);
    }

    const ranked = products
      .map((p) => ({ ...p, score: 100 - (prodCov.get(p.id) ?? 0) * 12 - (catCov.get(p.category_slug ?? "") ?? 0) * 1 }))
      .sort((a, b) => b.score - a.score);

    const topProducts = ranked.slice(0, 30);
    const catSums = new Map<string, { count: number; total: number }>();
    for (const p of products) {
      const s = catSums.get(p.category_slug!) ?? { count: 0, total: 0 };
      s.count++; s.total++;
      catSums.set(p.category_slug!, s);
    }
    const categoryGaps = [...catSums.entries()]
      .map(([slug, s]) => ({ slug, recent: catCov.get(slug) ?? 0, product_count: s.count }))
      .sort((a, b) => a.recent - b.recent)
      .slice(0, 8);

    // cost estimates (no-AI free; AI ~ $0.20 per static creative @ nano-banana low)
    const plan = {
      mode: "planner",
      top_products: topProducts.map((p) => ({ id: p.id, title: p.title, category: p.category_slug, score: p.score })),
      category_gaps: categoryGaps,
      pinterest_candidates: topProducts.slice(0, 10).map((p) => p.id),
      ad_candidates: topProducts.slice(0, 10).map((p) => p.id),
      onsite_candidates: topProducts.slice(0, 10).map((p) => p.id),
      budget_cap_usd: budget.max_usd_per_run,
      max_per_run: budget.max_per_run,
      estimated_cost_no_ai_usd: 0,
      estimated_cost_ai_usd: Number((Math.min(budget.max_per_run, 20) * 0.2).toFixed(2)),
      eligible_products: products.length,
    };

    await sb.from("creative_generation_runs").insert({
      mode: "planner", dry_run: true, status: "done",
      requested: plan.max_per_run, plan,
      finished_at: new Date().toISOString(),
    });

    return jsonResp({ ok: true, plan });
  } catch (e) {
    return jsonResp({ ok: false, error: String(e) }, 500);
  }
});