import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.pet";
const BRAND = "GetPawsy";

// ── Hard-blocked product IDs (policy-sensitive) ─────────────────────
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

// ── Policy-unsafe keyword patterns ──────────────────────────────────
const POLICY_UNSAFE_PATTERNS = [
  /shock\s*(collar|training|correction|system|fence|boundary)?/i,
  /static\s*correction/i,
  /electric\s*(fence|collar|training|shock|boundary)/i,
  /boundary\s*shock/i,
  /e-shock/i,
  /bark\s*(shock|static)/i,
  /aversive\s*training/i,
  /wireless\s*fence/i,
  /training\s*collar/i,
  /electric\s*collar/i,
  /containment\s*system/i,
  /anti[-\s]*bark\s*(shock|static|electric)/i,
  /correction\s*collar/i,
  /pet\s*shock/i,
  /zap/i,
  /prong\s*collar/i,
  /choke\s*chain/i,
];

function isPolicySensitive(name: string, desc: string): boolean {
  const text = `${name} ${desc}`.toLowerCase();
  return POLICY_UNSAFE_PATTERNS.some(p => p.test(text));
}

// ── Title cleaning ──────────────────────────────────────────────────

const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;
const MARKDOWN_RE = /\*{1,2}([^*]+)\*{1,2}/g;
const SMART_QUOTES_RE = /[""'']/g;

const TITLE_BANNED = [
  /\b(best|premium|amazing|incredible|fantastic|awesome|exclusive|luxury|ultimate)\b/gi,
  /\b(hot\s*sale|free|gratis|limited\s*(time\s*)?(offer)?|buy\s*now|shop\s*now|order\s*(now|today))\b/gi,
  /\b(top[-\s]*rated|must[-\s]*have|bestseller|best\s*seller|guaranteed)\b/gi,
  /\bfree\s*shipping\b/gi,
  /\bno\s*\d+\b/gi,
  /\d+%\s*off/gi,
  /sale\s*ends?/gi,
];

function sanitizeTitle(raw: string): string {
  let t = raw;
  // Strip HTML, markdown, emojis, smart quotes
  t = t.replace(HTML_TAG_RE, " ");
  t = t.replace(MARKDOWN_RE, "$1");
  t = t.replace(EMOJI_RE, "");
  t = t.replace(SMART_QUOTES_RE, "");
  t = t.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "").replace(/&gt;/gi, "").replace(/&quot;/gi, "");

  // Remove banned promotional words
  for (const re of TITLE_BANNED) t = t.replace(re, "");

  // Fix duplicate consecutive words: "Ret retractable" → "retractable", "Dog Dog" → "Dog"
  t = t.replace(/\b(\w+)\s+\1\b/gi, "$1");

  // Fix partial-duplicate like "Ret retractable" (partial prefix then full word)
  t = t.replace(/\b([A-Z][a-z]{1,4})\s+([a-z]+)\b/g, (_match, prefix, full) => {
    if (full.toLowerCase().startsWith(prefix.toLowerCase())) return full;
    return `${prefix} ${full}`;
  });

  // Remove duplicate "GetPawsy" if present
  t = t.replace(/GetPawsy\s+GetPawsy/gi, "GetPawsy");

  // Fix ALL CAPS words (5+ chars)
  t = t.replace(/\b([A-Z]{5,})\b/g, (m) => m.charAt(0) + m.slice(1).toLowerCase());

  // Clean up whitespace and trailing punctuation
  t = t.replace(/\s{2,}/g, " ").trim();
  t = t.replace(/^[,.\-–—:;|/]+\s*/, "").replace(/\s*[,.\-–—:;|/]+$/, "");
  t = t.replace(/\s*–\s*–\s*/g, " – "); // double dashes

  // Brand prefix (only once, only if missing)
  if (!/^GetPawsy\b/i.test(t)) t = `GetPawsy ${t}`;

  // Hard cap at 120 chars
  if (t.length > 120) {
    t = t.substring(0, 117).replace(/\s+\S*$/, "") + "...";
  }

  return t.trim();
}

// ── Description cleaning ────────────────────────────────────────────

const DESC_STRIP_PHRASES: RegExp[] = [
  /please\s*note\b[^.]*\./gi,
  /click\s*here\b[^.]*\./gi,
  /order\s*(now|today)\b[^.]*\./gi,
  /if\s*you'?d\s*like\b[^.]*\./gi,
  /product\s*image\s*:?\s*/gi,
  /note\s*:\s*this\s*(category|product)\s*(was|is)\s*[^.]*\./gi,
  /\*\*[^*]+\*\*/g, // markdown bold blocks
  /free\s*shipping\b[^.]*\./gi,
  /\d+[-–]\s*day\s*returns?\b[^.]*\./gi,
  /money[-\s]*back\s*guarantee\b[^.]*\./gi,
  /satisfaction\s*guarantee[d]?\b[^.]*\./gi,
  /risk[-\s]*free\b[^.]*\./gi,
  /no\s*questions?\s*asked\b[^.]*\./gi,
  /trusted\s*by\b[^.]*\./gi,
  /limited\s*(time\s*)?offer\b[^.]*\./gi,
  /act\s*now\b[^.]*\./gi,
  /don'?t\s*miss\b[^.]*\./gi,
  /hurry\b[^.]*\./gi,
  /while\s*supplies?\s*last\b[^.]*\./gi,
  /limited\s*stock\b[^.]*\./gi,
  /only\s*\d+\s*left\b[^.]*\./gi,
  /save\s*\d+%\b[^.]*\./gi,
  /add\s*to\s*cart\b[^.]*\./gi,
  /buy\s*now\b[^.]*\./gi,
  /vet[-\s]*(recommended|approved)\b[^.]*\./gi,
  /100%\s*automatic\b/gi,
  /fully\s*automatic\b/gi,
  /no\s*smell\s*guaranteed\b/gi,
  /no\s*scooping\s*ever\b/gi,
  /your\s*pet\s*deserves\b[^.]*\./gi,
  /tired\s*of\b[^.]*\?\s*/gi,  // "Tired of X?" rhetorical openers
  /say\s*goodbye\s*to\b[^.]*\./gi,
  /introducing\b[^.]*\./gi,
];

const DESC_BANNED_CHARS = /[✔✓★⭐🏆🥇💯🔥✅🎉🚚📦•●◦▪▸►➤➜→←↓↑⇒⇨※☆♦♥♠♣☑]/g;

function sanitizeDescription(desc: string): string {
  let d = desc;

  // Strip HTML tags
  d = d.replace(HTML_TAG_RE, " ");
  // Strip markdown
  d = d.replace(MARKDOWN_RE, "$1");
  d = d.replace(/\*+/g, "");
  // Strip emojis + special chars
  d = d.replace(EMOJI_RE, "");
  d = d.replace(DESC_BANNED_CHARS, "");
  d = d.replace(SMART_QUOTES_RE, '"');

  // HTML entities
  d = d.replace(/&nbsp;/gi, " ");
  d = d.replace(/&amp;/gi, "&");
  d = d.replace(/&lt;/gi, "<");
  d = d.replace(/&gt;/gi, ">");
  d = d.replace(/&quot;/gi, '"');
  d = d.replace(/&#\d+;/g, " ");

  // Remove banned phrase patterns
  for (const re of DESC_STRIP_PHRASES) d = d.replace(re, " ");

  // Remove any remaining promotional words inline
  d = d.replace(/\b(amazing|incredible|fantastic|awesome|exclusive|ultimate|luxury|premium)\b/gi, "");

  // Normalize whitespace
  d = d.replace(/\n{3,}/g, "\n\n");
  d = d.replace(/\s{2,}/g, " ");
  d = d.trim();

  // Cap at 1000 chars for Merchant (Google allows 5000 but clean+short is better)
  if (d.length > 1000) {
    d = d.substring(0, 997).replace(/\s+\S*$/, "") + "...";
  }

  return d;
}

// ── Auto-generate fallback description ──────────────────────────────

function guessAnimal(text: string): string {
  const t = text.toLowerCase();
  if (/\bdog\b/.test(t)) return "dogs";
  if (/\bcat\b/.test(t)) return "cats";
  if (/\b(bird|parrot)\b/.test(t)) return "birds";
  if (/\b(hamster|guinea\s*pig|rabbit)\b/.test(t)) return "small animals";
  if (/\b(fish|aquarium)\b/.test(t)) return "fish";
  return "pets";
}

function guessProductType(name: string): string {
  const n = name.toLowerCase();
  if (/\b(leash|lead|rope|traction)\b/.test(n)) return "leash";
  if (/\b(collar|harness)\b/.test(n)) return "collar/harness";
  if (/\b(bed|mat|cushion|pillow)\b/.test(n)) return "pet bed";
  if (/\b(toy|ball|chew|squeaky|laser|teaser)\b/.test(n)) return "toy";
  if (/\b(bowl|feeder|fountain|dispenser|water)\b/.test(n)) return "feeding accessory";
  if (/\b(brush|grooming|trimmer|grinder|comb|deshed|glove)\b/.test(n)) return "grooming tool";
  if (/\b(carrier|crate|cage|stroller|trolley|backpack)\b/.test(n)) return "carrier";
  if (/\b(sweater|jacket|coat|bandana|hood|apparel|vest|costume)\b/.test(n)) return "pet apparel";
  if (/\b(tree|tower|scratcher|condo|climbing)\b/.test(n)) return "cat tree";
  if (/\b(litter)\b/.test(n)) return "litter box";
  if (/\b(gate|barrier|fence)\b/.test(n)) return "pet gate";
  if (/\b(bag|waste|poop)\b/.test(n)) return "waste accessory";
  return "pet accessory";
}

function generateFallbackDescription(name: string): string {
  const animal = guessAnimal(name);
  const type = guessProductType(name);
  return `${name} – a ${type} designed for ${animal}. Built for everyday comfort and practical use. See product listing for available sizes and color options.`;
}

// ── Category correction engine ──────────────────────────────────────
// This overrides whatever category is stored in DB with the CORRECT one
// based on actual product name keywords

function correctCategory(name: string, dbCategory: string | null): string {
  const n = name.toLowerCase();

  // Leashes
  if (/\b(leash|lead|traction\s*rope)\b/.test(n)) return "Dog Collars & Leashes";
  // Harnesses
  if (/\bharness\b/.test(n)) return "Dog Collars & Leashes";
  // Collars (non-shock)
  if (/\bcollar\b/.test(n) && !/shock|electric|training/i.test(n)) return "Dog Collars & Leashes";

  // Cat trees / towers / condos / scratching posts
  if (/\b(cat\s*tree|cat\s*tower|cat\s*condo|scratching\s*post|cat\s*scratcher|climbing\s*frame)\b/.test(n)) return "Cat Trees & Condos";

  // Cat litter boxes
  if (/\b(litter\s*box|litter\s*tray|cat\s*toilet|cat\s*litter)\b/.test(n)) return "Cat Litter Boxes";

  // Carriers, strollers, backpacks
  if (/\b(carrier|stroller|trolley|travel\s*bag|pet\s*backpack)\b/.test(n)) {
    if (/\bcat\b/.test(n)) return "Cat Carriers";
    if (/\bdog\b/.test(n)) return "Dog Carriers";
    return "Pet Carriers";
  }

  // Grooming
  if (/\b(grooming|trimmer|brush|comb|deshed|nail\s*(grinder|clipper)|glove)\b/.test(n)) {
    if (/\bcat\b/.test(n)) return "Cat Grooming";
    return "Dog Grooming";
  }

  // Beds
  if (/\b(bed|mat|cushion|pillow|blanket)\b/.test(n)) {
    if (/\bcat\b/.test(n)) return "Cat Beds";
    return "Dog Beds";
  }

  // Toys
  if (/\b(toy|ball|squeaky|chew|teaser|laser|feather\s*wand)\b/.test(n)) {
    if (/\bcat\b/.test(n)) return "Cat Toys";
    return "Dog Toys";
  }

  // Bowls / Feeders / Water
  if (/\b(bowl|feeder|fountain|water\s*dispenser|food\s*dispenser)\b/.test(n)) {
    if (/\bcat\b/.test(n)) return "Cat Bowls & Feeders";
    return "Dog Bowls & Feeders";
  }

  // Apparel
  if (/\b(sweater|jacket|coat|bandana|vest|costume|raincoat|hoodie)\b/.test(n)) return "Dog Clothing";

  // Gates
  if (/\b(gate|barrier|playpen)\b/.test(n)) return "Dog Safety Gates";

  // Training (safe only)
  if (/\b(training\s*pad|potty|puppy\s*pad)\b/.test(n)) return "Dog Training";

  // Cat furniture / hammocks / houses
  if (/\bcat\s*(house|hammock|shelf|perch|window)\b/.test(n)) return "Cat Furniture";

  // Waste
  if (/\b(poop|waste|bag\s*dispenser)\b/.test(n)) return "Dog Waste Management";

  // If DB has a valid category in our map, trust it
  if (dbCategory && GCAT[dbCategory]) return dbCategory;

  return "Pet Carriers"; // safe default
}

// ── Google Product Category IDs ─────────────────────────────────────
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

// ── Consistency validation ──────────────────────────────────────────

function detectAnimalMismatch(title: string, description: string): boolean {
  const titleAnimal = guessAnimal(title);
  const descAnimal = guessAnimal(description);

  // If both mention specific but different animals → mismatch
  if (titleAnimal !== "pets" && descAnimal !== "pets" && titleAnimal !== descAnimal) {
    return true;
  }
  return false;
}

// ── Weight normalization ────────────────────────────────────────────

function normalizeWeight(grams: number | null): number {
  let g = grams ?? 0;
  if (!g || isNaN(g)) return 0.2;
  let kg = g > 50 ? g / 1000 : g;
  if (kg < 0.05) kg = 0.2;
  if (kg > 25) kg = 25;
  return Math.round(kg * 100) / 100;
}

// ── Central sanitizer: the single gate for all products ─────────────

interface RawProduct {
  id: string;
  name: string;
  slug: string | null;
  sku: string | null;
  category: string | null;
  price: number;
  compare_at_price: number | null;
  description: string | null;
  image_url: string | null;
  images: string[] | null;
  stock: number | null;
  weight: number | null;
}

interface SanitizedProduct {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  additional_image_link: string;
  availability: string;
  condition: string;
  price: string;
  sale_price: string;
  brand: string;
  google_product_category: number | string;
  product_type: string;
  identifier_exists: string;
  shipping_weight: string;
}

interface SanitizeResult {
  product: SanitizedProduct | null;
  excluded: boolean;
  reason: string | null;
  titleChanged: boolean;
  descGenerated: boolean;
  categoryOverridden: boolean;
}

function sanitizeProductForMerchant(p: RawProduct): SanitizeResult {
  const result: SanitizeResult = {
    product: null, excluded: false, reason: null,
    titleChanged: false, descGenerated: false, categoryOverridden: false,
  };

  // 1. Block by ID
  if (BLOCKED_PRODUCT_IDS.has(p.id)) {
    return { ...result, excluded: true, reason: "blocked_id" };
  }

  // 2. Block by policy-unsafe keywords
  if (isPolicySensitive(p.name, p.description || "")) {
    return { ...result, excluded: true, reason: "policy_unsafe_keywords" };
  }

  // 3. Required fields
  if (!p.slug || !p.slug.trim()) {
    return { ...result, excluded: true, reason: "missing_slug" };
  }
  if (!p.price || p.price <= 0) {
    return { ...result, excluded: true, reason: "missing_price" };
  }
  if (!p.image_url || !p.image_url.startsWith("http")) {
    return { ...result, excluded: true, reason: "missing_image" };
  }

  // 4. Sanitize title
  const cleanTitle = sanitizeTitle(p.name);
  result.titleChanged = cleanTitle !== p.name;

  // 5. Sanitize description
  let cleanDesc = sanitizeDescription(p.description || "");
  if (cleanDesc.length < 80) {
    cleanDesc = generateFallbackDescription(p.name);
    result.descGenerated = true;
  }

  // 6. Correct category
  const correctedCategory = correctCategory(p.name, p.category);
  result.categoryOverridden = correctedCategory !== p.category;
  const gcatId = GCAT[correctedCategory] || "";

  // 7. Consistency check: animal mismatch
  if (detectAnimalMismatch(cleanTitle, cleanDesc)) {
    // Auto-fix: regenerate description from title
    cleanDesc = generateFallbackDescription(p.name);
    result.descGenerated = true;
  }

  // 8. Build canonical URL
  const link = `${BASE_URL}/product/${p.slug}`;

  // 9. Pricing
  const hasSale = p.compare_at_price !== null && p.compare_at_price > p.price;

  // 10. Additional images
  const additionalImgs = (p.images || [])
    .filter((img: string) => img && img !== p.image_url && img.startsWith("http"))
    .slice(0, 4);

  // 11. Weight
  const weightKg = normalizeWeight(p.weight);

  // 12. Product type path
  const productType = `Pet Supplies > ${correctedCategory}`;

  result.product = {
    id: `getpawsy_${p.id}`,
    title: cleanTitle,
    description: cleanDesc,
    link,
    image_link: p.image_url,
    additional_image_link: additionalImgs.join(","),
    availability: "in stock",
    condition: "new",
    price: hasSale ? `${p.compare_at_price!.toFixed(2)} USD` : `${p.price.toFixed(2)} USD`,
    sale_price: hasSale ? `${p.price.toFixed(2)} USD` : "",
    brand: BRAND,
    google_product_category: gcatId,
    product_type: productType,
    identifier_exists: "no",
    shipping_weight: `${weightKg} kg`,
  };

  return result;
}

// ── Main handler ────────────────────────────────────────────────────

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

    // Fetch all active, non-duplicate, in-stock products
    const allProducts: RawProduct[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from("products")
        .select("id, name, slug, sku, category, price, compare_at_price, description, image_url, images, stock, weight")
        .eq("is_active", true).eq("is_duplicate", false).gt("stock", 0)
        .order("stock", { ascending: false }).range(from, from + 999);
      if (error) throw new Error(`DB: ${error.message}`);
      if (!data || data.length === 0) break;
      allProducts.push(...(data as RawProduct[]));
      if (data.length < 1000) break;
      from += 1000;
    }

    // ── Run every product through the sanitizer ──
    const audit = {
      total_scanned: allProducts.length,
      included: 0,
      excluded: 0,
      exclusion_reasons: {} as Record<string, number>,
      titles_cleaned: 0,
      descriptions_generated: 0,
      categories_overridden: 0,
      with_sale_price: 0,
      avg_title_len: 0,
      avg_desc_len: 0,
    };

    const feedItems: SanitizedProduct[] = [];

    for (const p of allProducts) {
      const result = sanitizeProductForMerchant(p);

      if (result.excluded || !result.product) {
        audit.excluded++;
        const reason = result.reason || "unknown";
        audit.exclusion_reasons[reason] = (audit.exclusion_reasons[reason] || 0) + 1;
        continue;
      }

      if (result.titleChanged) audit.titles_cleaned++;
      if (result.descGenerated) audit.descriptions_generated++;
      if (result.categoryOverridden) audit.categories_overridden++;
      if (result.product.sale_price) audit.with_sale_price++;

      feedItems.push(result.product);
      audit.included++;
    }

    // Compute averages
    if (feedItems.length > 0) {
      audit.avg_title_len = Math.round(feedItems.reduce((s, f) => s + f.title.length, 0) / feedItems.length);
      audit.avg_desc_len = Math.round(feedItems.reduce((s, f) => s + f.description.length, 0) / feedItems.length);
    }

    // ── CSV format ──
    if (format === "csv") {
      const cols: (keyof SanitizedProduct)[] = [
        "id", "title", "description", "link", "image_link", "additional_image_link",
        "availability", "condition", "price", "sale_price", "brand",
        "google_product_category", "product_type", "identifier_exists", "shipping_weight",
      ];
      const esc = (v: unknown) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
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

    // ── Audit format ──
    if (format === "audit") {
      return Response.json({
        ok: true,
        audit,
        sample: feedItems.slice(0, 20).map(f => ({
          id: f.id, title: f.title, link: f.link, price: f.price,
          sale_price: f.sale_price, category: f.google_product_category,
          product_type: f.product_type,
          title_len: f.title.length,
          desc_len: f.description.length,
        })),
      }, { headers: corsHeaders });
    }

    // ── JSON feed (default) ──
    return Response.json({
      ok: true,
      feed_info: {
        brand: BRAND,
        total_products: feedItems.length,
        generated_at: new Date().toISOString(),
        target_country: "US",
        content_language: "en",
      },
      audit,
      products: feedItems,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("Feed export error:", err);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500, headers: corsHeaders });
  }
});
