import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

// ── Text Helpers ──
function sanitize(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").replace(/[|]+/g, " ").replace(/[^\p{L}\p{N}\s&/+,\-().':]/gu, "").trim();
}
function titleCase(s: string): string {
  const lower = ["for","and","the","of","in","on","a","an","to","with","by"];
  return s.split(" ").filter(Boolean).map((w, i) => {
    if (i > 0 && lower.includes(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
}
function dedupe(s: string): string {
  const seen = new Set<string>();
  return s.split(" ").filter(w => { const k = w.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).join(" ");
}
function clamp(s: string, max = 120): string {
  const c = s.replace(/\s+/g, " ").trim();
  if (c.length <= max) return c;
  let out = "";
  for (const p of c.split(" ")) { const n = out ? `${out} ${p}` : p; if (n.length > max) break; out = n; }
  return out.trim();
}

// ── Quality Scoring ──
function scoreProduct(p: any): {
  titleScore: number; descriptionScore: number; seoScore: number;
  shoppingScore: number; completenessScore: number; conversionScore: number;
  overallScore: number; label: string; flags: string[];
} {
  const flags: string[] = [];
  let titleScore = 50, descriptionScore = 50, seoScore = 50, shoppingScore = 50, completenessScore = 50, conversionScore = 50;

  // Title scoring
  const name = (p.name || "").trim();
  if (!name) { titleScore = 0; flags.push("missing_title"); }
  else {
    if (name.length < 20) { titleScore -= 20; flags.push("title_too_short"); }
    if (name.length > 150) { titleScore -= 15; flags.push("title_too_long"); }
    if (name.length >= 40 && name.length <= 120) titleScore += 25;
    if (/\b(dog|cat|pet|puppy|kitten)\b/i.test(name)) titleScore += 10;
    if (/[A-Z]{3,}/.test(name)) { titleScore -= 10; flags.push("title_has_caps_spam"); }
  }

  // Description scoring
  const desc = (p.description || "").trim();
  if (!desc) { descriptionScore = 0; flags.push("missing_description"); }
  else {
    if (desc.length < 50) { descriptionScore -= 25; flags.push("description_too_short"); }
    if (desc.length >= 150 && desc.length <= 2000) descriptionScore += 25;
    if (desc.length > 2000) descriptionScore += 15;
    if (/<[a-z][\s\S]*>/i.test(desc)) descriptionScore += 5; // Has HTML formatting
  }

  // SEO scoring
  if (p.slug) seoScore += 15;
  if (p.product_type) seoScore += 10;
  if (p.google_product_category) seoScore += 10;
  if (p.primary_species) seoScore += 5;
  if (!p.slug) { seoScore -= 20; flags.push("missing_slug"); }
  if (!p.product_type) { seoScore -= 10; flags.push("missing_product_type"); }
  if (!p.google_product_category) { seoScore -= 10; flags.push("missing_google_category"); }

  // Shopping scoring
  if (p.price > 0) shoppingScore += 15;
  if (p.image_url) shoppingScore += 15;
  if (p.stock && p.stock > 0) shoppingScore += 10;
  if (!p.image_url) { shoppingScore -= 30; flags.push("missing_image"); }
  if (!p.price || p.price <= 0) { shoppingScore -= 30; flags.push("missing_price"); }
  if (!p.category) flags.push("missing_category");

  // Completeness
  const fields = [p.name, p.description, p.image_url, p.price, p.slug, p.category, p.product_type, p.sku];
  const filled = fields.filter(f => f !== null && f !== undefined && f !== "").length;
  completenessScore = Math.round((filled / fields.length) * 100);

  // Conversion
  if (p.price > 0 && p.price < 100) conversionScore += 10;
  if (p.image_url) conversionScore += 15;
  if (desc && desc.length > 100) conversionScore += 15;
  if (p.compare_at_price && p.compare_at_price > p.price) conversionScore += 10;

  // Clamp all to 0-100
  const cl = (n: number) => Math.max(0, Math.min(100, n));
  titleScore = cl(titleScore);
  descriptionScore = cl(descriptionScore);
  seoScore = cl(seoScore);
  shoppingScore = cl(shoppingScore);
  completenessScore = cl(completenessScore);
  conversionScore = cl(conversionScore);

  const overallScore = Math.round(
    titleScore * 0.2 + descriptionScore * 0.2 + seoScore * 0.15 +
    shoppingScore * 0.2 + completenessScore * 0.15 + conversionScore * 0.1
  );
  const label = overallScore >= 80 ? "Excellent" : overallScore >= 60 ? "Good" : overallScore >= 40 ? "Needs Work" : "Critical Fix Needed";

  return { titleScore, descriptionScore, seoScore, shoppingScore, completenessScore, conversionScore, overallScore, label, flags };
}

// ── Fallback title builder ──
function buildFallbackTitle(p: any, short = false): string {
  const parts = [
    sanitize(p.primary_keyword || ""),
    sanitize(p.product_type || p.category || ""),
    sanitize(p.key_feature || ""),
    sanitize(p.animal_type || p.primary_species || ""),
    sanitize(p.brand || ""),
  ].filter(Boolean);
  let t = titleCase(dedupe(parts.join(" ")));
  const max = short ? 65 : 120;
  t = clamp(t, max);
  if (!t || t.length < 10) t = clamp(titleCase(dedupe(sanitize(p.name || "Pet Product"))), max);
  return t;
}

// ── AI Call helper ──
async function aiGenerate(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.3,
      }),
    });
    if (!resp.ok) { console.error(`AI error: ${resp.status}`); return null; }
    const d = await resp.json();
    return d?.choices?.[0]?.message?.content ?? null;
  } catch (e) { console.error("AI call failed:", e); return null; }
}

// ── Species detection ──
function detectAnimal(p: any): string {
  const text = `${p.name} ${p.category} ${p.product_type} ${p.primary_species}`.toLowerCase();
  if (/\bcat\b|kitten|feline/.test(text)) return "Cat";
  if (/\bdog\b|puppy|canine/.test(text)) return "Dog";
  if (/\bbird\b|parrot|parakeet/.test(text)) return "Bird";
  if (/\brabbit\b|hamster|guinea pig|small pet/.test(text)) return "Small Pet";
  if (/\bfish\b|aquarium/.test(text)) return "Fish";
  return "Pet";
}

// ── Main handler ──
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ success: false, error: "Server configuration error" }, 500);
  }

  // Auth check - validate user via getUser
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ success: false, error: "Authentication required" }, 401);
  }
  try {
    const ac = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await ac.auth.getUser();
    if (error || !user) {
      console.error("[product-optimizer] Auth failed:", error?.message);
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    console.log("[product-optimizer] Authenticated user:", user.id);
  } catch (e) {
    console.error("[product-optimizer] Auth crash:", e);
    return json({ success: false, error: "Auth verification failed" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "audit";
    console.log(`[product-optimizer] action=${action}`);

    const SELECT_FIELDS = "id, name, slug, sku, description, category, product_type, google_product_category, image_url, images, price, compare_at_price, stock, is_active, primary_species, primary_intent, shopping_title, short_title, meta_title, meta_description, seo_keywords, primary_keyword, key_feature, brand, animal_type, optimized_description, description_bullets, quality_score, quality_flags";

    // ── ACTION: audit ──
    if (action === "audit") {
      const filter = body.filter || "active";
      const limit = Math.min(body.limit || 50, 500);
      const offset = body.offset || 0;
      const search = body.search || "";

      console.log(`[product-optimizer] Audit: filter=${filter} limit=${limit} offset=${offset} search="${search}"`);

      let query = admin.from("products").select(SELECT_FIELDS, { count: "exact" });

      if (filter === "active") query = query.eq("is_active", true);
      else if (filter === "draft") query = query.eq("is_active", false);
      else if (filter === "in_stock") query = query.gt("stock", 0);
      else if (filter === "out_of_stock") query = query.or("stock.is.null,stock.eq.0");
      else if (filter === "missing_product_type") query = query.is("product_type", null);
      else if (filter === "missing_google_category") query = query.is("google_product_category", null);
      else if (filter === "low_quality") query = query.or("quality_score.is.null,quality_score.lt.50");

      if (search) {
        query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%,sku.ilike.%${search}%`);
      }

      const { data: products, error: loadErr, count } = await query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
      
      console.log(`[product-optimizer] Audit query result: error=${loadErr?.message || "none"} count=${count} returned=${products?.length || 0}`);
      
      if (loadErr) return json({ success: false, error: "Database query failed", details: loadErr.message }, 500);
      if (!products || products.length === 0) return json({ success: true, action: "audit", totalCount: 0, returnedCount: 0, items: [], summary: { avgScore: 0, needsWork: 0, critical: 0, excellent: 0, good: 0 }, debug: { filter, search, message: "No products found matching filter" } });

      const items = (products || []).map((p: any) => {
        const scores = scoreProduct(p);
        return {
          id: p.id, name: p.name, slug: p.slug, sku: p.sku, category: p.category,
          product_type: p.product_type, google_product_category: p.google_product_category,
          price: p.price, stock: p.stock, is_active: p.is_active,
          image_url: p.image_url, has_images: !!(p.images?.length),
          primary_species: p.primary_species, animal_type: p.animal_type || detectAnimal(p),
          shopping_title: p.shopping_title, short_title: p.short_title,
          meta_title: p.meta_title, meta_description: p.meta_description,
          quality_score: scores.overallScore, quality_label: scores.label,
          scores, flags: scores.flags,
        };
      });

      const needsWork = items.filter((i: any) => i.quality_score < 60).length;
      const critical = items.filter((i: any) => i.quality_score < 40).length;
      const avgScore = items.length > 0 ? Math.round(items.reduce((a: number, i: any) => a + i.quality_score, 0) / items.length) : 0;

      return json({
        success: true, action: "audit",
        totalCount: count || items.length,
        returnedCount: items.length,
        offset, limit, filter, search,
        summary: { avgScore, needsWork, critical, excellent: items.filter((i: any) => i.quality_score >= 80).length, good: items.filter((i: any) => i.quality_score >= 60 && i.quality_score < 80).length },
        items,
      });
    }

    // ── ACTION: optimize ──
    if (action === "optimize") {
      const mode = body.mode || "titles"; // titles | short_titles | descriptions | metadata | all
      const dryRun = body.dryRun !== false;
      const limit = Math.min(body.limit || 20, 100);
      const offset = body.offset || 0;
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];

      let query = admin.from("products").select(SELECT_FIELDS).eq("is_active", true);
      if (ids.length > 0) query = admin.from("products").select(SELECT_FIELDS).in("id", ids);
      else query = query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);

      const { data: products, error: loadErr } = await query;
      if (loadErr) return json({ success: false, error: "Database query failed", details: loadErr.message }, 500);
      if (!products?.length) return json({ success: true, action: "optimize", mode, totalProducts: 0, items: [], summary: { optimized: 0, fallback: 0, failed: 0, updated: 0 } });

      const results: any[] = [];
      let optimized = 0, fallback = 0, failed = 0, updated = 0;

      for (const p of products) {
        try {
          const item: any = { id: p.id, name: p.name, slug: p.slug, category: p.category, ok: true };
          const detected = detectAnimal(p);
          const updatePayload: any = {};

          // TITLES
          if (mode === "titles" || mode === "short_titles" || mode === "all") {
            const isShort = mode === "short_titles";
            const maxC = isShort ? 65 : 120;

            const aiTitle = await aiGenerate(LOVABLE_KEY,
              "You are a Google Shopping title specialist for GetPawsy.pet, a US pet supply store. Create clean, policy-safe product titles.",
              `Create one Google Shopping product title (${isShort ? "max 65 chars" : "70-120 chars"}).\nStructure: Primary Keyword + Product Type + Key Feature + Target Animal\nNo quotes, no promotional claims.\n\nProduct: ${p.name}\nCategory: ${p.category || ""}\nType: ${p.product_type || ""}\nSpecies: ${detected}\nDescription excerpt: ${(p.description || "").slice(0, 200)}`
            );

            let finalTitle: string;
            let usedAI = false, usedFallback = false;

            if (aiTitle) {
              finalTitle = clamp(titleCase(dedupe(sanitize(aiTitle.replace(/^["']|["']$/g, "")))), maxC);
              if (finalTitle.length >= 15) { usedAI = true; } else { finalTitle = buildFallbackTitle(p, isShort); usedFallback = true; }
            } else { finalTitle = buildFallbackTitle(p, isShort); usedFallback = true; }

            if (usedFallback) fallback++;

            item.originalTitle = p.shopping_title || p.name;
            item.optimizedTitle = finalTitle;
            item.titleChars = finalTitle.length;
            item.usedAI = usedAI;
            item.usedFallback = usedFallback;

            if (isShort) { updatePayload.short_title = finalTitle; }
            else { updatePayload.shopping_title = finalTitle; }
            updatePayload.title_optimized_at = new Date().toISOString();

            // Also generate short title if doing "all"
            if (mode === "all" && !isShort) {
              const shortFb = buildFallbackTitle(p, true);
              item.shortTitle = shortFb;
              updatePayload.short_title = shortFb;
            }
          }

          // DESCRIPTIONS
          if (mode === "descriptions" || mode === "all") {
            const aiDesc = await aiGenerate(LOVABLE_KEY,
              "You are a product copywriter for GetPawsy.pet. Write clean, conversion-focused product descriptions. No medical claims, no fake reviews. Use a helpful, trustworthy tone.",
              `Write an optimized product description for Google Shopping and ecommerce.\n\nFormat:\n1. One-line selling intro (20-30 words)\n2. Three key benefits as bullet points\n3. A brief use-case sentence\n4. A trust-oriented closing line\n\nProduct: ${p.name}\nCategory: ${p.category || ""}\nCurrent description: ${(p.description || "").slice(0, 500)}\nPrice: $${p.price}\nTarget: ${detected} owners\n\nReturn ONLY the description text, no markdown headers.`
            );

            item.originalDescription = (p.description || "").slice(0, 200) + ((p.description || "").length > 200 ? "..." : "");
            if (aiDesc && aiDesc.length > 30) {
              item.optimizedDescription = aiDesc.trim();
              updatePayload.optimized_description = aiDesc.trim();
              // Extract bullets
              const bullets = aiDesc.match(/[•\-\*]\s*.+/g)?.map((b: string) => b.replace(/^[•\-\*]\s*/, "").trim()) || [];
              if (bullets.length > 0) { item.bullets = bullets; updatePayload.description_bullets = bullets; }
            } else {
              item.optimizedDescription = null;
              item.descriptionFallback = true;
              fallback++;
            }
            updatePayload.description_optimized_at = new Date().toISOString();
          }

          // METADATA
          if (mode === "metadata" || mode === "all") {
            const aiMeta = await aiGenerate(LOVABLE_KEY,
              "You are an SEO specialist for GetPawsy.pet. Generate product SEO metadata.",
              `Generate SEO metadata for this product:\nName: ${p.name}\nCategory: ${p.category || ""}\nType: ${p.product_type || ""}\nSpecies: ${detected}\n\nReturn in this exact format (one per line):\nMETA_TITLE: (under 60 chars)\nMETA_DESC: (150-160 chars)\nKEYWORDS: keyword1, keyword2, keyword3, keyword4, keyword5\nPRODUCT_TYPE: (normalized product type)`
            );

            if (aiMeta) {
              const metaTitle = aiMeta.match(/META_TITLE:\s*(.+)/i)?.[1]?.trim();
              const metaDesc = aiMeta.match(/META_DESC:\s*(.+)/i)?.[1]?.trim();
              const keywords = aiMeta.match(/KEYWORDS:\s*(.+)/i)?.[1]?.split(",").map((k: string) => k.trim()).filter(Boolean);
              const productType = aiMeta.match(/PRODUCT_TYPE:\s*(.+)/i)?.[1]?.trim();

              if (metaTitle) { item.metaTitle = metaTitle; updatePayload.meta_title = metaTitle; }
              if (metaDesc) { item.metaDescription = metaDesc; updatePayload.meta_description = metaDesc; }
              if (keywords?.length) { item.seoKeywords = keywords; updatePayload.seo_keywords = keywords; }
              if (productType && !p.product_type) { item.suggestedProductType = productType; updatePayload.product_type = productType; }
            }

            updatePayload.animal_type = detected;
            updatePayload.metadata_optimized_at = new Date().toISOString();
          }

          // Compute quality score
          const scores = scoreProduct({ ...p, ...updatePayload });
          item.qualityScore = scores.overallScore;
          item.qualityLabel = scores.label;
          item.flags = scores.flags;
          updatePayload.quality_score = scores.overallScore;
          updatePayload.quality_flags = scores.flags;

          // Apply if not dry run
          if (!dryRun && Object.keys(updatePayload).length > 0) {
            const { error: updateErr } = await admin.from("products").update(updatePayload).eq("id", p.id);
            if (updateErr) { item.ok = false; item.error = updateErr.message; failed++; }
            else { updated++; item.applied = true; }
          }

          optimized++;
          results.push(item);
        } catch (err) {
          failed++;
          results.push({ id: p.id, name: p.name, ok: false, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      return json({
        success: true, action: "optimize", mode, dryRun,
        totalProducts: products.length,
        summary: { optimized, fallback, failed, updated },
        items: results,
      });
    }

    // ── ACTION: apply ──
    if (action === "apply") {
      const updates = body.updates; // Array of { id, fields: { shopping_title, ... } }
      if (!Array.isArray(updates) || updates.length === 0) {
        return json({ success: false, error: "No updates provided" }, 400);
      }

      let applied = 0, errors = 0;
      const results: any[] = [];

      for (const u of updates) {
        if (!u.id || !u.fields) { errors++; continue; }
        const { error } = await admin.from("products").update(u.fields).eq("id", u.id);
        if (error) { errors++; results.push({ id: u.id, ok: false, error: error.message }); }
        else { applied++; results.push({ id: u.id, ok: true }); }
      }

      return json({ success: true, action: "apply", applied, errors, results });
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[product-optimizer] CRASH:", err);
    return json({ success: false, error: "Unexpected server error", details: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});
