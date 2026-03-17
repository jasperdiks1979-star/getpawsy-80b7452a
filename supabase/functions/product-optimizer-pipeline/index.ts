import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

// ── CORS ──
const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.find((o) => origin === o) || ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cache-control",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: cors });
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
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

// ── Dictionaries ──
const ANIMAL_KEYWORDS: Record<string, string[]> = {
  Cat: ["cat","kitten","feline","kitty","litter"],
  Dog: ["dog","puppy","canine","pup"],
  Bird: ["bird","parrot","parakeet","budgie","avian"],
  "Small Pet": ["rabbit","hamster","guinea pig","gerbil","ferret","chinchilla"],
  Fish: ["fish","aquarium","tank","betta"],
};

const FEATURE_KEYWORDS: Record<string, string[]> = {
  Foldable: ["foldable","collapsible","fold","folding"],
  Elevated: ["elevated","raised","high"],
  Orthopedic: ["orthopedic","memory foam","supportive"],
  Interactive: ["interactive","puzzle","stimulating"],
  "Non-Slip": ["non-slip","anti-slip","grip"],
  Washable: ["washable","machine wash","removable cover"],
  "Travel-Friendly": ["travel","portable","car","carrier"],
  Waterproof: ["waterproof","water-resistant","leak"],
  Adjustable: ["adjustable","size adjust"],
  Automatic: ["automatic","auto","self-cleaning","timer"],
};

// ── Dropshipping signal patterns ──
const DROPSHIP_TITLE_PATTERNS = [
  /\b(2024|2025|2026)\b/i, // year stuffing
  /\b(hot sale|best seller|top rated|viral|trending|popular)\b/i,
  /\b(free shipping|fast delivery|limited time|sale|discount)\b/i,
  /\b(high quality|premium quality|best quality|top quality)\b/i,
  /\b(new arrival|latest|brand new)\b/i,
  /\d+\s*(pcs|pieces|pack|set)\s*$/i, // "5pcs" at end
  /[A-Z]{5,}/, // excessive caps
  /(.)\1{3,}/, // repeated chars
  /\b(wholesale|dropship|supplier|factory)\b/i,
  /\b(amazon|aliexpress|wish|temu|shein)\b/i,
];

const DROPSHIP_DESC_PATTERNS = [
  /\b(dear (customer|friend|buyer))\b/i,
  /\b(please (note|allow|check))\b/i,
  /\b(due to (manual|light|screen|monitor))\b/i,
  /\b(slight (difference|color|deviation))\b/i,
  /\b(real color|actual color|monitor settings)\b/i,
  /\b(1-3\s*(cm|mm)\s*(error|difference))\b/i,
  /\b(package (includes|contains|include))\b/i,
  /\b(specification|material|feature)s?:\s*$/im,
  /\b(we (will|are|offer)|our (store|shop))\b/i,
];

const GOOGLE_CATEGORY_MAP: Record<string, string> = {
  "cat tree": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture",
  "cat bed": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Beds",
  "cat litter": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter",
  "litter box": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter Box Liners",
  "cat toy": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys",
  "cat scratcher": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture",
  "cat food": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Food",
  "cat collar": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Collars & Harnesses",
  "dog bed": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds",
  "dog toy": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys",
  "dog collar": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leashes",
  "dog leash": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leashes",
  "dog harness": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leashes",
  "dog crate": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Kennels & Crates",
  "dog food": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Food",
  "dog bowl": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Feeders & Waterers",
  "dog carrier": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Carriers & Travel",
  "pet carrier": "Animals & Pet Supplies > Pet Supplies > Pet Carriers, Houses & Kennels",
  "pet bed": "Animals & Pet Supplies > Pet Supplies > Pet Beds",
  "pet bowl": "Animals & Pet Supplies > Pet Supplies > Pet Bowls, Feeders & Waterers",
  "bird feeder": "Animals & Pet Supplies > Pet Supplies > Bird Supplies > Bird Feeders",
  "bird cage": "Animals & Pet Supplies > Pet Supplies > Bird Supplies > Bird Cages & Stands",
  "fish tank": "Animals & Pet Supplies > Pet Supplies > Fish Supplies > Aquariums & Fish Bowls",
  "hamster cage": "Animals & Pet Supplies > Pet Supplies > Small Animal Supplies > Small Animal Habitats & Cages",
};

// ── Detection helpers ──
function detectAnimal(p: any): string {
  const text = `${p.name || ""} ${p.category || ""} ${p.product_type || ""} ${p.primary_species || ""} ${p.animal_type || ""}`.toLowerCase();
  for (const [animal, keywords] of Object.entries(ANIMAL_KEYWORDS)) {
    if (keywords.some(k => new RegExp(`\\b${k}\\b`, "i").test(text))) return animal;
  }
  return "Pet";
}

function detectFeature(p: any): string {
  const text = `${p.name || ""} ${p.description || ""} ${p.key_feature || ""}`.toLowerCase();
  for (const [feature, keywords] of Object.entries(FEATURE_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return feature;
  }
  return "";
}

function detectProductType(p: any): string {
  if (p.product_type) return p.product_type;
  const text = `${p.name || ""} ${p.category || ""}`.toLowerCase();
  const types = ["cat tree","cat bed","litter box","cat toy","cat scratcher","dog bed","dog toy","dog collar","dog leash","dog harness","dog crate","dog carrier","pet carrier","pet bed","food bowl","water fountain","scratching post","climbing tower","training pad","grooming tool"];
  for (const t of types) {
    if (text.includes(t)) return titleCase(t);
  }
  return "";
}

function detectGoogleCategory(p: any): string {
  if (p.google_product_category) return p.google_product_category;
  const text = `${p.name || ""} ${p.category || ""} ${p.product_type || ""}`.toLowerCase();
  for (const [key, cat] of Object.entries(GOOGLE_CATEGORY_MAP)) {
    if (text.includes(key)) return cat;
  }
  return "Animals & Pet Supplies > Pet Supplies";
}

function inferPrimaryKeyword(p: any): string {
  if (p.primary_keyword) return p.primary_keyword;
  const animal = detectAnimal(p).toLowerCase();
  const type = detectProductType(p).toLowerCase();
  if (type && animal !== "pet") return `${animal} ${type}`;
  if (type) return type;
  return sanitize(p.name || "").split(" ").slice(0, 3).join(" ").toLowerCase();
}

function inferBenefitAngle(p: any): string {
  const text = `${p.name || ""} ${p.description || ""}`.toLowerCase();
  if (/comfort|orthopedic|memory foam/i.test(text)) return "Improves comfort";
  if (/travel|portable|car/i.test(text)) return "Supports travel safety";
  if (/clean|litter|mess/i.test(text)) return "Reduces mess";
  if (/space|fold|compact/i.test(text)) return "Saves space";
  if (/play|interactive|toy/i.test(text)) return "Encourages play";
  if (/train|behavior/i.test(text)) return "Helps training consistency";
  if (/groom|brush|nail/i.test(text)) return "Simplifies grooming";
  return "Enhances pet well-being";
}

function inferConversionAngle(p: any): string {
  const text = `${p.name || ""} ${p.description || ""}`.toLowerCase();
  if (/apartment|small space|indoor/i.test(text)) return "Best for apartments";
  if (/travel|road trip|car/i.test(text)) return "Great for road trips";
  if (/anxious|anxiety|calm/i.test(text)) return "Ideal for anxious pets";
  if (/clean|easy clean/i.test(text)) return "Easy daily cleanup";
  if (/indoor cat/i.test(text)) return "Suitable for indoor cats";
  if (/outdoor/i.test(text)) return "Built for outdoor use";
  if (/puppy|kitten/i.test(text)) return "Perfect for new pet owners";
  return "Everyday essential";
}

function generateCustomLabels(p: any, animal: string, scores: any): {l0: string; l1: string; l2: string; l3: string; l4: string} {
  // l0 = animal segment
  const l0 = animal;
  // l1 = price tier
  const price = p.price || 0;
  const l1 = price >= 100 ? "premium" : price >= 40 ? "mid-range" : price >= 15 ? "value" : "budget";
  // l2 = seasonality / use case
  const text = `${p.name || ""} ${p.category || ""}`.toLowerCase();
  const l2 = /holiday|christmas|winter/i.test(text) ? "seasonal" :
    /outdoor|travel/i.test(text) ? "travel" :
    /toy|play/i.test(text) ? "entertainment" :
    /food|treat/i.test(text) ? "consumable" : "everyday";
  // l3 = business priority
  const l3 = scores.overallScore >= 80 ? "high_priority" : scores.overallScore >= 60 ? "standard" : "needs_work";
  // l4 = content quality tier
  const l4 = scores.overallScore >= 80 ? "tier_a" : scores.overallScore >= 60 ? "tier_b" : scores.overallScore >= 40 ? "tier_c" : "tier_d";
  return { l0, l1, l2, l3, l4 };
}

// ── Scoring Engine ──
function scoreProduct(p: any): {
  titleScore: number; descriptionScore: number; seoScore: number;
  shoppingScore: number; completenessScore: number; conversionScore: number;
  overallScore: number; shoppingPriority: number; contentReadiness: number;
  feedReadiness: number; confidenceTier: string; label: string; flags: string[];
} {
  const flags: string[] = [];
  let titleScore = 50, descriptionScore = 50, seoScore = 50, shoppingScore = 50, completenessScore = 50, conversionScore = 50;

  const name = (p.name || "").trim();
  if (!name) { titleScore = 0; flags.push("missing_title"); }
  else {
    if (name.length < 20) { titleScore -= 20; flags.push("title_too_short"); }
    if (name.length > 150) { titleScore -= 15; flags.push("title_too_long"); }
    if (name.length >= 40 && name.length <= 120) titleScore += 25;
    if (/\b(dog|cat|pet|puppy|kitten)\b/i.test(name)) titleScore += 10;
    if (/[A-Z]{3,}/.test(name)) { titleScore -= 10; flags.push("title_has_caps_spam"); }
    if (p.shopping_title && p.shopping_title.length >= 40) titleScore += 15;
  }

  const desc = (p.description || "").trim();
  if (!desc) { descriptionScore = 0; flags.push("missing_description"); }
  else {
    if (desc.length < 50) { descriptionScore -= 25; flags.push("description_too_short"); }
    if (desc.length >= 150 && desc.length <= 2000) descriptionScore += 25;
    if (desc.length > 2000) descriptionScore += 15;
  }

  if (p.slug) seoScore += 15;
  if (p.product_type) seoScore += 10;
  if (p.google_product_category) seoScore += 10;
  if (p.primary_keyword) seoScore += 10;
  if (!p.slug) { seoScore -= 20; flags.push("missing_slug"); }
  if (!p.product_type) { seoScore -= 10; flags.push("missing_product_type"); }
  if (!p.google_product_category) { seoScore -= 10; flags.push("missing_google_category"); }

  if (p.price > 0) shoppingScore += 15;
  if (p.image_url) shoppingScore += 15;
  if (p.stock && p.stock > 0) shoppingScore += 10;
  if (!p.image_url) { shoppingScore -= 30; flags.push("missing_image"); }
  if (!p.price || p.price <= 0) { shoppingScore -= 30; flags.push("missing_price"); }

  const fields = [p.name, p.description, p.image_url, p.price, p.slug, p.category, p.product_type, p.sku, p.primary_keyword, p.animal_type];
  const filled = fields.filter(f => f !== null && f !== undefined && f !== "").length;
  completenessScore = Math.round((filled / fields.length) * 100);

  if (p.price > 0 && p.price < 100) conversionScore += 10;
  if (p.image_url) conversionScore += 15;
  if (desc && desc.length > 100) conversionScore += 15;
  if (p.compare_at_price && p.compare_at_price > p.price) conversionScore += 10;

  const cl = (n: number) => Math.max(0, Math.min(100, n));
  titleScore = cl(titleScore); descriptionScore = cl(descriptionScore); seoScore = cl(seoScore);
  shoppingScore = cl(shoppingScore); completenessScore = cl(completenessScore); conversionScore = cl(conversionScore);

  const overallScore = Math.round(
    titleScore * 0.2 + descriptionScore * 0.2 + seoScore * 0.15 +
    shoppingScore * 0.2 + completenessScore * 0.15 + conversionScore * 0.1
  );

  // Shopping priority: weighted by feed-relevant factors
  const shoppingPriority = cl(Math.round(
    (p.image_url ? 20 : 0) + (p.stock > 0 ? 15 : 0) + (p.price > 0 ? 15 : 0) +
    (p.product_type ? 10 : 0) + (p.google_product_category ? 10 : 0) +
    (p.shopping_title ? 15 : 0) + (titleScore > 60 ? 15 : 0)
  ));

  // Content readiness
  const contentReadiness = cl(Math.round(
    (desc && desc.length > 100 ? 25 : desc ? 10 : 0) +
    (p.meta_title ? 15 : 0) + (p.meta_description ? 15 : 0) +
    (p.product_type ? 15 : 0) + (p.primary_keyword ? 15 : 0) +
    (p.seo_keywords?.length ? 15 : 0)
  ));

  // Feed readiness
  const feedReadiness = cl(Math.round(
    (p.google_product_category ? 20 : 0) + (p.product_type ? 15 : 0) +
    (p.shopping_title ? 20 : 0) + (p.image_url ? 15 : 0) +
    (p.price > 0 ? 10 : 0) + (p.stock > 0 ? 10 : 0) +
    (p.custom_label_0 ? 5 : 0) + (p.brand ? 5 : 0)
  ));

  const confidenceTier = overallScore >= 75 ? "High" : overallScore >= 50 ? "Medium" : "Low";
  const label = overallScore >= 80 ? "Excellent" : overallScore >= 60 ? "Good" : overallScore >= 40 ? "Needs Work" : "Critical";

  return { titleScore, descriptionScore, seoScore, shoppingScore, completenessScore, conversionScore, overallScore, shoppingPriority, contentReadiness, feedReadiness, confidenceTier, label, flags };
}

// ── Fallback title builder ──
function buildFallbackTitle(p: any, short = false): string {
  const parts = [
    sanitize(p.primary_keyword || inferPrimaryKeyword(p)),
    sanitize(p.product_type || detectProductType(p)),
    sanitize(p.key_feature || detectFeature(p)),
    sanitize(p.animal_type || detectAnimal(p)),
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
    if (!resp.ok) {
      if (resp.status === 429) { console.error("AI rate limited"); return null; }
      if (resp.status === 402) { console.error("AI credits exhausted"); return null; }
      console.error(`AI error: ${resp.status}`);
      return null;
    }
    const d = await resp.json();
    return d?.choices?.[0]?.message?.content ?? null;
  } catch (e) { console.error("AI call failed:", e); return null; }
}

// ── SELECT fields (only real columns) ──
const SELECT_FIELDS = "id, name, slug, sku, description, category, product_type, google_product_category, image_url, images, price, compare_at_price, stock, is_active, primary_species, primary_intent, shopping_title, short_title, meta_title, meta_description, seo_keywords, primary_keyword, key_feature, brand, animal_type, optimized_description, description_bullets, quality_score, quality_flags, benefit_angle, conversion_angle, keyword_cluster, custom_label_0, custom_label_1, custom_label_2, custom_label_3, custom_label_4, shopping_priority_score, content_readiness_score, feed_readiness_score, ai_optimizer_status, ai_locked, ai_manual_override, ai_last_optimized_at, seo_title, seo_meta_description, slug_suggestion";

// ── Main handler ──
Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405, cors);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ success: false, error: "Server configuration error" }, 500, cors);
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ success: false, error: "Authentication required" }, 401, cors);
  }

  let userId: string | null = null;
  try {
    const ac = createClient(SUPABASE_URL, ANON_KEY);
    const { data: { user }, error } = await ac.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) return json({ success: false, error: "Unauthorized" }, 401, cors);
    userId = user.id;
    console.log("[optimizer-pro] Authenticated:", userId);
  } catch (e) {
    return json({ success: false, error: "Auth failed" }, 401, cors);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "audit";
    console.log(`[optimizer-pro] action=${action}`);

    // ════════════════════════════════════════
    // ACTION: audit
    // ════════════════════════════════════════
    if (action === "audit") {
      const filter = body.filter || "active";
      const limit = Math.min(body.limit || 50, 500);
      const offset = body.offset || 0;
      const search = body.search || "";

      let query = admin.from("products").select(SELECT_FIELDS, { count: "exact" });

      if (filter === "active") query = query.eq("is_active", true);
      else if (filter === "draft") query = query.eq("is_active", false);
      else if (filter === "in_stock") query = query.gt("stock", 0);
      else if (filter === "out_of_stock") query = query.or("stock.is.null,stock.eq.0");
      else if (filter === "missing_product_type") query = query.is("product_type", null);
      else if (filter === "missing_google_category") query = query.is("google_product_category", null);
      else if (filter === "low_quality") query = query.or("quality_score.is.null,quality_score.lt.50");
      else if (filter === "locked") query = query.eq("ai_locked", true);
      else if (filter === "manual_override") query = query.eq("ai_manual_override", true);

      if (search) query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%,sku.ilike.%${search}%`);

      const { data: products, error: loadErr, count } = await query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
      if (loadErr) return json({ success: false, error: `Database query failed: ${loadErr.message}` }, 500, cors);
      if (!products?.length) return json({ success: true, action: "audit", totalCount: 0, returnedCount: 0, items: [], summary: { avgScore: 0, needsWork: 0, critical: 0, excellent: 0, good: 0 } }, 200, cors);

      const items = products.map((p: any) => {
        const scores = scoreProduct(p);
        const animal = p.animal_type || detectAnimal(p);
        return {
          id: p.id, name: p.name, slug: p.slug, sku: p.sku, category: p.category,
          product_type: p.product_type, google_product_category: p.google_product_category,
          price: p.price, stock: p.stock, is_active: p.is_active, image_url: p.image_url,
          animal_type: animal, shopping_title: p.shopping_title, short_title: p.short_title,
          meta_title: p.meta_title, meta_description: p.meta_description,
          ai_locked: p.ai_locked, ai_manual_override: p.ai_manual_override,
          quality_score: scores.overallScore, quality_label: scores.label,
          shopping_priority: scores.shoppingPriority, content_readiness: scores.contentReadiness,
          feed_readiness: scores.feedReadiness, confidence_tier: scores.confidenceTier,
          scores, flags: scores.flags,
          custom_label_0: p.custom_label_0, custom_label_1: p.custom_label_1,
          custom_label_2: p.custom_label_2, custom_label_3: p.custom_label_3, custom_label_4: p.custom_label_4,
          benefit_angle: p.benefit_angle, conversion_angle: p.conversion_angle,
        };
      });

      const needsWork = items.filter((i: any) => i.quality_score < 60).length;
      const critical = items.filter((i: any) => i.quality_score < 40).length;
      const avgScore = items.length > 0 ? Math.round(items.reduce((a: number, i: any) => a + i.quality_score, 0) / items.length) : 0;

      return json({
        success: true, action: "audit", totalCount: count || items.length,
        returnedCount: items.length, offset, limit, filter,
        summary: { avgScore, needsWork, critical, excellent: items.filter((i: any) => i.quality_score >= 80).length, good: items.filter((i: any) => i.quality_score >= 60 && i.quality_score < 80).length },
        items,
      }, 200, cors);
    }

    // ════════════════════════════════════════
    // ACTION: optimize
    // ════════════════════════════════════════
    if (action === "optimize") {
      const mode = body.mode || "titles";
      const dryRun = body.dryRun !== false;
      const limit = Math.min(body.limit || 20, 100);
      const offset = body.offset || 0;
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];

      let query = admin.from("products").select(SELECT_FIELDS).eq("is_active", true).eq("ai_locked", false).eq("ai_manual_override", false);
      if (ids.length > 0) query = admin.from("products").select(SELECT_FIELDS).in("id", ids);
      else query = query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);

      const { data: products, error: loadErr } = await query;
      if (loadErr) return json({ success: false, error: `DB error: ${loadErr.message}` }, 500, cors);
      if (!products?.length) return json({ success: true, action: "optimize", mode, totalProducts: 0, items: [], summary: { optimized: 0, fallback: 0, failed: 0, updated: 0 } }, 200, cors);

      // Create run record
      const { data: runData } = await admin.from("optimizer_runs").insert({
        mode: dryRun ? "preview" : "apply",
        trigger_source: "admin",
        total_products: products.length,
        initiated_by: userId,
        version: "v2-pro",
        config: { mode, dryRun, limit, offset },
      }).select("id").single();
      const runId = runData?.id;

      const results: any[] = [];
      let optimized = 0, fallback = 0, failed = 0, updated = 0;

      for (const p of products) {
        try {
          const item: any = { id: p.id, name: p.name, slug: p.slug, category: p.category, ok: true };
          const animal = p.animal_type || detectAnimal(p);
          const feature = p.key_feature || detectFeature(p);
          const productType = p.product_type || detectProductType(p);
          const googleCat = detectGoogleCategory({ ...p, product_type: productType });
          const primaryKw = inferPrimaryKeyword(p);
          const benefitAngle = p.benefit_angle || inferBenefitAngle(p);
          const conversionAngle = p.conversion_angle || inferConversionAngle(p);

          const beforeSnapshot: any = {
            shopping_title: p.shopping_title, short_title: p.short_title,
            optimized_description: p.optimized_description, meta_title: p.meta_title,
            meta_description: p.meta_description, product_type: p.product_type,
            google_product_category: p.google_product_category, animal_type: p.animal_type,
            key_feature: p.key_feature, primary_keyword: p.primary_keyword,
            custom_label_0: p.custom_label_0, custom_label_1: p.custom_label_1,
            custom_label_2: p.custom_label_2, custom_label_3: p.custom_label_3,
            custom_label_4: p.custom_label_4,
          };

          const updatePayload: any = {};

          // TITLES
          if (mode === "titles" || mode === "short_titles" || mode === "all") {
            const isShort = mode === "short_titles";
            const maxC = isShort ? 65 : 120;
            const aiTitle = await aiGenerate(LOVABLE_KEY,
              "You are a Google Shopping title specialist for GetPawsy.pet, a US pet supply store.",
              `Create one Google Shopping product title (${isShort ? "max 65 chars" : "70-120 chars"}).\nStructure: Primary Keyword + Product Type + Key Feature + Target Animal\nNo quotes, no promotional claims.\n\nProduct: ${p.name}\nCategory: ${p.category || ""}\nType: ${productType}\nSpecies: ${animal}\nFeature: ${feature}\nDescription: ${(p.description || "").slice(0, 200)}`
            );
            let finalTitle: string;
            let usedAI = false, usedFallback = false;
            if (aiTitle) {
              finalTitle = clamp(titleCase(dedupe(sanitize(aiTitle.replace(/^["']|["']$/g, "")))), maxC);
              if (finalTitle.length >= 15) usedAI = true;
              else { finalTitle = buildFallbackTitle(p, isShort); usedFallback = true; }
            } else { finalTitle = buildFallbackTitle(p, isShort); usedFallback = true; }
            if (usedFallback) fallback++;
            item.originalTitle = p.shopping_title || p.name;
            item.optimizedTitle = finalTitle;
            item.titleChars = finalTitle.length;
            item.usedAI = usedAI; item.usedFallback = usedFallback;
            if (isShort) updatePayload.short_title = finalTitle;
            else updatePayload.shopping_title = finalTitle;
            updatePayload.title_optimized_at = new Date().toISOString();
            if (mode === "all") {
              const shortTitle = buildFallbackTitle(p, true);
              item.shortTitle = shortTitle;
              updatePayload.short_title = shortTitle;
            }
          }

          // DESCRIPTIONS
          if (mode === "descriptions" || mode === "all") {
            const aiDesc = await aiGenerate(LOVABLE_KEY,
              "You are a product copywriter for GetPawsy.pet. Write conversion-focused product descriptions. No medical claims.",
              `Write a product description.\nFormat: 1) One-line intro (20-30 words) 2) Three bullet benefits 3) Use-case sentence 4) Trust closing\n\nProduct: ${p.name}\nCategory: ${p.category || ""}\nPrice: $${p.price}\nTarget: ${animal} owners\nDescription: ${(p.description || "").slice(0, 500)}\n\nReturn ONLY the text, no markdown headers.`
            );
            item.originalDescription = (p.description || "").slice(0, 200);
            if (aiDesc && aiDesc.length > 30) {
              item.optimizedDescription = aiDesc.trim();
              updatePayload.optimized_description = aiDesc.trim();
              const bullets = aiDesc.match(/[•\-\*]\s*.+/g)?.map((b: string) => b.replace(/^[•\-\*]\s*/, "").trim()) || [];
              if (bullets.length > 0) { item.bullets = bullets; updatePayload.description_bullets = bullets; }
            } else { fallback++; }
            updatePayload.description_optimized_at = new Date().toISOString();
          }

          // METADATA
          if (mode === "metadata" || mode === "all") {
            const aiMeta = await aiGenerate(LOVABLE_KEY,
              "You are an SEO specialist for GetPawsy.pet.",
              `Generate SEO metadata:\nName: ${p.name}\nCategory: ${p.category || ""}\nType: ${productType}\nSpecies: ${animal}\n\nReturn:\nSEO_TITLE: (50-60 chars)\nMETA_DESC: (150-160 chars)\nKEYWORDS: kw1, kw2, kw3, kw4, kw5\nKEYWORD_CLUSTER: (broader topic cluster)`
            );
            if (aiMeta) {
              const seoTitle = aiMeta.match(/SEO_TITLE:\s*(.+)/i)?.[1]?.trim();
              const metaDesc = aiMeta.match(/META_DESC:\s*(.+)/i)?.[1]?.trim();
              const keywords = aiMeta.match(/KEYWORDS:\s*(.+)/i)?.[1]?.split(",").map((k: string) => k.trim()).filter(Boolean);
              const cluster = aiMeta.match(/KEYWORD_CLUSTER:\s*(.+)/i)?.[1]?.trim();
              if (seoTitle) { item.seoTitle = seoTitle; updatePayload.seo_title = seoTitle; updatePayload.meta_title = seoTitle; }
              if (metaDesc) { item.seoMetaDescription = metaDesc; updatePayload.seo_meta_description = metaDesc; updatePayload.meta_description = metaDesc; }
              if (keywords?.length) { item.seoKeywords = keywords; updatePayload.seo_keywords = keywords; }
              if (cluster) { item.keywordCluster = cluster; updatePayload.keyword_cluster = cluster; }
            }
            updatePayload.metadata_optimized_at = new Date().toISOString();
          }

          // FEED ENRICHMENT (always for 'feed' mode or 'all')
          if (mode === "feed" || mode === "all") {
            updatePayload.product_type = productType || p.product_type;
            updatePayload.google_product_category = googleCat;
            updatePayload.animal_type = animal;
            updatePayload.key_feature = feature || p.key_feature;
            updatePayload.primary_keyword = primaryKw;
            updatePayload.benefit_angle = benefitAngle;
            updatePayload.conversion_angle = conversionAngle;
            updatePayload.slug_suggestion = slugify(p.name || "");
            item.suggestedProductType = productType;
            item.googleCategory = googleCat;
            item.animal = animal;
            item.keyFeature = feature;
            item.primaryKeyword = primaryKw;
            item.benefitAngle = benefitAngle;
            item.conversionAngle = conversionAngle;
          }

          // Compute scores
          const mergedProduct = { ...p, ...updatePayload };
          const scores = scoreProduct(mergedProduct);
          item.quality_score = scores.overallScore;
          item.quality_label = scores.label;
          item.shopping_priority = scores.shoppingPriority;
          item.content_readiness = scores.contentReadiness;
          item.feed_readiness = scores.feedReadiness;
          item.confidence_tier = scores.confidenceTier;
          item.flags = scores.flags;

          updatePayload.quality_score = scores.overallScore;
          updatePayload.quality_flags = scores.flags;
          updatePayload.shopping_priority_score = scores.shoppingPriority;
          updatePayload.content_readiness_score = scores.contentReadiness;
          updatePayload.feed_readiness_score = scores.feedReadiness;

          // Custom labels
          const labels = generateCustomLabels(mergedProduct, animal, scores);
          updatePayload.custom_label_0 = labels.l0;
          updatePayload.custom_label_1 = labels.l1;
          updatePayload.custom_label_2 = labels.l2;
          updatePayload.custom_label_3 = labels.l3;
          updatePayload.custom_label_4 = labels.l4;
          item.customLabels = labels;

          // Apply if not dry run
          if (!dryRun && Object.keys(updatePayload).length > 0) {
            updatePayload.ai_optimizer_status = "optimized";
            updatePayload.ai_optimizer_version = "v2-pro";
            updatePayload.ai_last_optimized_at = new Date().toISOString();

            const { error: updateErr } = await admin.from("products").update(updatePayload).eq("id", p.id);
            if (updateErr) { item.ok = false; item.error = updateErr.message; failed++; }
            else { updated++; item.applied = true; }

            // Log run item
            if (runId) {
              await admin.from("optimizer_run_items").insert({
                run_id: runId, product_id: p.id,
                status: item.ok ? "success" : "error",
                before_snapshot: beforeSnapshot,
                after_snapshot: updatePayload,
                error_message: item.error || null,
                used_ai: item.usedAI || false,
                used_fallback: item.usedFallback || false,
                scores: { overall: scores.overallScore, shopping: scores.shoppingPriority, content: scores.contentReadiness, feed: scores.feedReadiness },
              });
            }
          } else if (dryRun) {
            updatePayload.ai_last_preview_at = new Date().toISOString();
          }

          optimized++;
          results.push(item);
        } catch (err) {
          failed++;
          results.push({ id: p.id, name: p.name, ok: false, error: err instanceof Error ? err.message : "Unknown" });
        }
      }

      // Update run record
      if (runId) {
        await admin.from("optimizer_runs").update({
          success_count: optimized, error_count: failed, fallback_count: fallback,
          completed_at: new Date().toISOString(),
        }).eq("id", runId);
      }

      return json({
        success: true, action: "optimize", mode, dryRun, runId,
        totalProducts: products.length,
        summary: { optimized, fallback, failed, updated },
        items: results,
      }, 200, cors);
    }

    // ════════════════════════════════════════
    // ACTION: apply (batch)
    // ════════════════════════════════════════
    if (action === "apply") {
      const updates = body.updates;
      if (!Array.isArray(updates) || updates.length === 0) {
        return json({ success: false, error: "No updates provided" }, 400, cors);
      }

      let applied = 0, errors = 0;
      for (const u of updates) {
        if (!u.id || !u.fields) { errors++; continue; }
        u.fields.ai_optimizer_status = "optimized";
        u.fields.ai_optimizer_version = "v2-pro";
        u.fields.ai_last_optimized_at = new Date().toISOString();
        const { error } = await admin.from("products").update(u.fields).eq("id", u.id);
        if (error) errors++;
        else applied++;
      }

      return json({ success: true, action: "apply", applied, errors }, 200, cors);
    }

    // ════════════════════════════════════════
    // ACTION: rescore
    // ════════════════════════════════════════
    if (action === "rescore") {
      const limit = Math.min(body.limit || 50, 500);
      const offset = body.offset || 0;
      const { data: products, error: loadErr } = await admin.from("products").select(SELECT_FIELDS).eq("is_active", true).order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
      if (loadErr) return json({ success: false, error: `DB error: ${loadErr.message}` }, 500, cors);
      if (!products?.length) return json({ success: true, action: "rescore", updated: 0 }, 200, cors);

      let rescored = 0, errors = 0;
      for (const p of products) {
        const scores = scoreProduct(p);
        const animal = p.animal_type || detectAnimal(p);
        const labels = generateCustomLabels(p, animal, scores);
        const { error } = await admin.from("products").update({
          quality_score: scores.overallScore, quality_flags: scores.flags,
          shopping_priority_score: scores.shoppingPriority,
          content_readiness_score: scores.contentReadiness,
          feed_readiness_score: scores.feedReadiness,
          custom_label_0: labels.l0, custom_label_1: labels.l1,
          custom_label_2: labels.l2, custom_label_3: labels.l3, custom_label_4: labels.l4,
        }).eq("id", p.id);
        if (error) errors++;
        else rescored++;
      }

      return json({ success: true, action: "rescore", rescored, errors, total: products.length }, 200, cors);
    }

    // ════════════════════════════════════════
    // ACTION: rollback
    // ════════════════════════════════════════
    if (action === "rollback") {
      const runId = body.runId;
      if (!runId) return json({ success: false, error: "runId required" }, 400, cors);

      const { data: items, error: loadErr } = await admin.from("optimizer_run_items").select("*").eq("run_id", runId).eq("status", "success");
      if (loadErr) return json({ success: false, error: `DB error: ${loadErr.message}` }, 500, cors);
      if (!items?.length) return json({ success: true, action: "rollback", rolled_back: 0, message: "No items to rollback" }, 200, cors);

      let rolledBack = 0, errors = 0;
      for (const item of items) {
        if (!item.before_snapshot) continue;
        const { error } = await admin.from("products").update(item.before_snapshot).eq("id", item.product_id);
        if (error) errors++;
        else {
          rolledBack++;
          await admin.from("optimizer_run_items").update({ status: "rolled_back" }).eq("id", item.id);
        }
      }

      return json({ success: true, action: "rollback", rolled_back: rolledBack, errors }, 200, cors);
    }

    // ════════════════════════════════════════
    // ACTION: retry-failed
    // ════════════════════════════════════════
    if (action === "retry-failed") {
      const runId = body.runId;
      if (!runId) return json({ success: false, error: "runId required" }, 400, cors);

      const { data: failedItems } = await admin.from("optimizer_run_items").select("product_id").eq("run_id", runId).eq("status", "error");
      if (!failedItems?.length) return json({ success: true, action: "retry-failed", message: "No failed items" }, 200, cors);

      // Re-trigger optimize for these IDs
      const productIds = failedItems.map((i: any) => i.product_id);
      // Recursively call optimize with these IDs
      return json({ success: true, action: "retry-failed", retryIds: productIds, message: `Found ${productIds.length} failed items. Use optimize action with these ids.` }, 200, cors);
    }

    // ════════════════════════════════════════
    // ACTION: runs (history)
    // ════════════════════════════════════════
    if (action === "runs") {
      const limit = Math.min(body.limit || 20, 100);
      const { data: runs, error } = await admin.from("optimizer_runs").select("*").order("started_at", { ascending: false }).limit(limit);
      if (error) return json({ success: false, error: error.message }, 500, cors);
      return json({ success: true, action: "runs", runs: runs || [] }, 200, cors);
    }

    // ════════════════════════════════════════
    // ACTION: lock / unlock
    // ════════════════════════════════════════
    if (action === "lock" || action === "unlock") {
      const ids = body.ids;
      if (!Array.isArray(ids) || ids.length === 0) return json({ success: false, error: "ids required" }, 400, cors);
      const value = action === "lock";
      const { error } = await admin.from("products").update({ ai_locked: value }).in("id", ids);
      if (error) return json({ success: false, error: error.message }, 500, cors);
      return json({ success: true, action, updated: ids.length }, 200, cors);
    }

    // ════════════════════════════════════════
    // ACTION: set-manual-override
    // ════════════════════════════════════════
    if (action === "set-manual-override") {
      const ids = body.ids;
      const value = body.value !== false;
      if (!Array.isArray(ids)) return json({ success: false, error: "ids required" }, 400, cors);
      const { error } = await admin.from("products").update({ ai_manual_override: value }).in("id", ids);
      if (error) return json({ success: false, error: error.message }, 500, cors);
      return json({ success: true, action, updated: ids.length }, 200, cors);
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400, cors);
  } catch (err) {
    console.error("[optimizer-pro] CRASH:", err);
    return json({ success: false, error: "Unexpected server error", details: err instanceof Error ? err.message : "Unknown" }, 500, cors);
  }
});
