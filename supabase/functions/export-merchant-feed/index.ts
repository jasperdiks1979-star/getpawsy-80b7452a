import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.pet";
const BRAND = "GetPawsy";
const YEAR = new Date().getFullYear();

// ── Policy-sensitive product blocklist ──────────────────────────────
const BLOCKED_PRODUCT_IDS = new Set([
  "2233541f-b223-4a76-8572-272f971aacd2",
  "16f69eff-5135-4428-a2ac-fe93ca9c18e5",
  "2578d864-6fc6-432c-9834-c0dfb9237630",
  "cf85b323-66fd-4dd1-acb5-1c145b7a183b",
  "3aa3fe57-9c05-49ff-92de-3af0b924d5c6",
  "3eebf00e-d074-49f4-927c-9f68540de056",
  "46d3a6e0-4252-4480-bea3-2f179ffed8bb",
  "2de6f9bd-b9b9-4dd6-8f66-2a2654c418bc",
  "d578c6e1-eeb8-4129-8412-f5fbdae3479b",
  "b1f32db4-baa7-46df-aa74-2462974f74f5",
  "45b9c1dd-b459-458b-a78a-fe6b8fc7e179",
  "63b6933b-c43c-46fb-a41f-99304b42c083",
  "b29264c0-aab5-485f-844f-e649767dacda",
  "87725039-fcfd-4505-b8b8-660974478cae",
  "3587a2ea-4721-4ad1-8390-93b5a891261e",
  "8db4321c-896f-4341-aaca-80adc2241b1f",
  "274d17f0-2928-431d-9ff5-a1573cefe353",
  "b9a3b924-2683-4e76-8a8c-9c00410562a3",
  "58764079-8a5a-47f9-ba9e-772d412eb0a9",
  "eb8e67d1-06b9-48d9-a939-d76d50ce5633",
  "1cebc2d5-1e84-4002-a062-4b747c36cab4",
  "42823f27-f3ec-4494-a081-73c7fbc029e0",
  "303c9938-3c45-4ce7-b925-61786b69c5f7",
]);

// Policy-unsafe keywords — exclude any product matching these
const POLICY_UNSAFE_PATTERNS = [
  /shock\s*(collar|training|correction|system|fence|boundary)/i,
  /static\s*correction/i,
  /electric\s*(fence|collar|training|shock|boundary)/i,
  /boundary\s*shock/i,
  /e-shock/i,
  /bark\s*(shock|static)/i,
  /aversive\s*training/i,
];

function isPolicySensitive(name: string, desc: string): boolean {
  const text = `${name} ${desc}`;
  return POLICY_UNSAFE_PATTERNS.some(p => p.test(text));
}

// ── Compliance sanitizer ──────────────────────────────────────────

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
  /click\s*here/gi, /order\s*now/gi, /product\s*image:/gi,
  /please\s*note/gi, /if\s*you'?d\s*like/gi,
];

const BANNED_TITLE_WORDS: RegExp[] = [
  /\bbest\b/gi, /\bpremium\b/gi, /\b(amazing|incredible|fantastic|awesome)\b/gi,
  /\bexclusive\b/gi, /\bluxury\b/gi, /\bultimate\b/gi, /\bhot\s*sale\b/gi, /\b(free|gratis)\b/gi,
];

const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;
const MARKDOWN_RE = /\*{1,2}([^*]+)\*{1,2}/g;

function sanitizeTitle(title: string): string {
  let r = title;
  r = r.replace(EMOJI_RE, "");
  for (const re of BANNED_TITLE_WORDS) r = r.replace(re, "");
  for (const re of BANNED_PHRASES) r = r.replace(re, "");
  // Fix double words like "Ret retractable"
  r = r.replace(/\b(\w+)\s+\1\b/gi, "$1");
  r = r.replace(/\b([A-Z]{5,})\b/g, (m) => m.charAt(0) + m.slice(1).toLowerCase());
  r = r.replace(/\s{2,}/g, " ").trim();
  r = r.replace(/^[,.\-–—:;|]+\s*/, "").replace(/\s*[,.\-–—:;|]+$/, "");
  if (!/^GetPawsy\b/i.test(r)) r = `GetPawsy ${r}`;
  return r.substring(0, 150).trim();
}

function sanitizeDescription(desc: string): string {
  let r = desc;
  r = r.replace(HTML_TAG_RE, " ");
  r = r.replace(EMOJI_RE, "");
  r = r.replace(MARKDOWN_RE, "$1"); // strip markdown bold/italic
  for (const re of BANNED_PHRASES) r = r.replace(re, "");
  r = r.replace(/[•●◦▪▸►➤➜→←↓↑⇒⇨※☆♦♥♠♣✔✓✅☑]/g, "");
  r = r.replace(/&nbsp;/gi, " ");
  r = r.replace(/&amp;/gi, "&");
  r = r.replace(/&lt;/gi, "<");
  r = r.replace(/&gt;/gi, ">");
  r = r.replace(/&quot;/gi, '"');
  r = r.replace(/\s{2,}/g, " ").trim();
  return r.substring(0, 5000);
}

function guessAnimal(text: string): string {
  if (/\bdog\b/i.test(text)) return "dogs";
  if (/\bcat\b/i.test(text)) return "cats";
  if (/\bbird\b/i.test(text)) return "birds";
  if (/\b(hamster|guinea\s*pig|rabbit)\b/i.test(text)) return "small animals";
  if (/\b(fish|aquarium)\b/i.test(text)) return "fish";
  return "pets";
}

function guessType(name: string): string {
  if (/\b(bed|mat|cushion)\b/i.test(name)) return "pet bed";
  if (/\b(collar|harness)\b/i.test(name)) return "collar/harness";
  if (/\b(leash|lead|rope)\b/i.test(name)) return "leash";
  if (/\b(toy|ball|chew|squeaky|laser)\b/i.test(name)) return "pet toy";
  if (/\b(bowl|feeder|fountain|dispenser)\b/i.test(name)) return "feeding accessory";
  if (/\b(brush|grooming|trimmer|grinder|comb)\b/i.test(name)) return "grooming tool";
  if (/\b(carrier|crate|cage|stroller|trolley)\b/i.test(name)) return "pet carrier";
  if (/\b(sweater|jacket|coat|bandana|hood|apparel)\b/i.test(name)) return "pet apparel";
  if (/\b(tree|tower|scratcher|condo)\b/i.test(name)) return "cat furniture";
  if (/\b(litter)\b/i.test(name)) return "litter box";
  if (/\b(gate|barrier)\b/i.test(name)) return "pet gate";
  if (/\b(bag|waste|poop)\b/i.test(name)) return "waste management accessory";
  return "pet accessory";
}

function generateDescription(name: string): string {
  const animal = guessAnimal(name);
  const type = guessType(name);
  return `${name} – a ${type} designed for ${animal}. Built for everyday comfort and practical use. Check product listing for available sizes and options.`;
}

// Google Product Category IDs (numeric)
const GCAT: Record<string, number> = {
  "Dog Beds": 4985,
  "Dog Toys": 5004,
  "Dog Collars & Leashes": 5001,
  "Dog Food & Treats": 4989,
  "Dog Grooming": 4993,
  "Dog Clothing": 5003,
  "Dog Bowls & Feeders": 4997,
  "Dog Carriers": 6981,
  "Dog Training": 5005,
  "Dog Houses": 6981,
  "Dog Crates & Kennels": 6981,
  "Dog Feeding Supplies": 4997,
  "Dog Waste Management": 8069,
  "Dog Safety Gates": 6383,
  "Pet Houses": 6981,
  "Pet Beds": 4516,
  "Pet Carriers": 6978,
  "Pet Feeding Supplies": 4997,
  "Cat Beds": 5008,
  "Cat Toys": 5019,
  "Cat Trees & Condos": 5020,
  "Cat Scratching Posts": 5020,
  "Cat Litter Boxes": 5010,
  "Cat Bowls & Feeders": 5017,
  "Cat Carriers": 6983,
  "Cat Grooming": 5015,
  "Cat Houses": 5007,
  "Cat Furniture": 5007,
  "Cat Hammocks": 5007,
  "Cat Collars & Accessories": 5016,
  "Cat Food & Treats": 5013,
  "Bird Cages": 5022,
  "Bird Toys": 5024,
  "Bird Bowls & Feeders": 5023,
  "Fish Tanks": 5040,
  "Small Pet Accessories": 5045,
  "Pet Training": 5005,
  "Pet Collars & Leashes": 5001,
  "Pet Bags": 6978,
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

    // Fetch feed-eligible products (active, non-duplicate, in stock)
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
      policy_blocked: 0,
      titles_optimized: 0, descriptions_generated: 0,
      missing_image: 0, missing_slug: 0, missing_price: 0,
      categories_mapped: 0, categories_unmapped: 0,
      with_sale_price: 0, avg_title_len: 0, avg_desc_len: 0,
      issues: {} as Record<string, number>,
    };

    const feedItems: Array<Record<string, unknown>> = [];

    for (const p of allProducts) {
      // Block policy-sensitive products
      if (BLOCKED_PRODUCT_IDS.has(p.id) || isPolicySensitive(p.name, p.description || "")) {
        audit.policy_blocked++;
        audit.excluded++;
        continue;
      }

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
          "X-Export-Total": String(feedItems.length),
          "X-Export-Duplicates": "0",
          "X-Export-Inactive": "0",
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
