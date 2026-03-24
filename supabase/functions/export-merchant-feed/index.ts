import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.pet";
const BRAND = "GetPawsy";
const YEAR = new Date().getFullYear();

// ── Compliance sanitizer (inlined) ──────────────────────────────

const BANNED_PHRASES: RegExp[] = [
  /free\s*shipping/gi, /ships?\s*from/gi, /fast\s*delivery/gi,
  /\d+[-–]\d+\s*business\s*days?/gi, /\d+[-–]?\s*day\s*returns?/gi,
  /hassle[-\s]*free\s*returns?/gi, /money\s*back/gi, /satisfaction\s*guarantee[d]?/gi,
  /risk[-\s]*free/gi, /no\s*questions?\s*asked/gi, /trusted\s*by/gi,
  /best\s*seller/gi, /bestseller/gi, /top[-\s]*rated/gi, /premium\s*quality/gi,
  /limited\s*(time\s*)?offer/gi, /shop\s*now/gi, /order\s*today/gi,
  /exclusive\s*(deal|offer|price)?/gi, /must[-\s]*have/gi,
  /your\s*pet\s*deserves/gi, /perfect\s*for/gi, /amazing/gi, /incredible/gi,
  /guaranteed/gi, /act\s*now/gi, /don'?t\s*miss/gi, /hurry/gi,
  /while\s*supplies?\s*last/gi, /limited\s*stock/gi, /only\s*\d+\s*left/gi,
  /sale\s*ends?/gi, /save\s*\d+%/gi, /\d+%\s*off/gi, /buy\s*now/gi, /add\s*to\s*cart/gi,
  /no\s*smell(?:\s*guaranteed)?/gi, /no\s*scooping\s*ever/gi,
  /fully\s*automatic/gi, /100%\s*automatic/gi,
  /✔/g, /✓/g, /★+/g, /⭐+/g, /🏆/g, /🥇/g, /💯/g, /🔥/g, /✅/g, /🎉/g, /🚚/g, /📦/g,
  /vet[-\s]*recommended/gi, /vet[-\s]*approved/gi,
];

const BANNED_TITLE_WORDS: RegExp[] = [
  /\bbest\b/gi, /\bpremium\b/gi, /\b(amazing|incredible|fantastic|awesome)\b/gi,
  /\bexclusive\b/gi, /\bluxury\b/gi, /\bultimate\b/gi, /\bhot\s*sale\b/gi, /\b(free|gratis)\b/gi,
];

const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;

function sanitizeTitle(title: string): string {
  let r = title;
  r = r.replace(EMOJI_RE, "");
  for (const re of BANNED_TITLE_WORDS) r = r.replace(re, "");
  for (const re of BANNED_PHRASES) r = r.replace(re, "");
  r = r.replace(/\b([A-Z]{5,})\b/g, (m) => m.charAt(0) + m.slice(1).toLowerCase());
  r = r.replace(/\s{2,}/g, " ").trim();
  r = r.replace(/^[,.\-–—:;|]+\s*/, "").replace(/\s*[,.\-–—:;|]+$/, "");
  // Brand prefix
  if (!/^GetPawsy\b/i.test(r)) r = `GetPawsy ${r}`;
  return r.substring(0, 150).trim();
}

function sanitizeDescription(desc: string): string {
  let r = desc;
  r = r.replace(HTML_TAG_RE, " ");
  r = r.replace(EMOJI_RE, "");
  for (const re of BANNED_PHRASES) r = r.replace(re, "");
  r = r.replace(/[•●◦▪▸►➤➜→←↓↑⇒⇨※☆♦♥♠♣✔✓✅☑]/g, "");
  r = r.replace(/\s{2,}/g, " ").trim();
  return r.substring(0, 5000);
}

function guessAnimal(text: string): string {
  if (/\bdog\b/i.test(text)) return "dogs";
  if (/\bcat\b/i.test(text)) return "cats";
  if (/\bbird\b/i.test(text)) return "birds";
  if (/\b(hamster|guinea\s*pig|rabbit)\b/i.test(text)) return "small animals";
  if (/\b(fish|aquarium)\b/i.test(text)) return "fish";
  if (/\breptile\b/i.test(text)) return "reptiles";
  return "pets";
}

function guessType(name: string): string {
  if (/\b(bed|mat|cushion)\b/i.test(name)) return "pet bed";
  if (/\b(collar|harness)\b/i.test(name)) return "collar/harness";
  if (/\b(leash|lead)\b/i.test(name)) return "leash";
  if (/\b(toy|ball|chew|squeaky)\b/i.test(name)) return "pet toy";
  if (/\b(bowl|feeder|fountain)\b/i.test(name)) return "feeding accessory";
  if (/\b(brush|grooming|trimmer)\b/i.test(name)) return "grooming tool";
  if (/\b(carrier|crate|cage)\b/i.test(name)) return "pet carrier";
  if (/\b(sweater|jacket|coat|bandana|hood)\b/i.test(name)) return "pet apparel";
  if (/\b(tree|tower|scratcher)\b/i.test(name)) return "cat furniture";
  if (/\b(litter)\b/i.test(name)) return "litter box";
  return "pet accessory";
}

function generateDescription(name: string): string {
  const animal = guessAnimal(name);
  const type = guessType(name);
  return `${name} is a ${type} designed for ${animal}. Built for everyday comfort and practical use. Check product listing for available sizes and options. Suitable for ${animal} depending on the selected size.`;
}

// Google Product Category IDs
const GCAT: Record<string, number> = {
  "Dog Beds": 4985, "Dog Toys": 5004, "Dog Collars & Leashes": 5001,
  "Dog Food & Treats": 4989, "Dog Grooming": 4993, "Dog Clothing": 5003,
  "Dog Bowls & Feeders": 4997, "Dog Carriers": 6981, "Dog Training": 5005,
  "Dog Houses": 6981, "Pet Houses": 6981, "Pet Beds": 4516,
  "Cat Beds": 5008, "Cat Toys": 5019, "Cat Trees & Condos": 5020,
  "Cat Scratching Posts": 5020, "Cat Litter Boxes": 5010,
  "Cat Bowls & Feeders": 5017, "Cat Carriers": 6983, "Cat Grooming": 5015,
  "Cat Houses": 5007, "Cat Furniture": 5007, "Cat Hammocks": 5007,
  "Cat Collars & Accessories": 5016, "Cat Food & Treats": 5013,
  "Bird Cages": 5022, "Bird Toys": 5024, "Bird Bowls & Feeders": 5023,
  "Bird Houses": 5022, "Bird Perches": 5022, "Bird Nests": 5022,
  "Fish Tanks": 5040, "Hamster Cages": 5045, "Hamster Wheels": 5045,
  "Rabbit Cages": 5045, "Guinea Pig Cages": 5045, "Guinea Pig Toys": 5045,
  "Reptile Terrariums": 5054, "Reptile Lighting": 5054,
  "Small Pet Accessories": 5045, "Pet Training": 5005,
  "Pet Collars & Leashes": 5001, "Pet Bags": 6978,
};

function normalizeWeight(grams: number | null): number {
  let g = grams ?? 0;
  if (!g || isNaN(g)) return 0.2;
  let kg = g > 50 ? g / 1000 : g;
  if (kg < 0.05) kg = 0.2;
  if (kg > 25) kg = 25;
  return Math.round(kg * 100) / 100;
}

interface Product {
  id: string; name: string; slug: string | null; sku: string | null;
  category: string | null; price: number; compare_at_price: number | null;
  description: string | null; image_url: string | null; images: string[] | null;
  stock: number | null; weight: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer "))
      return Response.json({ error: "Auth required" }, { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user)
      return Response.json({ error: "Invalid auth" }, { status: 401, headers: corsHeaders });
    const { data: roleData } = await supabase.from("user_roles")
      .select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleData)
      return Response.json({ error: "Admin required" }, { status: 403, headers: corsHeaders });

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "json";

    // Fetch feed-eligible products
    const allProducts: Product[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from("products")
        .select("id, name, slug, sku, category, price, compare_at_price, description, image_url, images, stock, weight")
        .eq("is_active", true).eq("is_duplicate", false).gt("stock", 0)
        .order("stock", { ascending: false }).range(from, from + 999);
      if (error) throw new Error(`DB: ${error.message}`);
      if (!data || data.length === 0) break;
      allProducts.push(...(data as Product[]));
      if (data.length < 1000) break;
      from += 1000;
    }

    const audit = {
      total_scanned: allProducts.length, included: 0, excluded: 0,
      titles_optimized: 0, descriptions_generated: 0,
      missing_image: 0, missing_slug: 0, missing_price: 0,
      categories_mapped: 0, categories_unmapped: 0,
      with_sale_price: 0, avg_title_len: 0, avg_desc_len: 0,
      issues: {} as Record<string, number>,
    };

    const feedItems: Array<Record<string, unknown>> = [];

    for (const p of allProducts) {
      if (!p.slug) { audit.missing_slug++; audit.excluded++; continue; }
      if (!p.price || p.price <= 0) { audit.missing_price++; audit.excluded++; continue; }
      if (!p.image_url) { audit.missing_image++; audit.excluded++; continue; }

      // Title
      let title = sanitizeTitle(p.name);
      const titleChanged = title !== p.name;
      if (titleChanged) audit.titles_optimized++;
      if (!title.includes(String(YEAR)) && title.length + 7 <= 150) title += ` ${YEAR}`;

      // Description
      let desc = p.description || "";
      desc = sanitizeDescription(desc);
      if (desc.length < 100) { desc = generateDescription(p.name); audit.descriptions_generated++; }

      // Pricing
      const hasSale = p.compare_at_price !== null && p.compare_at_price > p.price;
      if (hasSale) audit.with_sale_price++;

      // Category
      const gcat = GCAT[p.category || ""] || null;
      if (gcat) audit.categories_mapped++; else { audit.categories_unmapped++; audit.issues["no_category"] = (audit.issues["no_category"] || 0) + 1; }

      // Images
      const additionalImgs = (p.images || [])
        .filter((img: string) => img && img !== p.image_url && img.startsWith("http"))
        .slice(0, 4);
      if (additionalImgs.length === 0) audit.issues["single_image"] = (audit.issues["single_image"] || 0) + 1;

      const weightKg = normalizeWeight(p.weight);
      const productType = p.category ? `Pet Supplies > ${p.category}` : "Pet Supplies";

      feedItems.push({
        id: `getpawsy_${p.id}`,
        title,
        description: desc,
        link: `${BASE_URL}/product/${p.slug}`,
        image_link: p.image_url,
        additional_image_link: additionalImgs.join(","),
        availability: "in stock",
        condition: "new",
        price: hasSale ? `${p.compare_at_price!.toFixed(2)} USD` : `${p.price.toFixed(2)} USD`,
        sale_price: hasSale ? `${p.price.toFixed(2)} USD` : "",
        brand: BRAND,
        google_product_category: gcat ?? "",
        product_type: productType,
        identifier_exists: "no",
        shipping_weight: `${weightKg} kg`,
      });
      audit.included++;
    }

    if (feedItems.length > 0) {
      audit.avg_title_len = Math.round(feedItems.reduce((s, f) => s + String(f.title).length, 0) / feedItems.length);
      audit.avg_desc_len = Math.round(feedItems.reduce((s, f) => s + String(f.description).length, 0) / feedItems.length);
    }

    // CSV format
    if (format === "csv") {
      const cols = ["id","title","description","link","image_link","additional_image_link","availability","condition","price","sale_price","brand","google_product_category","product_type","identifier_exists","shipping_weight"];
      const esc = (v: unknown) => { const s = String(v ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const lines = [cols.join(",")];
      for (const f of feedItems) lines.push(cols.map(c => esc(f[c])).join(","));
      return new Response("\uFEFF" + lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="getpawsy_merchant_feed_${new Date().toISOString().split("T")[0]}.csv"`,
          "X-Feed-Total": String(feedItems.length),
          ...corsHeaders,
        },
      });
    }

    // Audit format
    if (format === "audit") {
      return Response.json({
        ok: true, audit,
        sample: feedItems.slice(0, 15).map(f => ({ id: f.id, title: f.title, link: f.link, price: f.price, sale_price: f.sale_price, category: f.google_product_category })),
      }, { headers: corsHeaders });
    }

    // JSON feed
    return Response.json({
      ok: true,
      feed_info: { brand: BRAND, total_products: feedItems.length, generated_at: new Date().toISOString(), target_country: "US", content_language: "en" },
      audit,
      products: feedItems,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("Feed export error:", err);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500, headers: corsHeaders });
  }
});
