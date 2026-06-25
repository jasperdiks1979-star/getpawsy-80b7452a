import { admin, cors, jsonResp, fetchEligibleProducts } from "../_shared/creative-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = admin();
    const products = await fetchEligibleProducts(sb, 800);

    // 30-day pin coverage per product
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: recent } = await sb
      .from("creative_assets")
      .select("product_id, category_slug")
      .gte("created_at", since);
    const byProd = new Map<string, number>();
    const byCat = new Map<string, number>();
    for (const r of recent ?? []) {
      byProd.set(r.product_id, (byProd.get(r.product_id) ?? 0) + 1);
      if (r.category_slug) byCat.set(r.category_slug, (byCat.get(r.category_slug) ?? 0) + 1);
    }

    const scored = products.map((p) => {
      const coverage = byProd.get(p.id) ?? 0;
      const catCoverage = byCat.get(p.category_slug ?? "") ?? 0;
      // simple priority: lower coverage = higher priority; small bonus for category gap
      const freshness = Math.max(0, 100 - coverage * 15);
      const gap = Math.max(0, 50 - catCoverage * 2);
      const priority = Math.min(100, Math.round(freshness * 0.7 + gap * 0.6));
      return {
        product_id: p.id,
        product_title: p.title,
        category_slug: p.category_slug,
        hero_image: p.hero_image,
        slug: p.slug,
        recent_creatives: coverage,
        category_recent: catCoverage,
        priority_score: priority,
        recommended_type: coverage === 0 ? "pinterest_static" : "pinterest_static",
        recommended_daily_cap: 2,
      };
    });

    scored.sort((a, b) => b.priority_score - a.priority_score);
    return jsonResp({ ok: true, eligible_count: scored.length, scored: scored.slice(0, 200) });
  } catch (e) {
    return jsonResp({ ok: false, error: String(e) }, 500);
  }
});