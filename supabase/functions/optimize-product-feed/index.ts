import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Compliance banned words ──────────────────────────────────────────
const BANNED_WORDS = [
  "best", "ultimate", "guaranteed", "free gift", "limited time",
  "only x left", "only \\d+ left", "4\\.9 stars", "5 stars",
  "hassle-free", "vet-approved", "miracle", "revolutionary",
  "unbeatable", "#1", "number one", "top rated",
];
const BANNED_RE = new RegExp(BANNED_WORDS.join("|"), "gi");

// ── Product type detection ───────────────────────────────────────────
function detectProductType(name: string, category: string | null): string {
  const t = `${name} ${category || ""}`.toLowerCase();
  if (t.includes("car") && (t.includes("seat") || t.includes("bed"))) return "Dog Car Bed";
  if (t.includes("tree") || t.includes("condo") || t.includes("tower")) return "Cat Tree";
  if (t.includes("litter")) return "Litter Box";
  if (t.includes("carrier") || t.includes("backpack")) return "Pet Carrier";
  if (t.includes("stroller")) return "Pet Stroller";
  if (t.includes("crate") || t.includes("kennel")) return "Dog Crate";
  if (t.includes("scratch")) return "Cat Scratching Post";
  if (t.includes("bed") || t.includes("cot") || t.includes("cooling")) return "Dog Bed";
  if (t.includes("harness") || t.includes("collar") || t.includes("leash")) return "Dog Harness";
  if (t.includes("bowl") || t.includes("feeder") || t.includes("fountain")) return "Pet Feeder";
  if (t.includes("gate")) return "Dog Safety Gate";
  if (t.includes("house") && t.includes("cat")) return "Cat House";
  if (t.includes("house")) return "Pet House";
  if (t.includes("groom")) return "Pet Grooming Tool";
  if (t.includes("toy")) return "Pet Toy";
  return "Pet Supply";
}

// ── Weight validation ────────────────────────────────────────────────
function validateWeight(weight: number | null, productType: string): number | null {
  const w = weight || 0;
  if (w >= 1) return null; // weight is fine

  // Auto-correct underweight for heavy product types
  if (productType === "Litter Box" && w < 1) return 7;
  if (productType === "Cat Tree" && w < 1) return 12;
  if (productType === "Dog Crate" && w < 1) return 8;
  if (productType === "Pet House" && w < 1) return 6;
  if (productType === "Cat House" && w < 1) return 5;
  return null;
}

// ── Title rewrite (deterministic, no AI needed) ──────────────────────
function rewriteTitle(name: string, category: string | null): string {
  const productType = detectProductType(name, category);
  const combined = `${name} ${category || ""}`.toLowerCase();

  // Extract useful keywords from existing name
  const features: string[] = [];
  if (combined.includes("waterproof")) features.push("Waterproof");
  if (combined.includes("elevated")) features.push("Elevated");
  if (combined.includes("enclosed")) features.push("Enclosed");
  if (combined.includes("self-clean") || combined.includes("self clean") || combined.includes("automatic")) features.push("Self-Cleaning");
  if (combined.includes("app control") || combined.includes("smart")) features.push("App Control");
  if (combined.includes("orthopedic") || combined.includes("memory foam")) features.push("Orthopedic");
  if (combined.includes("foldable") || combined.includes("collapsible") || combined.includes("portable")) features.push("Portable");
  if (combined.includes("adjustable")) features.push("Adjustable");
  if (combined.includes("multi-level") || combined.includes("multi level")) features.push("Multi-Level");
  if (combined.includes("scratching")) features.push("with Scratching Posts");
  if (combined.includes("breathable") || combined.includes("ventilat")) features.push("Breathable");
  if (combined.includes("cooling")) features.push("Cooling");
  if (combined.includes("travel")) features.push("Travel");
  if (combined.includes("rear seat") || combined.includes("back seat")) features.push("for Back Seat");
  if (combined.includes("large")) features.push("for Large Pets");
  if (combined.includes("kitten")) features.push("for Kittens");
  if (combined.includes("senior") || combined.includes("elderly")) features.push("for Senior Pets");
  if (combined.includes("indoor")) features.push("Indoor");
  if (combined.includes("outdoor")) features.push("Outdoor");

  // Deduplicate
  const uniqueFeatures = [...new Set(features)];

  // Build title: [Product Type] – [Features] (US Shipping)
  let title = productType;
  if (uniqueFeatures.length > 0) {
    title += " – " + uniqueFeatures.slice(0, 3).join(", ");
  }

  // Add US Shipping if space allows
  if (title.length < 130) {
    title += " (US Shipping)";
  }

  // Strip any banned words that leaked through
  title = title.replace(BANNED_RE, "").replace(/\s{2,}/g, " ").trim();

  return title.slice(0, 150);
}

// ── Description rewrite (template-based, compliant) ──────────────────
function rewriteDescription(name: string, category: string | null): string {
  const productType = detectProductType(name, category).toLowerCase();

  return `Designed for comfort and everyday use, this ${productType} helps improve your pet's environment at home or during travel.

✔ Practical and easy to use
✔ Durable materials
✔ Suitable for daily use

Ships to customers across the United States. Estimated delivery: 5–10 business days.`;
}

// ── Price optimization ───────────────────────────────────────────────
function optimizePrice(price: number): number | null {
  if (price >= 60 && price <= 70) return 59.99;
  if (price >= 80 && price <= 100) return 79.99;
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Parse optional body for single-product optimization
    let productIds: string[] | null = null;
    try {
      const body = await req.json();
      if (body.product_ids && Array.isArray(body.product_ids)) {
        productIds = body.product_ids;
      } else if (body.product_id) {
        productIds = [body.product_id];
      }
    } catch {
      // No body = optimize all products
    }

    // Fetch products
    let query = supabase
      .from("products")
      .select("id, name, description, category, price, weight, is_active")
      .eq("is_active", true);

    if (productIds && productIds.length > 0) {
      query = query.in("id", productIds);
    }

    const { data: products, error } = await query.limit(1000);
    if (error) throw new Error(`DB query failed: ${error.message}`);
    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, optimized: 0, message: "No products to optimize" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let optimized = 0;
    let weightFixed = 0;
    let priceOptimized = 0;
    const results: Array<{ id: string; title: string; priceChange?: number }> = [];

    for (const p of products) {
      const newTitle = rewriteTitle(p.name, p.category);
      const newDesc = rewriteDescription(p.name, p.category);
      const productType = detectProductType(p.name, p.category);

      const updates: Record<string, unknown> = {
        optimized_title: newTitle,
        optimized_description: newDesc,
      };

      // Weight validation
      const correctedWeight = validateWeight(p.weight, productType);
      if (correctedWeight !== null) {
        updates.weight = correctedWeight;
        weightFixed++;
      }

      // Price optimization (optional)
      const newPrice = optimizePrice(p.price);
      if (newPrice !== null) {
        updates.price = newPrice;
        priceOptimized++;
      }

      const { error: updateError } = await supabase
        .from("products")
        .update(updates)
        .eq("id", p.id);

      if (!updateError) {
        optimized++;
        results.push({
          id: p.id,
          title: newTitle,
          ...(newPrice ? { priceChange: newPrice } : {}),
        });
      } else {
        console.error(`Failed to update product ${p.id}:`, updateError.message);
      }
    }

    // Also upsert into shopping_optimizations for the merchant feed
    for (const p of products) {
      const newTitle = rewriteTitle(p.name, p.category);
      const newDesc = rewriteDescription(p.name, p.category);

      await supabase
        .from("shopping_optimizations")
        .upsert({
          product_id: p.id,
          original_title: p.name,
          optimized_title: newTitle,
          original_description: (p.description || "").slice(0, 5000),
          optimized_description: newDesc,
          optimization_score: 85,
        }, { onConflict: "product_id" });
    }

    console.log(`Optimized ${optimized} products, fixed ${weightFixed} weights, adjusted ${priceOptimized} prices`);

    return new Response(
      JSON.stringify({
        ok: true,
        optimized,
        weightFixed,
        priceOptimized,
        total: products.length,
        results: results.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("optimize-product-feed error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
