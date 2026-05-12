import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(t => t.length >= 3);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Top recipes (by score, active)
    const { data: recipes } = await supabase
      .from("mi_creative_recipes")
      .select("id, name, hook_family, score")
      .eq("active", true)
      .order("score", { ascending: false })
      .limit(8);

    // 2. Top US trends
    const { data: trends } = await supabase
      .from("mi_trends")
      .select("id, term, category, score, momentum, season")
      .eq("market", "US")
      .order("score", { ascending: false })
      .limit(20);

    // 3. Active catalog
    const { data: products } = await supabase
      .from("products")
      .select("id, name, slug, category, primary_keyword, pinterest_ready")
      .eq("is_active", true)
      .limit(500);

    // 4. Recently used (last 14d) to avoid duplicates
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data: recentRecs } = await supabase
      .from("mi_recommendations")
      .select("evidence_refs")
      .eq("category", "next_creative")
      .gte("created_at", since);
    const usedKeys = new Set<string>();
    for (const r of recentRecs ?? []) {
      const refs = (r.evidence_refs ?? []) as any[];
      for (const e of refs) {
        if (e?.recipe_id && e?.product_id && e?.trend_id) {
          usedKeys.add(`${e.recipe_id}:${e.product_id}:${e.trend_id}`);
        }
      }
    }

    // 5. Cross-join scoring
    type Cand = {
      score: number;
      recipe: any; trend: any; product: any;
    };
    const cands: Cand[] = [];

    for (const trend of trends ?? []) {
      const trTokens = new Set(tokens(trend.term).concat(tokens(trend.category)));
      // find best matching products
      const productMatches = (products ?? []).map(p => {
        const pTokens = new Set(tokens(p.name).concat(tokens(p.primary_keyword), tokens(p.category)));
        let overlap = 0;
        for (const t of trTokens) if (pTokens.has(t)) overlap++;
        const catBoost = (p.category && trend.category && p.category.toLowerCase() === String(trend.category).toLowerCase()) ? 2 : 0;
        const pinBoost = p.pinterest_ready ? 1 : 0;
        return { product: p, fit: overlap + catBoost + pinBoost };
      }).filter(m => m.fit > 0)
        .sort((a, b) => b.fit - a.fit)
        .slice(0, 3);

      if (productMatches.length === 0) continue;

      for (const recipe of recipes ?? []) {
        for (const pm of productMatches) {
          const key = `${recipe.id}:${pm.product.id}:${trend.id}`;
          if (usedKeys.has(key)) continue;

          const recipeScore = Number(recipe.score) || 0;
          const trendScore = Number(trend.score) || 0;
          const momentum = Number(trend.momentum) || 0;
          const composite =
            (recipeScore * 0.4) +
            (trendScore * 0.3) +
            (momentum * 0.2) +
            (pm.fit * 0.1);

          cands.push({ score: composite, recipe, trend, product: pm.product });
        }
      }
    }

    cands.sort((a, b) => b.score - a.score);
    const top = cands.slice(0, 12);

    // 6. Insert as recommendations
    let inserted = 0;
    for (const c of top) {
      const confidence = Math.min(100, Math.round(c.score * 8));
      const title = `Pin/video: "${c.recipe.name}" → ${c.product.name}`;
      const body =
        `Trend: ${c.trend.term} (US, score ${Number(c.trend.score).toFixed(1)}, momentum ${Number(c.trend.momentum).toFixed(1)})\n` +
        `Recipe hook: ${c.recipe.hook_family ?? "—"} (recipe score ${Number(c.recipe.score).toFixed(2)})\n` +
        `Product: ${c.product.name} (/products/${c.product.slug})\n` +
        `Action: generate a US-native draft via Remix Engine using this recipe + product, then queue for Pinterest/TikTok.`;

      const { error } = await supabase.from("mi_recommendations").insert({
        title, body,
        category: "next_creative",
        market: "US",
        confidence,
        status: "new",
        evidence_refs: [{
          recipe_id: c.recipe.id,
          product_id: c.product.id,
          trend_id: c.trend.id,
          composite_score: Number(c.score.toFixed(3)),
        }],
      });
      if (!error) inserted++;
    }

    return new Response(JSON.stringify({
      ok: true,
      recipes_used: (recipes ?? []).length,
      trends_used: (trends ?? []).length,
      products_scanned: (products ?? []).length,
      candidates: cands.length,
      inserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});