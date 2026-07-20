// PCIE3 Diversity Planner — READ-ONLY planning layer.
// Reads pcie2_publish_queue + products + canonical published history,
// scores candidates for maximum catalog / board / category diversity
// and returns an ordered plan. NEVER writes. NEVER publishes.
// PCIE2 remains the sole certified publisher.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type WhatIf = {
  wave_size?: number;
  only_categories?: string[];
  skip_categories?: string[];
  only_species?: string[];
  high_margin_only?: boolean;
  maximize_diversity?: boolean;
};

type QueueRow = {
  id: string;
  product_id: string | null;
  product_slug: string | null;
  product_class: string | null;
  board_id: string | null;
  status: string;
  ci_score: number | null;
  created_at: string;
  meta: any;
};

type Product = {
  id: string;
  slug: string | null;
  name: string | null;
  category: string | null;
  primary_species: string | null;
  animal_type: string | null;
  price: number | null;
  margin_percent: number | null;
  pinterest_last_posted_at: string | null;
  pinterest_last_generated_at: string | null;
  created_at: string;
};

const WEIGHTS = {
  never_published: 300,
  category_underrepresented: 150,
  board_underrepresented: 120,
  high_margin: 100,
  high_ci: 100,
  organic_dna: 80,
  pinterest_opportunity: 80,
  freshness: 60,
  seasonality: 50,
  commercial: 50,
  visual_unique: 40,
  existing_impressions: -80,
  existing_variants: -120,
  recently_published: -250,
  recently_regenerated: -80,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { what_if?: WhatIf } = {};
  try { body = await req.json(); } catch { /* empty body allowed */ }
  const whatIf: WhatIf = body.what_if ?? {};

  try {
    // 1. Load pending queue candidates
    const { data: pendingRaw, error: qErr } = await supabase
      .from("pcie2_publish_queue")
      .select("id,product_id,product_slug,product_class,board_id,status,ci_score,created_at,meta")
      .in("status", ["pending", "queued", "ready"])
      .order("ci_score", { ascending: false })
      .limit(1000);
    if (qErr) throw qErr;
    const pending = (pendingRaw ?? []) as QueueRow[];

    // 2. Load published history (canonical: posted rows)
    const { data: postedRaw } = await supabase
      .from("pcie2_publish_queue")
      .select("product_id,board_id,product_class,published_at")
      .eq("status", "posted")
      .order("published_at", { ascending: false })
      .limit(5000);
    const posted = postedRaw ?? [];

    // 3. Product metadata for all candidate products
    const productIds = Array.from(new Set(pending.map(p => p.product_id).filter(Boolean))) as string[];
    const productMap = new Map<string, Product>();
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id,slug,name,category,primary_species,animal_type,price,margin_percent,pinterest_last_posted_at,pinterest_last_generated_at,created_at")
        .in("id", productIds);
      for (const p of (products ?? []) as Product[]) productMap.set(p.id, p);
    }

    // 4. Total catalog size for coverage %
    const { count: catalogTotal } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    // 5. Aggregate posted stats
    const pinsPerCategory = new Map<string, number>();
    const pinsPerBoard = new Map<string, number>();
    const pinsPerProduct = new Map<string, number>();
    const recentlyPublishedProductIds = new Set<string>();
    const now = Date.now();
    const DAY = 86_400_000;
    for (const r of posted) {
      const cat = r.product_class ?? "unknown";
      pinsPerCategory.set(cat, (pinsPerCategory.get(cat) ?? 0) + 1);
      if (r.board_id) pinsPerBoard.set(r.board_id, (pinsPerBoard.get(r.board_id) ?? 0) + 1);
      if (r.product_id) {
        pinsPerProduct.set(r.product_id, (pinsPerProduct.get(r.product_id) ?? 0) + 1);
        if (r.published_at && now - new Date(r.published_at).getTime() < 7 * DAY) {
          recentlyPublishedProductIds.add(r.product_id);
        }
      }
    }

    const totalPosted = posted.length || 1;
    const catAvg = pinsPerCategory.size ? totalPosted / pinsPerCategory.size : 0;
    const boardAvg = pinsPerBoard.size ? totalPosted / pinsPerBoard.size : 0;

    const uniquePublishedProducts = pinsPerProduct.size;
    const catalogCoveragePct = catalogTotal ? (uniquePublishedProducts / catalogTotal) * 100 : 0;

    // 5b. Live signal sources — Success DNA, Seasonality, Visual uniqueness
    // Success DNA: latest active organic DNA snapshot → similar_products
    const dnaMatchByProduct = new Map<string, number>();
    const dnaMatchByCategory = new Map<string, number>();
    try {
      const { data: dnaRow } = await supabase
        .from("organic_success_dna")
        .select("similar_products")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sims = (dnaRow?.similar_products ?? []) as Array<{ id?: string; category?: string; similarity?: number }>;
      for (const s of sims) {
        const sim = typeof s?.similarity === "number" ? s.similarity : 0;
        if (!sim) continue;
        if (s.id) dnaMatchByProduct.set(String(s.id), Math.max(dnaMatchByProduct.get(String(s.id)) ?? 0, sim));
        if (s.category) {
          const k = String(s.category).toLowerCase();
          dnaMatchByCategory.set(k, Math.max(dnaMatchByCategory.get(k) ?? 0, sim));
        }
      }
    } catch { /* signal is optional */ }

    // Seasonality: current + next 2 ISO weeks (US)
    const nowDate = new Date(now);
    const startOfYear = Date.UTC(nowDate.getUTCFullYear(), 0, 1);
    const currentWeek = Math.max(1, Math.ceil(((now - startOfYear) / DAY + 1) / 7));
    const seasonByCategory = new Map<string, { lift: number; confidence: number }>();
    try {
      const { data: seasonRows } = await supabase
        .from("mi_seasonal_forecasts")
        .select("category,expected_lift,confidence,week_of_year")
        .eq("market", "US")
        .in("week_of_year", [currentWeek, currentWeek + 1, currentWeek + 2]);
      for (const s of (seasonRows ?? []) as Array<{ category: string; expected_lift: number | string; confidence: number | string }>) {
        const key = String(s.category).toLowerCase();
        const lift = Number(s.expected_lift) || 0;
        const conf = Number(s.confidence) || 0;
        const cur = seasonByCategory.get(key);
        if (!cur || lift > cur.lift) seasonByCategory.set(key, { lift, confidence: conf });
      }
    } catch { /* signal is optional */ }

    // Visual uniqueness: prior DNA fingerprints per product (fewer = more novel)
    const fpCountByProduct = new Map<string, number>();
    if (productIds.length > 0) {
      try {
        const { data: fpRows } = await supabase
          .from("pcie2_dna_fingerprints")
          .select("product_id")
          .in("product_id", productIds);
        for (const r of (fpRows ?? []) as Array<{ product_id: string | null }>) {
          if (r.product_id) fpCountByProduct.set(r.product_id, (fpCountByProduct.get(r.product_id) ?? 0) + 1);
        }
      } catch { /* signal is optional */ }
    }

    // 6. Score each candidate
    type Scored = {
      queue_id: string;
      product_id: string | null;
      product_slug: string | null;
      board_id: string | null;
      category: string;
      species: string | null;
      margin_percent: number | null;
      ci_score: number | null;
      planning_score: number;
      planning_reason: string[];
      excluded: boolean;
      exclusion_reason?: string;
      components: Record<string, number>;
    };

    const scored: Scored[] = pending.map((row) => {
      const product = row.product_id ? productMap.get(row.product_id) : undefined;
      const category = row.product_class ?? product?.category ?? "unknown";
      const species = product?.primary_species ?? product?.animal_type ?? null;
      const boardId = row.board_id;

      const components: Record<string, number> = {};
      const reasons: string[] = [];

      const productPinCount = row.product_id ? (pinsPerProduct.get(row.product_id) ?? 0) : 0;
      if (productPinCount === 0) {
        components.never_published = WEIGHTS.never_published;
        reasons.push("never_published");
      }

      const catCount = pinsPerCategory.get(category) ?? 0;
      if (catCount < catAvg) {
        components.category_underrepresented = WEIGHTS.category_underrepresented;
        reasons.push("category_underrepresented");
      }

      const boardCount = boardId ? (pinsPerBoard.get(boardId) ?? 0) : 0;
      if (boardId && boardCount < boardAvg) {
        components.board_underrepresented = WEIGHTS.board_underrepresented;
        reasons.push("board_underrepresented");
      }

      const margin = product?.margin_percent ?? 0;
      if (margin >= 40) {
        components.high_margin = WEIGHTS.high_margin;
        reasons.push("high_margin");
      }

      const ci = row.ci_score ?? 0;
      if (ci >= 80) {
        components.high_ci = WEIGHTS.high_ci;
        reasons.push("high_ci");
      }

      // Organic Success DNA — product-level match wins; else category-level fallback.
      if (row.product_id && dnaMatchByProduct.has(row.product_id)) {
        const sim = dnaMatchByProduct.get(row.product_id)!;
        const pts = Math.round(WEIGHTS.organic_dna * Math.min(1, sim));
        if (pts > 0) {
          components.organic_dna = pts;
          reasons.push(`organic_dna_match:${sim.toFixed(2)}`);
        }
      } else {
        const catSim = dnaMatchByCategory.get(category.toLowerCase());
        if (catSim && catSim > 0) {
          const pts = Math.round(WEIGHTS.organic_dna * 0.5 * Math.min(1, catSim));
          if (pts > 0) {
            components.organic_dna = pts;
            reasons.push(`organic_dna_category:${catSim.toFixed(2)}`);
          }
        }
      }

      // Seasonality — US weekly forecast for this category (current + 2 weeks ahead).
      const season = seasonByCategory.get(category.toLowerCase());
      if (season && season.lift > 0) {
        const strength = Math.min(1, season.lift / 20) * Math.min(1, Math.max(0, season.confidence));
        const pts = Math.round(WEIGHTS.seasonality * strength);
        if (pts > 0) {
          components.seasonality = pts;
          reasons.push(`seasonal_lift:+${Number(season.lift).toFixed(1)}%`);
        }
      }

      // Visual uniqueness — fewer prior DNA fingerprints = fresher creative surface.
      const fpCount = row.product_id ? (fpCountByProduct.get(row.product_id) ?? 0) : 0;
      if (fpCount === 0) {
        components.visual_unique = WEIGHTS.visual_unique;
        reasons.push("no_prior_visual_dna");
      } else if (fpCount <= 2) {
        components.visual_unique = Math.round(WEIGHTS.visual_unique * 0.5);
        reasons.push(`low_visual_variants:${fpCount}`);
      }

      if (product?.created_at) {
        const ageDays = (now - new Date(product.created_at).getTime()) / DAY;
        if (ageDays < 30) {
          components.freshness = WEIGHTS.freshness;
          reasons.push("fresh_product");
        }
      }

      const price = product?.price ?? 0;
      if (price >= 50) {
        components.commercial = WEIGHTS.commercial;
        reasons.push("commercial_value");
      }

      // Penalties
      if (productPinCount >= 3) {
        components.existing_variants = WEIGHTS.existing_variants;
        reasons.push("existing_variants");
      }
      if (row.product_id && recentlyPublishedProductIds.has(row.product_id)) {
        components.recently_published = WEIGHTS.recently_published;
        reasons.push("recently_published_7d");
      }
      if (product?.pinterest_last_generated_at) {
        const ageH = (now - new Date(product.pinterest_last_generated_at).getTime()) / 3_600_000;
        if (ageH < 24) {
          components.recently_regenerated = WEIGHTS.recently_regenerated;
          reasons.push("recently_regenerated");
        }
      }

      const planning_score = Object.values(components).reduce((a, b) => a + b, 0);

      // What-if filters
      let excluded = false;
      let exclusion_reason: string | undefined;
      if (whatIf.only_categories?.length && !whatIf.only_categories.includes(category)) {
        excluded = true; exclusion_reason = `not in only_categories`;
      }
      if (!excluded && whatIf.skip_categories?.includes(category)) {
        excluded = true; exclusion_reason = `in skip_categories`;
      }
      if (!excluded && whatIf.only_species?.length && species && !whatIf.only_species.includes(species)) {
        excluded = true; exclusion_reason = `not in only_species`;
      }
      if (!excluded && whatIf.high_margin_only && margin < 40) {
        excluded = true; exclusion_reason = `margin < 40%`;
      }

      return {
        queue_id: row.id,
        product_id: row.product_id,
        product_slug: row.product_slug,
        board_id: boardId,
        category,
        species,
        margin_percent: margin,
        ci_score: ci,
        planning_score,
        planning_reason: reasons,
        excluded,
        exclusion_reason,
        components,
      };
    });

    // 7. Balanced ordering: category cap 20%, board cap 3, min 8 boards
    const eligible = scored.filter(s => !s.excluded).sort((a, b) => b.planning_score - a.planning_score);

    function buildWave(size: number) {
      const catCap = Math.max(1, Math.floor(size * 0.20));
      const boardCap = 3;
      const catCount = new Map<string, number>();
      const boardCount = new Map<string, number>();
      const productSeen = new Set<string>();
      const picked: Scored[] = [];
      const skippedReasons: Record<string, number> = {};

      for (const c of eligible) {
        if (picked.length >= size) break;
        if (c.product_id && productSeen.has(c.product_id)) {
          skippedReasons.duplicate_product = (skippedReasons.duplicate_product ?? 0) + 1;
          continue;
        }
        if ((catCount.get(c.category) ?? 0) >= catCap) {
          skippedReasons.category_cap = (skippedReasons.category_cap ?? 0) + 1;
          continue;
        }
        if (c.board_id && (boardCount.get(c.board_id) ?? 0) >= boardCap) {
          skippedReasons.board_cap = (skippedReasons.board_cap ?? 0) + 1;
          continue;
        }
        picked.push(c);
        catCount.set(c.category, (catCount.get(c.category) ?? 0) + 1);
        if (c.board_id) boardCount.set(c.board_id, (boardCount.get(c.board_id) ?? 0) + 1);
        if (c.product_id) productSeen.add(c.product_id);
      }

      const boardsUsed = boardCount.size;
      const categoriesUsed = catCount.size;
      const newProducts = picked.filter(p => p.product_id && !pinsPerProduct.has(p.product_id)).length;
      const coverageDelta = catalogTotal ? (newProducts / catalogTotal) * 100 : 0;
      const avgScore = picked.length
        ? picked.reduce((a, b) => a + b.planning_score, 0) / picked.length
        : 0;

      // Wave quality score: 0-100. Rewards board+category diversity + coverage growth.
      const boardDiv = Math.min(1, boardsUsed / 8);
      const catDiv = Math.min(1, categoriesUsed / 5);
      const coverageBoost = Math.min(1, newProducts / Math.max(1, size));
      const quality = Math.round((boardDiv * 40 + catDiv * 30 + coverageBoost * 30) * 100) / 100;

      return {
        size,
        picked_count: picked.length,
        boards_used: boardsUsed,
        categories_used: categoriesUsed,
        new_products: newProducts,
        coverage_delta_pct: Number(coverageDelta.toFixed(2)),
        avg_planning_score: Math.round(avgScore),
        wave_quality_score: quality,
        meets_board_minimum: boardsUsed >= 8,
        picks: picked,
        skipped_reasons: skippedReasons,
      };
    }

    const targetSize = whatIf.wave_size ?? 20;
    const simulations = [10, 20, 30].map(buildWave);
    const recommended = buildWave(targetSize);
    const best = [...simulations, recommended].sort((a, b) => b.wave_quality_score - a.wave_quality_score)[0];

    return new Response(JSON.stringify({
      ok: true,
      generated_at: new Date().toISOString(),
      mode: "READ_ONLY_PLANNING",
      publisher: "pcie2-publisher (unchanged)",
      coverage: {
        catalog_total: catalogTotal ?? 0,
        unique_products_published: uniquePublishedProducts,
        coverage_pct: Number(catalogCoveragePct.toFixed(2)),
        pins_per_category: Object.fromEntries(pinsPerCategory),
        pins_per_board_top: Object.fromEntries(
          Array.from(pinsPerBoard.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)
        ),
        boards_used_total: pinsPerBoard.size,
        categories_used_total: pinsPerCategory.size,
      },
      diversity: {
        board_diversity_score: Math.min(100, pinsPerBoard.size * 5),
        category_diversity_score: Math.min(100, pinsPerCategory.size * 10),
      },
      candidates_total: pending.length,
      candidates_eligible: eligible.length,
      candidates_excluded: scored.filter(s => s.excluded).length,
      top_recommended: eligible.slice(0, 100).map(s => ({
        queue_id: s.queue_id,
        product_id: s.product_id,
        product_slug: s.product_slug,
        board_id: s.board_id,
        category: s.category,
        species: s.species,
        planning_score: s.planning_score,
        planning_reason: s.planning_reason,
        components: s.components,
        ci_score: s.ci_score,
        margin_percent: s.margin_percent,
      })),
      excluded: scored.filter(s => s.excluded).slice(0, 50).map(s => ({
        queue_id: s.queue_id,
        product_slug: s.product_slug,
        category: s.category,
        exclusion_reason: s.exclusion_reason,
      })),
      simulations,
      recommended_wave: recommended,
      best_wave_size: best.size,
      what_if_applied: whatIf,
      safe_mode: true,
      note: "PCIE3 does not publish. Approve and hand off to pcie2-publisher.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});