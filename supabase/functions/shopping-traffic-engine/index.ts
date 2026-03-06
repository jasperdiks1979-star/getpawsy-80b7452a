import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// High search demand categories
const HIGH_DEMAND_CATEGORIES = [
  "dog toys", "dog carriers", "cat litter", "cat toys", "pet beds",
  "dog beds", "dog training", "cat scratching", "dog harness", "dog leash",
  "cat tree", "dog crate", "pet stroller", "dog bowl", "cat feeder",
];

// Price sweet spot for Google Shopping
const PRICE_SWEET_SPOT = { min: 15, max: 60 };

// Popular high-converting categories
const POPULAR_CATEGORIES = [
  "toys", "carriers", "beds", "training", "litter", "scratching",
  "harness", "leash", "stroller", "bowl", "feeder", "crate",
];

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  cost_price: number | null;
  category: string | null;
  subcategory: string | null;
  image_url: string | null;
  additional_images: string[] | null;
  weight: number | null;
  stock: number | null;
  description: string | null;
  product_type: string | null;
  google_product_category: string | null;
  custom_label_0: string | null;
  species: string | null;
}

interface ScoredProduct {
  id: string;
  name: string;
  price: number;
  category: string | null;
  visibilityScore: number;
  bestsellerScore: number;
  demandScore: number;
  custom_label_5: string | null;
  custom_label_6: string | null;
  custom_label_7: string | null;
  reasons: string[];
}

function scoreVisibility(p: Product): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Price competitiveness (sweet spot $15-$60)
  if (p.price >= PRICE_SWEET_SPOT.min && p.price <= PRICE_SWEET_SPOT.max) {
    score += 3;
    reasons.push("price_sweet_spot");
  } else if (p.price > 0 && p.price < PRICE_SWEET_SPOT.min) {
    score += 1;
    reasons.push("low_price");
  }

  // Image quality proxy: has image + additional images
  if (p.image_url && p.image_url.length > 10) {
    score += 2;
    reasons.push("has_image");
  }
  if (p.additional_images && p.additional_images.length >= 2) {
    score += 2;
    reasons.push("multiple_images");
  }

  // Category demand
  const nameLower = (p.name || "").toLowerCase();
  const catLower = (p.category || "").toLowerCase();
  const subCatLower = (p.subcategory || "").toLowerCase();
  const combined = `${nameLower} ${catLower} ${subCatLower}`;
  
  if (HIGH_DEMAND_CATEGORIES.some(c => combined.includes(c))) {
    score += 3;
    reasons.push("high_demand_category");
  }

  // Good title (starts with keyword, reasonable length)
  if (p.name && p.name.length >= 20 && p.name.length <= 80) {
    score += 1;
    reasons.push("good_title_length");
  }

  // Has product_type and google_product_category already
  if (p.product_type) { score += 1; reasons.push("has_product_type"); }
  if (p.google_product_category) { score += 1; reasons.push("has_google_category"); }

  // Light weight = cheaper shipping = better for Shopping
  if (p.weight && p.weight < 2000) {
    score += 1;
    reasons.push("lightweight");
  }

  // In stock
  if (p.stock && p.stock > 0) {
    score += 1;
    reasons.push("in_stock");
  }

  return { score, reasons };
}

function scoreBestseller(p: Product): number {
  let score = 0;

  // Mid-range price ($15-$50)
  if (p.price >= 15 && p.price <= 50) score += 3;
  else if (p.price > 50 && p.price <= 80) score += 1;

  // Popular category
  const combined = `${(p.name || "").toLowerCase()} ${(p.category || "").toLowerCase()} ${(p.subcategory || "").toLowerCase()}`;
  if (POPULAR_CATEGORIES.some(c => combined.includes(c))) score += 3;

  // Good title
  if (p.name && p.name.length >= 15 && p.name.length <= 80) score += 2;

  // Has clear image
  if (p.image_url && p.image_url.length > 10) score += 2;
  if (p.additional_images && p.additional_images.length >= 1) score += 1;

  // Has structured data
  if (p.product_type) score += 1;

  return score;
}

function scoreDemand(p: Product): number {
  let score = 0;
  const combined = `${(p.name || "").toLowerCase()} ${(p.category || "").toLowerCase()} ${(p.subcategory || "").toLowerCase()} ${(p.product_type || "").toLowerCase()}`;

  // Direct high-demand category match
  for (const cat of HIGH_DEMAND_CATEGORIES) {
    if (combined.includes(cat)) {
      score += 3;
      break;
    }
  }

  // Dog/cat specific boost (these have higher Shopping volume)
  const animal = (p.custom_label_0 || p.species || "").toLowerCase();
  if (animal === "dog") score += 2;
  else if (animal === "cat") score += 1;

  // Price range that converts well
  if (p.price >= 10 && p.price <= 70) score += 1;

  return score;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;
    const limit = body.limit || 400;

    // Fetch active products
    const { data: products, error: fetchErr } = await supabase
      .from("products")
      .select("id, name, slug, price, cost_price, category, image_url, additional_images, weight, stock, description, product_type, google_product_category, custom_label_0, species")
      .eq("is_active", true)
      .limit(limit);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ ok: true, totalProducts: 0, message: "No active products found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scored: ScoredProduct[] = [];
    let highVisCount = 0, bestsellerCount = 0, highDemandCount = 0;

    for (const p of products) {
      const { score: visScore, reasons } = scoreVisibility(p);
      const bsScore = scoreBestseller(p);
      const demandScore = scoreDemand(p);

      const label5 = visScore >= 8 ? "high_visibility" : null;
      const label6 = bsScore >= 7 ? "bestseller_candidate" : null;
      const label7 = demandScore >= 4 ? "high_search_demand" : null;

      if (label5) highVisCount++;
      if (label6) bestsellerCount++;
      if (label7) highDemandCount++;

      scored.push({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category,
        visibilityScore: visScore,
        bestsellerScore: bsScore,
        demandScore: demandScore,
        custom_label_5: label5,
        custom_label_6: label6,
        custom_label_7: label7,
        reasons,
      });
    }

    // Sort by combined score for sampling
    scored.sort((a, b) => (b.visibilityScore + b.bestsellerScore + b.demandScore) - (a.visibilityScore + a.bestsellerScore + a.demandScore));

    let updatedCount = 0;
    let errorCount = 0;

    if (!dryRun) {
      // Batch update in groups of 50
      for (let i = 0; i < scored.length; i += 50) {
        const batch = scored.slice(i, i + 50);
        const updates = batch.map(s => 
          supabase
            .from("products")
            .update({
              custom_label_5: s.custom_label_5,
              custom_label_6: s.custom_label_6,
              custom_label_7: s.custom_label_7,
            })
            .eq("id", s.id)
        );

        const results = await Promise.allSettled(updates);
        for (const r of results) {
          if (r.status === "fulfilled" && !r.value.error) {
            updatedCount++;
          } else {
            errorCount++;
          }
        }
      }
    }

    // Top 5 samples for display
    const samples = scored.slice(0, 5).map(s => ({
      id: s.id,
      name: s.name,
      price: s.price,
      category: s.category,
      visibilityScore: s.visibilityScore,
      bestsellerScore: s.bestsellerScore,
      demandScore: s.demandScore,
      custom_label_5: s.custom_label_5,
      custom_label_6: s.custom_label_6,
      custom_label_7: s.custom_label_7,
      reasons: s.reasons,
    }));

    return new Response(JSON.stringify({
      ok: true,
      dryRun,
      totalProducts: products.length,
      highVisibilityCount: highVisCount,
      bestsellerCandidateCount: bestsellerCount,
      highSearchDemandCount: highDemandCount,
      updatedCount: dryRun ? 0 : updatedCount,
      errorCount,
      samples,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("shopping-traffic-engine error:", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
