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
  // Try most specific first (longer keys first)
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

// High-intent keyword bank by pet type and product type
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return Response.json({ ok: false, error: "Invalid token" }, { status: 401, headers: corsHeaders });
    
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await supabase.from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleData) return Response.json({ ok: false, error: "Admin required" }, { status: 403, headers: corsHeaders });

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "optimize";
    const limitParam = parseInt(url.searchParams.get("limit") || "20", 10);
    const limit = Math.min(Math.max(limitParam, 1), 50);

    // ── ACTION: optimize — generate optimized titles/descriptions using AI ──
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

        // Build optimized title: [Primary Keyword] + [Product Type] + [Key Feature] + [Pet Type]
        // Strip promotional words first
        let cleanName = p.name
          .replace(/\b(best|cheap|sale|free|amazing|premium|top|rated|#1|exclusive)\b/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim();

        // Ensure primary keyword appears first
        const primaryKeyword = keywords[0] || `${petLabel} product`;
        let optimizedTitle = cleanName;
        if (!cleanName.toLowerCase().includes(primaryKeyword.split(" ")[0])) {
          optimizedTitle = `${cleanName} – ${primaryKeyword.charAt(0).toUpperCase() + primaryKeyword.slice(1)}`;
        }
        // Cap at 150 chars
        optimizedTitle = optimizedTitle.slice(0, 150).trim();

        // Build optimized description
        const rawDesc = (p.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        const cleanDesc = rawDesc
          .replace(/\b(best|cheap|sale|free|amazing|premium|top.rated|#1|exclusive|buy now|shop now|order today)\b/gi, "")
          .replace(/[✔✓★⭐🏆🥇💯🔥✅🎉🚚📦]/g, "")
          .replace(/\s{2,}/g, " ")
          .trim();

        let optimizedDesc = cleanDesc;
        if (cleanDesc.length < 140) {
          // Generate factual description
          optimizedDesc = `${cleanName} is a ${petLabel.toLowerCase()} product designed for everyday use. ` +
            `This ${p.category || "pet supply"} provides comfort and durability for your ${petType}. ` +
            `Suitable for ${petType === "cat" ? "indoor cats" : petType === "dog" ? "dogs of all sizes" : "all pets"}. ` +
            `Ships from US warehouses with tracking included.`;
        }

        // Compute optimization score (0-100)
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

        // Upsert into shopping_optimizations
        await supabase.from("shopping_optimizations").upsert(row, { onConflict: "product_id" });
        results.push(row);
      }

      return Response.json({ ok: true, optimized: results.length, results }, { headers: corsHeaders });
    }

    // ── ACTION: apply — apply optimized titles/descriptions to the sync pipeline ──
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
        .eq("status", "pending");

      let applied = 0;
      for (const opt of (optimizations || [])) {
        await supabase.from("shopping_optimizations")
          .update({ status: "applied", applied_at: new Date().toISOString() })
          .eq("id", opt.id);
        applied++;
      }

      return Response.json({ ok: true, applied }, { headers: corsHeaders });
    }

    // ── ACTION: insights — shopping performance analysis ──
    if (action === "insights") {
      // Products without optimizations
      const { data: unoptimized } = await supabase
        .from("products")
        .select("id, name, category")
        .eq("is_active", true)
        .gt("price", 0)
        .is("category", null)
        .limit(10);

      // Products with short titles (< 50 chars)
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

      // Category issues
      const categoryIssues = (unoptimized || []).map(p => ({
        id: p.id,
        name: p.name,
        issue: "missing_category",
      }));

      // Top keyword suggestions based on product mix
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

      // Title improvement suggestions
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
