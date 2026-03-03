import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Google Product Taxonomy — comprehensive pet supplies mapping
const TAXONOMY: Record<string, { id: number; path: string }> = {
  "cat toy":        { id: 5019, path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys" },
  "cat bed":        { id: 5008, path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Beds" },
  "cat tree":       { id: 5020, path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture" },
  "cat litter":     { id: 5011, path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter" },
  "cat collar":     { id: 5015, path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Collars & Harnesses" },
  "cat feeder":     { id: 5009, path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Feeding Supplies" },
  "cat scratcher":  { id: 5020, path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture" },
  "dog toy":        { id: 5004, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys" },
  "dog bed":        { id: 4985, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds" },
  "dog collar":     { id: 5001, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leashes" },
  "dog leash":      { id: 5002, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leashes" },
  "dog harness":    { id: 5001, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leashes" },
  "dog training":   { id: 5003, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Training Aids" },
  "dog bowl":       { id: 8069, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Feeding Supplies" },
  "dog crate":      { id: 4986, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Kennels & Pens" },
  "dog grooming":   { id: 4997, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Grooming Supplies" },
  "pet carrier":    { id: 6978, path: "Animals & Pet Supplies > Pet Supplies > Pet Carriers & Crates" },
  "pet bowl":       { id: 8069, path: "Animals & Pet Supplies > Pet Supplies > Pet Feeding Supplies" },
  "pet bed":        { id: 4516, path: "Animals & Pet Supplies > Pet Supplies > Pet Beds" },
  "pet grooming":   { id: 4523, path: "Animals & Pet Supplies > Pet Supplies > Pet Grooming Supplies" },
  "anti bark":      { id: 5003, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Training Aids" },
  "bark control":   { id: 5003, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Training Aids" },
  "potty":          { id: 5003, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Training Aids" },
  "litter box":     { id: 5012, path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter Box Liners" },
  "scratching post":{ id: 5020, path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture" },
  "dog":            { id: 4985, path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies" },
  "cat":            { id: 5007, path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies" },
  "pet":            { id: 2,    path: "Animals & Pet Supplies > Pet Supplies" },
};

function mapTaxonomy(name: string, category: string | null): { id: number; path: string } | null {
  const text = `${name} ${category || ""}`.toLowerCase();
  const sorted = Object.entries(TAXONOMY).sort((a, b) => b[0].length - a[0].length);
  for (const [key, val] of sorted) {
    if (text.includes(key)) return val;
  }
  return null;
}

function detectPetType(name: string, category: string | null): string {
  const text = `${name} ${category || ""}`.toLowerCase();
  if (text.includes("cat") || text.includes("kitten") || text.includes("feline")) return "cat";
  if (text.includes("dog") || text.includes("puppy") || text.includes("canine")) return "dog";
  return "pet";
}

function buildProductType(name: string, category: string | null): string {
  const pet = detectPetType(name, category);
  const petLabel = pet === "cat" ? "Cat" : pet === "dog" ? "Dog" : "Pet";
  const text = `${name} ${category || ""}`.toLowerCase();
  
  if (text.includes("toy")) return `Pet Supplies > ${petLabel} Toys > Interactive Toys`;
  if (text.includes("training") || text.includes("leash")) return `Pet Supplies > ${petLabel} Training > Training Tools`;
  if (text.includes("bed")) return `Pet Supplies > ${petLabel} Beds`;
  if (text.includes("collar") || text.includes("harness")) return `Pet Supplies > ${petLabel} Accessories > Collars & Harnesses`;
  if (text.includes("bowl") || text.includes("feeder")) return `Pet Supplies > ${petLabel} Feeding`;
  if (text.includes("grooming") || text.includes("brush")) return `Pet Supplies > ${petLabel} Grooming`;
  if (text.includes("tree") || text.includes("scratcher")) return `Pet Supplies > ${petLabel} Furniture`;
  return `Pet Supplies > ${petLabel} Supplies`;
}

const KEYWORD_BANK: Record<string, string[]> = {
  "cat_toy": ["interactive cat toy", "cat enrichment toy", "indoor cat toy", "cat stimulation toy", "cat play toy"],
  "cat_bed": ["cozy cat bed", "cat sleeping bed", "indoor cat bed", "cat napping spot"],
  "cat_furniture": ["cat tree for small spaces", "modern cat tree", "cat scratching post", "cat climbing tower"],
  "dog_toy": ["interactive dog toy", "chew resistant dog toy", "dog enrichment toy", "durable dog toy"],
  "dog_training": ["dog training tool", "no pull dog harness", "dog training aid", "puppy training tool"],
  "dog_bed": ["orthopedic dog bed", "comfortable dog bed", "washable dog bed"],
  "dog_collar": ["adjustable dog collar", "dog walking leash", "comfortable dog harness"],
  "pet_general": ["pet supplies", "pet accessories", "pet product"],
};

function getKeywords(name: string, category: string | null): string[] {
  const pet = detectPetType(name, category);
  const text = `${name} ${category || ""}`.toLowerCase();
  
  let typeKey = "general";
  if (text.includes("toy")) typeKey = "toy";
  else if (text.includes("training") || text.includes("harness") || text.includes("leash")) typeKey = "training";
  else if (text.includes("bed")) typeKey = "bed";
  else if (text.includes("collar")) typeKey = "collar";
  else if (text.includes("tree") || text.includes("scratcher")) typeKey = "furniture";
  
  const key = `${pet}_${typeKey}`;
  return KEYWORD_BANK[key] || KEYWORD_BANK["pet_general"] || [];
}

// ── Visibility Boost Scoring Engine ──
// Weights: price competitiveness 30%, image quality 20%, keyword demand 25%, category popularity 25%
const HIGH_DEMAND_KEYWORDS = [
  "interactive", "enrichment", "training", "orthopedic", "no pull", "harness",
  "chew resistant", "calming", "self cleaning", "automatic", "waterproof",
  "indestructible", "elevated", "slow feeder", "puzzle", "scratch",
];

const HIGH_POP_CATEGORIES = [
  "cat toy", "dog toy", "dog bed", "cat bed", "dog harness", "cat tree",
  "dog leash", "dog training", "litter box", "pet carrier", "dog collar",
];

function calcBoostScore(p: { name: string; price: number; compare_at_price: number | null; category: string | null; image_url: string | null }): number {
  const text = `${p.name} ${p.category || ""}`.toLowerCase();

  // Price competitiveness (0–1): sweet spot $15–$70
  let priceScore = 0.3;
  if (p.price >= 15 && p.price <= 70) priceScore = 1;
  else if (p.price > 70 && p.price <= 120) priceScore = 0.6;
  else if (p.price > 120) priceScore = 0.3;
  // Bonus for margin availability
  if (p.compare_at_price && p.compare_at_price > p.price) {
    priceScore = Math.min(1, priceScore + 0.15);
  }

  // Image quality proxy (0–1): has image = 0.7, CDN image = 1
  let imageScore = 0;
  if (p.image_url) {
    imageScore = 0.7;
    if (p.image_url.includes("cdn") || p.image_url.includes("cjdropshipping") || p.image_url.startsWith("https://")) {
      imageScore = 1;
    }
  }

  // Keyword demand (0–1)
  const kwMatches = HIGH_DEMAND_KEYWORDS.filter(kw => text.includes(kw));
  const kwScore = Math.min(1, kwMatches.length * 0.25);

  // Category popularity (0–1)
  const catMatch = HIGH_POP_CATEGORIES.some(c => text.includes(c));
  const catScore = catMatch ? 1 : 0.3;

  return priceScore * 0.30 + imageScore * 0.20 + kwScore * 0.25 + catScore * 0.25;
}

async function checkImageHealth(url: string): Promise<{ reachable: boolean; contentType: string | null }> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    const ct = res.headers.get("content-type");
    const ok = res.ok && !!ct && ct.startsWith("image/");
    return { reachable: ok, contentType: ct };
  } catch {
    return { reachable: false, contentType: null };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "optimize";

    // ── PUBLIC action: performance (no auth) ──
    if (action === "performance") {
      const supabase = createClient(supabaseUrl, serviceKey);

      // Fetch active products
      const { data: products } = await supabase
        .from("products")
        .select("id, name, price, compare_at_price, category, image_url, description")
        .eq("is_active", true)
        .gt("price", 0)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!products?.length) {
        return Response.json({ ok: true, topProducts: [], optimizedTitles: [], keywordSuggestions: [], imageIssues: [] }, { headers: corsHeaders });
      }

      // Score and rank
      const scored = products.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category,
        boostScore: calcBoostScore(p as any),
      }));
      scored.sort((a, b) => b.boostScore - a.boostScore);
      const topProducts = scored.slice(0, 50);

      // Image issues (sample first 30)
      const imageIssues: any[] = [];
      for (const p of products.slice(0, 30)) {
        if (!p.image_url) {
          imageIssues.push({ id: p.id, name: p.name, issue: "missing_image" });
          continue;
        }
        const check = await checkImageHealth(p.image_url);
        if (!check.reachable) {
          imageIssues.push({ id: p.id, name: p.name, issue: "unreachable_image", url: p.image_url });
        } else if (check.contentType && !["image/jpeg", "image/png", "image/webp"].includes(check.contentType)) {
          imageIssues.push({ id: p.id, name: p.name, issue: "invalid_format", contentType: check.contentType });
        }
      }

      // Keyword suggestions
      const kwFreq: Record<string, number> = {};
      for (const p of products) {
        for (const kw of getKeywords(p.name, p.category)) {
          kwFreq[kw] = (kwFreq[kw] || 0) + 1;
        }
      }
      const keywordSuggestions = Object.entries(kwFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([keyword, count]) => ({ keyword, productCount: count }));

      // Title suggestions for top products
      const optimizedTitles = topProducts.slice(0, 20).map(p => {
        const kws = getKeywords(p.name, p.category);
        const primaryKw = kws[0] || "";
        const pet = detectPetType(p.name, p.category);
        const petLabel = pet === "cat" ? "for Cats" : pet === "dog" ? "for Dogs" : "for Pets";
        let title = p.name.replace(/\b(best|cheap|sale|free|amazing|premium|top|rated|#1|exclusive)\b/gi, "").replace(/\s{2,}/g, " ").trim();
        if (primaryKw && !title.toLowerCase().includes(primaryKw.split(" ")[0])) {
          title = `${title} – ${primaryKw.charAt(0).toUpperCase() + primaryKw.slice(1)} ${petLabel}`;
        }
        return { id: p.id, currentTitle: p.name, suggestedTitle: title.slice(0, 150) };
      });

      return Response.json({ ok: true, topProducts, optimizedTitles, keywordSuggestions, imageIssues }, { headers: corsHeaders });
    }

    // ── Auth required for remaining actions ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, serviceKey);

    // Allow service-role key for cron jobs
    const isServiceRole = token === serviceKey;
    if (!isServiceRole) {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await anonClient.auth.getUser(token);
      if (!user) return Response.json({ ok: false, error: "Invalid token" }, { status: 401, headers: corsHeaders });
      const { data: roleData } = await supabase.from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!roleData) return Response.json({ ok: false, error: "Admin required" }, { status: 403, headers: corsHeaders });
    }

    const limitParam = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(limitParam, 1), 200);

    // ── ACTION: boost — score, rank, optimize top 50, mark as priority ──
    if (action === "boost") {
      const { data: products } = await supabase
        .from("products")
        .select("id, name, description, category, price, compare_at_price, image_url, primary_species")
        .eq("is_active", true)
        .gt("price", 0)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);

      if (!products?.length) {
        return Response.json({ ok: true, boosted: 0, results: [] }, { headers: corsHeaders });
      }

      // Score all
      const scored = products.map(p => ({ ...p, boostScore: calcBoostScore(p as any) }));
      scored.sort((a, b) => b.boostScore - a.boostScore);
      const top = scored.slice(0, Math.min(limit, 50));

      // Image health check on top products
      const imageIssues: string[] = [];
      const results: any[] = [];

      for (const p of top) {
        // Check image
        let imageOk = true;
        if (p.image_url) {
          const check = await checkImageHealth(p.image_url);
          if (!check.reachable) {
            imageIssues.push(p.id);
            imageOk = false;
          }
        }

        const petType = detectPetType(p.name, p.category);
        const taxonomy = mapTaxonomy(p.name, p.category);
        const productType = buildProductType(p.name, p.category);
        const keywords = getKeywords(p.name, p.category);
        const petLabel = petType === "cat" ? "Cat" : petType === "dog" ? "Dog" : "Pet";

        let cleanName = p.name
          .replace(/\b(best|cheap|sale|free|amazing|premium|top|rated|#1|exclusive)\b/gi, "")
          .replace(/\s{2,}/g, " ").trim();

        const primaryKeyword = keywords[0] || `${petLabel} product`;
        let optimizedTitle = cleanName;
        if (!cleanName.toLowerCase().includes(primaryKeyword.split(" ")[0])) {
          optimizedTitle = `${cleanName} – ${primaryKeyword.charAt(0).toUpperCase() + primaryKeyword.slice(1)}`;
        }
        optimizedTitle = optimizedTitle.slice(0, 150).trim();

        const rawDesc = (p.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        let optimizedDesc = rawDesc
          .replace(/\b(best|cheap|sale|free|amazing|premium|top.rated|#1|exclusive|buy now|shop now|order today)\b/gi, "")
          .replace(/[✔✓★⭐🏆🥇💯🔥✅🎉🚚📦]/g, "").replace(/\s{2,}/g, " ").trim();

        if (optimizedDesc.length < 140) {
          optimizedDesc = `${cleanName} is a ${petLabel.toLowerCase()} product designed for everyday use. ` +
            `This ${p.category || "pet supply"} provides comfort and durability for your ${petType}. ` +
            `Suitable for ${petType === "cat" ? "indoor cats" : petType === "dog" ? "dogs of all sizes" : "all pets"}. ` +
            `Ships from US warehouses with tracking included.`;
        }

        let score = 50;
        if (optimizedTitle.length >= 50 && optimizedTitle.length <= 150) score += 15;
        if (optimizedDesc.length >= 140) score += 15;
        if (taxonomy) score += 10;
        if (keywords.length > 0) score += 5;
        if (imageOk) score += 5;

        const row = {
          product_id: p.id,
          original_title: p.name,
          optimized_title: optimizedTitle,
          original_description: rawDesc.slice(0, 5000),
          optimized_description: optimizedDesc.slice(0, 5000),
          google_product_category: taxonomy?.path || null,
          google_product_category_id: taxonomy?.id || null,
          product_type: productType,
          keyword_suggestions: keywords,
          optimization_score: score,
          status: "priority",
          boost_score: Math.round(p.boostScore * 100),
        };

        await supabase.from("shopping_optimizations").upsert(row, { onConflict: "product_id" });
        results.push(row);
      }

      // Log run
      await supabase.from("cron_job_logs").insert({
        job_name: "shopping-visibility-boost",
        status: "completed",
        success: true,
        items_processed: results.length,
        details: { imageIssues: imageIssues.length, topScore: results[0]?.boost_score },
      });

      return Response.json({ ok: true, boosted: results.length, imageIssues: imageIssues.length, results }, { headers: corsHeaders });
    }

    // ── ACTION: optimize ──
    if (action === "optimize") {
      const { data: products } = await supabase
        .from("products")
        .select("id, name, description, category, price, primary_species")
        .eq("is_active", true)
        .gt("price", 0)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!products?.length) {
        return Response.json({ ok: true, optimized: 0, results: [] }, { headers: corsHeaders });
      }

      const results: any[] = [];

      for (const p of products) {
        const petType = detectPetType(p.name, p.category);
        const taxonomy = mapTaxonomy(p.name, p.category);
        const productType = buildProductType(p.name, p.category);
        const keywords = getKeywords(p.name, p.category);
        const petLabel = petType === "cat" ? "Cat" : petType === "dog" ? "Dog" : "Pet";

        let cleanName = p.name
          .replace(/\b(best|cheap|sale|free|amazing|premium|top|rated|#1|exclusive)\b/gi, "")
          .replace(/\s{2,}/g, " ").trim();

        const primaryKeyword = keywords[0] || `${petLabel} product`;
        let optimizedTitle = cleanName;
        if (!cleanName.toLowerCase().includes(primaryKeyword.split(" ")[0])) {
          optimizedTitle = `${cleanName} – ${primaryKeyword.charAt(0).toUpperCase() + primaryKeyword.slice(1)}`;
        }
        optimizedTitle = optimizedTitle.slice(0, 150).trim();

        const rawDesc = (p.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        let optimizedDesc = rawDesc
          .replace(/\b(best|cheap|sale|free|amazing|premium|top.rated|#1|exclusive|buy now|shop now|order today)\b/gi, "")
          .replace(/[✔✓★⭐🏆🥇💯🔥✅🎉🚚📦]/g, "").replace(/\s{2,}/g, " ").trim();

        if (optimizedDesc.length < 140) {
          optimizedDesc = `${cleanName} is a ${petLabel.toLowerCase()} product designed for everyday use. ` +
            `This ${p.category || "pet supply"} provides comfort and durability for your ${petType}. ` +
            `Suitable for ${petType === "cat" ? "indoor cats" : petType === "dog" ? "dogs of all sizes" : "all pets"}. ` +
            `Ships from US warehouses with tracking included.`;
        }

        let score = 50;
        if (optimizedTitle.length >= 50 && optimizedTitle.length <= 150) score += 15;
        if (optimizedDesc.length >= 140) score += 15;
        if (taxonomy) score += 10;
        if (keywords.length > 0) score += 10;

        const row = {
          product_id: p.id,
          original_title: p.name,
          optimized_title: optimizedTitle,
          original_description: rawDesc.slice(0, 5000),
          optimized_description: optimizedDesc.slice(0, 5000),
          google_product_category: taxonomy?.path || null,
          google_product_category_id: taxonomy?.id || null,
          product_type: productType,
          keyword_suggestions: keywords,
          optimization_score: score,
          status: "pending",
        };

        await supabase.from("shopping_optimizations").upsert(row, { onConflict: "product_id" });
        results.push(row);
      }

      return Response.json({ ok: true, optimized: results.length, results }, { headers: corsHeaders });
    }

    // ── ACTION: apply ──
    if (action === "apply") {
      const body = await req.json().catch(() => ({}));
      const productIds: string[] = body.productIds || [];

      if (!productIds.length) {
        return Response.json({ ok: false, error: "No product IDs provided" }, { status: 400, headers: corsHeaders });
      }

      const { data: optimizations } = await supabase
        .from("shopping_optimizations")
        .select("*")
        .in("product_id", productIds)
        .in("status", ["pending", "priority"]);

      let applied = 0;
      for (const opt of (optimizations || [])) {
        await supabase.from("shopping_optimizations")
          .update({ status: "applied", applied_at: new Date().toISOString() })
          .eq("id", opt.id);
        applied++;
      }

      return Response.json({ ok: true, applied }, { headers: corsHeaders });
    }

    // ── ACTION: insights ──
    if (action === "insights") {
      const { data: unoptimized } = await supabase
        .from("products")
        .select("id, name, category")
        .eq("is_active", true)
        .gt("price", 0)
        .is("category", null)
        .limit(10);

      const { data: shortTitles } = await supabase
        .from("products")
        .select("id, name")
        .eq("is_active", true)
        .gt("price", 0)
        .limit(100);

      const lowCTRProducts = (shortTitles || [])
        .filter(p => p.name.length < 50)
        .slice(0, 10)
        .map(p => ({ id: p.id, name: p.name, issue: "short_title", suggestion: "Add keywords and product details to title" }));

      const categoryIssues = (unoptimized || []).map(p => ({
        id: p.id,
        name: p.name,
        issue: "missing_category",
      }));

      const { data: allProducts } = await supabase
        .from("products")
        .select("name, category")
        .eq("is_active", true)
        .limit(100);

      const keywordFreq: Record<string, number> = {};
      for (const p of (allProducts || [])) {
        const kws = getKeywords(p.name, p.category);
        for (const kw of kws) {
          keywordFreq[kw] = (keywordFreq[kw] || 0) + 1;
        }
      }
      const topKeywords = Object.entries(keywordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([keyword, count]) => ({ keyword, productCount: count }));

      const titleSuggestions = (shortTitles || [])
        .filter(p => p.name.length < 80)
        .slice(0, 10)
        .map(p => {
          const pet = detectPetType(p.name, null);
          const kws = getKeywords(p.name, null);
          return {
            id: p.id,
            currentTitle: p.name,
            suggestedAddition: kws[0] || `${pet} product`,
          };
        });

      return Response.json({
        ok: true,
        topKeywords,
        lowCTRProducts,
        titleSuggestions,
        categoryIssues,
      }, { headers: corsHeaders });
    }

    return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500, headers: corsHeaders });
  }
});
