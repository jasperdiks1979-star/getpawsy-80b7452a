import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.pet";
const MAX_EXPORT = 100; // Allow full catalog export for Merchant approval
const FREE_SHIPPING_THRESHOLD = 35; // Aligned with site policy ($35+)

// ── Pet-product filter (cats & dogs only) ────────────────────────────

const NON_PET_PATTERNS: RegExp[] = [
  /\b(bird|parrot|parakeet|cockatiel|canary|finch|budgie|macaw|aviary|bird\s*cage|bird\s*feeder|bird\s*toy|bird\s*perch)\b/i,
  /\b(reptile|snake|lizard|gecko|iguana|turtle|tortoise|terrarium|vivarium|heat\s*lamp|uvb\s*light)\b/i,
  /\b(chicken|poultry|hen|rooster|coop|chicken\s*coop|egg\s*incubator|nesting\s*box)\b/i,
  /\b(hamster|gerbil|guinea\s*pig|chinchilla|ferret|mouse\s*cage|rat\s*cage|rodent|small\s*animal\s*cage|exercise\s*wheel)\b/i,
  /\b(fish\s*tank|aquarium|fish\s*food|fish\s*bowl|betta|goldfish|tropical\s*fish|aquatic|reef|coral)\b/i,
  /\b(rabbit\s*hutch|rabbit\s*cage|bunny\s*cage|rabbit\s*hay|rabbit\s*pellet)\b/i,
  /\b(sunglasses|nail\s*art|fashion\s*accessor|jewelry|bracelet|necklace|earring|human\s*clothing)\b/i,
];

const POLICY_UNSAFE_PATTERNS: RegExp[] = [
  /shock\s*(collar|training|correction|system|fence)?/i,
  /static\s*correction/i,
  /electric\s*(fence|collar|training|shock)/i,
  /prong\s*collar/i,
  /choke\s*chain/i,
  /explosion[-\s]*proof/i,
];

function isSafeForFeed(name: string, category: string | null, description: string | null): boolean {
  const text = [name, category || "", description || ""].join(" ");
  if (NON_PET_PATTERNS.some(p => p.test(text))) return false;
  if (POLICY_UNSAFE_PATTERNS.some(p => p.test(text))) return false;
  return true;
}

// ── XML helpers ──────────────────────────────────────────────────────

function stripInvalidXmlChars(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "");
}

function esc(text: string): string {
  return stripInvalidXmlChars(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.substring(0, max - 3) + "...";
}

// ── Title / description sanitisation ─────────────────────────────────

const SPAMMY_TERMS = [
  /,?\s*premium quality/gi,
  /,?\s*high quality/gi,
  /,?\s*best quality/gi,
  /,?\s*top quality/gi,
  /,?\s*new arrival/gi,
  /,?\s*hot sale/gi,
  /,?\s*free shipping/gi,
  /,?\s*US delivery/gi,
  /,?\s*best seller/gi,
  /,?\s*#1\s/gi,
  /,?\s*guaranteed/gi,
  /,?\s*limited time/gi,
  /,?\s*buy now/gi,
  /,?\s*order now/gi,
  /,?\s*act fast/gi,
];

function cleanProductName(name: string): string {
  let clean = name;
  for (const rx of SPAMMY_TERMS) {
    clean = clean.replace(rx, "");
  }
  return clean.replace(/\s{2,}/g, " ").trim();
}

function getPetType(name: string, category: string | null): string {
  const c = `${name} ${category || ""}`.toLowerCase();
  if (c.includes("dog")) return "Dogs";
  if (c.includes("cat") && !c.includes("catch")) return "Cats";
  return "Pets";
}

function extractMaterial(name: string, desc: string | null): string | null {
  const t = `${name} ${desc || ""}`.toLowerCase();
  if (t.includes("memory foam")) return "Memory Foam";
  if (t.includes("stainless steel")) return "Stainless Steel";
  if (t.includes("bamboo")) return "Bamboo";
  if (t.includes("wood") || t.includes("wooden")) return "Wood";
  if (t.includes("ceramic")) return "Ceramic";
  if (t.includes("plush")) return "Plush";
  if (t.includes("cotton")) return "Cotton";
  if (t.includes("nylon")) return "Nylon";
  if (t.includes("silicone")) return "Silicone";
  return null;
}

function extractSize(name: string): string | null {
  const m = name.match(/\b(Extra\s*Large|X{0,2}Large|X{0,2}L|Medium|Small|XS|XXL|Giant|\d+\s*(?:cm|inch|in|ft|"|'))\b/i);
  return m ? m[0] : null;
}

function extractFeature(name: string, desc: string | null): string {
  const t = `${name} ${desc || ""}`.toLowerCase();
  if (t.includes("orthopedic") || t.includes("joint")) return "Joint & Hip Support";
  if (t.includes("washable") || t.includes("removable cover")) return "Washable Cover";
  if (t.includes("waterproof")) return "Waterproof";
  if (t.includes("foldable") || t.includes("collapsible")) return "Foldable";
  if (t.includes("self-clean") || t.includes("self clean")) return "Self-Cleaning";
  if (t.includes("automatic")) return "Automatic";
  if (t.includes("interactive")) return "Interactive";
  if (t.includes("adjustable")) return "Adjustable";
  if (t.includes("elevated")) return "Elevated Design";
  if (t.includes("slow feed")) return "Slow Feeder";
  if (t.includes("no spill") || t.includes("no-spill")) return "No-Spill";
  if (t.includes("scratching") || t.includes("scratch")) return "Scratch-Friendly";
  if (t.includes("training")) return "Training Aid";
  if (t.includes("travel") || t.includes("portable")) return "Travel-Ready";
  if (t.includes("led") || t.includes("light")) return "LED Safety";
  if (t.includes("calming") || t.includes("anxiety")) return "Calming";
  if (t.includes("durable") || t.includes("chew-proof")) return "Heavy-Duty";
  if (t.includes("multi-level") || t.includes("multi level")) return "Multi-Level";
  if (t.includes("puzzle")) return "Mental Stimulation";
  if (t.includes("groom")) return "Grooming";
  if (t.includes("cooling")) return "Cooling";
  if (t.includes("heated") || t.includes("warming")) return "Warming";
  return "";
}

function buildOptimizedTitle(p: Product): string {
  const clean = cleanProductName(p.name);
  const pet = getPetType(p.name, p.category);
  const feature = extractFeature(p.name, p.description);
  const material = extractMaterial(p.name, p.description);
  const size = extractSize(p.name);

  let parts = [clean];

  // Add pet type if not already in the name
  if (!clean.toLowerCase().includes(pet.toLowerCase().replace(/s$/, ""))) {
    parts[0] = `${clean} for ${pet}`;
  }

  // Add feature as dash-separated qualifier
  if (feature && !clean.toLowerCase().includes(feature.toLowerCase().split(" ")[0].toLowerCase())) {
    parts.push(feature);
  }

  // Add material or size
  if (material && !clean.toLowerCase().includes(material.toLowerCase())) {
    parts.push(material);
  }
  if (size && !clean.includes(size)) {
    parts.push(size);
  }

  const title = parts.join(" – ");
  return truncate(title, 150);
}

function cleanDescription(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<img[^>]*>/gi, "")
    .replace(/https?:\/\/[^\s<"']*cj(dropshipping|\.com)[^\s<"']*/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCleanDescription(p: Product): string {
  const cleaned = cleanDescription(p.description);
  const clean = cleanProductName(p.name);
  const pet = getPetType(p.name, p.category);
  const feature = extractFeature(p.name, p.description);

  // If we have a meaningful cleaned description, use it
  if (cleaned && cleaned.length > 50) {
    // Strip any spammy claims from description too
    let safeDesc = cleaned
      .replace(/\b(best|#1|guaranteed|clinically proven|vet approved|fast shipping|overnight)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return truncate(safeDesc, 5000);
  }

  // Generate a benefits-first description for products without good descriptions
  const featureStr = feature ? ` Designed for ${feature.toLowerCase()}.` : "";
  const desc = `${clean} – a quality ${pet.toLowerCase()} product from GetPawsy.${featureStr} Ships to US addresses. Free shipping on orders over $35. 30-day returns.`;
  return truncate(desc, 5000);
}

// ── Google taxonomy (numeric IDs from official Google Product Taxonomy) ──

const GOOGLE_TAXONOMY_IDS: Record<string, number> = {
  "cat_tree": 3367,        // Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture > Cat Trees & Condos
  "litter_box": 5010,      // Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter Box Supplies > Cat Litter Boxes
  "cat_furniture": 4433,   // Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture
  "cat_toy": 5019,         // Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys
  "cat_bed": 5008,         // Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture > Cat Beds
  "cat_carrier": 6983,     // Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Carriers & Strollers
  "cat_bowl": 5017,        // Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Feeding & Watering Supplies
  "cat_general": 3261,     // Animals & Pet Supplies > Pet Supplies > Cat Supplies
  "dog_bed": 4985,         // Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds
  "dog_toy": 5004,         // Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys
  "dog_collar": 5001,      // Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leashes
  "dog_bowl": 4997,        // Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Feeding & Watering Supplies
  "dog_house": 6981,       // Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Houses
  "dog_carrier": 6981,     // Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Carrier & Travel
  "dog_grooming": 4993,    // Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Grooming Supplies
  "dog_apparel": 5003,     // Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Apparel
  "dog_training": 5005,    // Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Training Aids
  "dog_general": 3262,     // Animals & Pet Supplies > Pet Supplies > Dog Supplies
  "pet_stroller": 6978,    // Animals & Pet Supplies > Pet Supplies > Pet Carriers & Travel
  "pet_feeding": 4997,     // Animals & Pet Supplies > Pet Supplies > Pet Feeding & Watering Supplies
  "pet_general": 2,        // Animals & Pet Supplies > Pet Supplies (fallback)
};

interface CategoryResult {
  taxonomyId: number;
  taxonomyKey: string;
  valid: boolean;
  original: string | null;
}

function classifyGoogleProductCategory(name: string, cat: string | null): CategoryResult {
  const c = `${name} ${cat || ""}`.toLowerCase();
  const original = cat;

  // Cat-specific
  if (c.includes("cat tree") || c.includes("cat tower") || c.includes("cat condo"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.cat_tree, taxonomyKey: "cat_tree", valid: true, original };
  if (c.includes("litter box") || c.includes("self cleaning litter") || c.includes("self-cleaning litter"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.litter_box, taxonomyKey: "litter_box", valid: true, original };
  if (c.includes("cat") && c.includes("scratch"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.cat_furniture, taxonomyKey: "cat_furniture", valid: true, original };
  if (c.includes("cat") && c.includes("toy"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.cat_toy, taxonomyKey: "cat_toy", valid: true, original };
  if (c.includes("cat") && c.includes("bed"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.cat_bed, taxonomyKey: "cat_bed", valid: true, original };
  if (c.includes("cat") && c.includes("carrier"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.cat_carrier, taxonomyKey: "cat_carrier", valid: true, original };
  if (c.includes("cat") && (c.includes("bowl") || c.includes("feeder") || c.includes("fountain")))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.cat_bowl, taxonomyKey: "cat_bowl", valid: true, original };
  if (c.includes("cat") && (c.includes("furniture") || c.includes("perch") || c.includes("hammock")))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.cat_furniture, taxonomyKey: "cat_furniture", valid: true, original };
  if (c.includes("cat"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.cat_general, taxonomyKey: "cat_general", valid: true, original };

  // Dog-specific
  if (c.includes("dog bed") || c.includes("orthopedic dog bed") || c.includes("orthopedic bed"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.dog_bed, taxonomyKey: "dog_bed", valid: true, original };
  if (c.includes("dog") && c.includes("toy"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.dog_toy, taxonomyKey: "dog_toy", valid: true, original };
  if (c.includes("dog") && (c.includes("collar") || c.includes("leash")))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.dog_collar, taxonomyKey: "dog_collar", valid: true, original };
  if (c.includes("dog") && c.includes("bowl"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.dog_bowl, taxonomyKey: "dog_bowl", valid: true, original };
  if (c.includes("slow feeder") || c.includes("slow feed"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.dog_bowl, taxonomyKey: "dog_bowl", valid: true, original };
  if (c.includes("dog") && c.includes("house"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.dog_house, taxonomyKey: "dog_house", valid: true, original };
  if (c.includes("dog") && c.includes("carrier"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.dog_carrier, taxonomyKey: "dog_carrier", valid: true, original };
  if (c.includes("dog") && c.includes("groom"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.dog_grooming, taxonomyKey: "dog_grooming", valid: true, original };
  if (c.includes("dog") && c.includes("cloth"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.dog_apparel, taxonomyKey: "dog_apparel", valid: true, original };
  if (c.includes("dog") && c.includes("train"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.dog_training, taxonomyKey: "dog_training", valid: true, original };
  if (c.includes("dog"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.dog_general, taxonomyKey: "dog_general", valid: true, original };

  // Pet stroller
  if (c.includes("stroller"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.pet_stroller, taxonomyKey: "pet_stroller", valid: true, original };

  // Pet feeding general
  if (c.includes("bowl") || c.includes("feeder") || c.includes("fountain"))
    return { taxonomyId: GOOGLE_TAXONOMY_IDS.pet_feeding, taxonomyKey: "pet_feeding", valid: true, original };

  // Fallback — still valid (general pet supplies)
  return { taxonomyId: GOOGLE_TAXONOMY_IDS.pet_general, taxonomyKey: "pet_general", valid: true, original };
}

function getProductType(cat: string | null): string {
  if (!cat) return "Pet Supplies";
  const c = cat.toLowerCase();
  let t = "Pet Supplies";
  if (c.includes("dog")) t += " > Dogs";
  else if (c.includes("cat")) t += " > Cats";
  else t += " > Accessories";
  if (c.includes("bed")) t += " > Beds";
  else if (c.includes("toy")) t += " > Toys";
  else if (c.includes("collar") || c.includes("leash")) t += " > Collars & Leashes";
  else if (c.includes("tree") || c.includes("furniture") || c.includes("condo")) t += " > Furniture";
  else if (c.includes("litter")) t += " > Litter & Accessories";
  else if (c.includes("bowl") || c.includes("feed") || c.includes("fountain")) t += " > Bowls & Feeders";
  else if (c.includes("groom") || c.includes("balm")) t += " > Grooming";
  else if (c.includes("train")) t += " > Training";
  else if (c.includes("carrier")) t += " > Carriers & Travel";
  else if (c.includes("cloth") || c.includes("shoe")) t += " > Apparel";
  return t;
}

// ── Image sanitisation ───────────────────────────────────────────────

function sanitizeImageUrl(url: string | null): string | null {
  if (!url || url.trim() === "") return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://")) return null;
  if (/cjdropshipping\.com\/image\/null/i.test(trimmed)) return null;
  if (trimmed.length < 15) return null;
  // Block obvious placeholder images
  if (/placeholder|no-image|default-product/i.test(trimmed)) return null;
  return trimmed;
}

// Pick strongest primary image: prefer first non-null valid image
function selectPrimaryImage(p: Product): string | null {
  // Try main image_url first
  const main = sanitizeImageUrl(p.image_url);
  if (main) return main;
  // Fallback to first valid image in array
  if (p.images && p.images.length > 0) {
    for (const img of p.images) {
      const s = sanitizeImageUrl(img);
      if (s) return s;
    }
  }
  return null;
}

// ── Shipping weight normaliser ───────────────────────────────────────

function normalizeShippingWeight(rawWeight: number | null, name: string): string {
  let wkg: number;
  if (!rawWeight || rawWeight === 0 || isNaN(rawWeight)) wkg = 1;
  else if (rawWeight >= 100 && rawWeight <= 200000) wkg = rawWeight / 1000;
  else if (rawWeight < 100) wkg = rawWeight;
  else wkg = 1;
  if (wkg < 0.1) wkg = 1;
  if (wkg > 25) wkg = 25;
  const large = /\b(xl|extra.?large|large|cat.?tree|dog.?bed|stroller|cage|crate|kennel|litter.?box|cat.?tower|cat.?condo|backpack|carrier)\b/i;
  if (large.test(name) && wkg < 5) wkg = 5;
  return `${Math.round(wkg * 10) / 10} kg`;
}

// ── Types ────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  images: string[] | null;
  stock: number | null;
  category: string | null;
  sku: string | null;
  slug: string | null;
  weight: number | null;
  is_active: boolean;
  optimized_title: string | null;
  optimized_description: string | null;
  product_type: string | null;
}

// ── Item XML builder ─────────────────────────────────────────────────

interface BuildResult {
  xml: string;
  excluded: string | null;
}

function buildItemXml(p: Product): BuildResult {
  const url = `${BASE_URL}/product/${p.slug || p.id}`;
  const img = selectPrimaryImage(p);
  if (!img) return { xml: "", excluded: "no_valid_image" };

  // Reject generic/template DB titles
  const GENERIC_TITLE_PATTERNS = /^Pet (Toy|Supply|Product|Accessory|Item)\b/i;
  const dbTitleOk = p.optimized_title && p.optimized_title.length > 15
    && !GENERIC_TITLE_PATTERNS.test(p.optimized_title)
    && !p.optimized_title.includes("(US Shipping)");
  const dbDescOk = p.optimized_description && p.optimized_description.length > 50
    && !p.optimized_description.includes("3–7 business days")
    && !p.optimized_description.includes("3-7 business days");

  const title = dbTitleOk ? p.optimized_title! : buildOptimizedTitle(p);
  const desc = dbDescOk ? p.optimized_description! : buildCleanDescription(p);

  // Validate title quality
  if (title.length < 10) return { xml: "", excluded: "title_too_short" };

  const priceStr = (v: number) => `${v.toFixed(2)} USD`;
  let priceXml: string;
  if (p.compare_at_price && p.compare_at_price > p.price) {
    priceXml = `      <g:price>${priceStr(p.compare_at_price)}</g:price>\n      <g:sale_price>${priceStr(p.price)}</g:sale_price>`;
  } else {
    priceXml = `      <g:price>${priceStr(p.price)}</g:price>`;
  }

  let extra = "";
  // All GetPawsy branded products use identifier_exists = TRUE
  extra += `      <g:identifier_exists>TRUE</g:identifier_exists>\n`;
  if (p.sku) {
    extra += `      <g:mpn>${esc(p.sku)}</g:mpn>\n`;
  } else {
    extra += `      <g:mpn>${esc(p.id)}</g:mpn>\n`;
  }

  // Additional images (up to 10)
  if (p.images && p.images.length > 1) {
    let addedCount = 0;
    for (const ai of p.images.slice(1, 11)) {
      const s = sanitizeImageUrl(ai);
      if (s && s !== img && addedCount < 10) {
        extra += `      <g:additional_image_link>${esc(s)}</g:additional_image_link>\n`;
        addedCount++;
      }
    }
  }

  extra += `      <g:shipping_weight>${normalizeShippingWeight(p.weight, p.name)}</g:shipping_weight>\n`;

  // Dropship model: only is_active=false marks OOS
  const avail = p.is_active === false ? "out of stock" : "in stock";
  const shippingCost = p.price >= FREE_SHIPPING_THRESHOLD ? "0.00" : "5.99";

  const xml = `    <item>
      <g:id>${esc(p.id)}</g:id>
      <g:title>${esc(title)}</g:title>
      <g:description>${esc(desc)}</g:description>
      <g:link>${esc(url)}</g:link>
      <g:image_link>${esc(img)}</g:image_link>
      <g:availability>${avail}</g:availability>
${priceXml}
      <g:condition>new</g:condition>
      <g:brand>GetPawsy</g:brand>
      <g:content_language>en</g:content_language>
      <g:target_country>US</g:target_country>
${extra}      <g:product_type>${esc(p.product_type || getProductType(p.category))}</g:product_type>
      <g:google_product_category>${categoryResult.taxonomyId}</g:google_product_category>
      <g:shipping>
        <g:country>US</g:country>
        <g:service>Standard</g:service>
        <g:price>${shippingCost} USD</g:price>
      </g:shipping>
    </item>`;
  return { xml, excluded: null };
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);

    // Fetch eligible products: active, not duplicate, priced, with image & slug
    const { data: rawProducts, error } = await client
      .from("products")
      .select("id,name,description,price,compare_at_price,image_url,images,stock,category,sku,slug,weight,is_active,optimized_title,optimized_description,product_type")
      .eq("is_active", true)
      .eq("is_duplicate", false)
      .gt("price", 0)
      .not("image_url", "is", null)
      .not("slug", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) throw new Error(`DB error: ${error.message}`);

    const allProducts = (rawProducts || []) as Product[];

    // ── Exclusion tracking ──
    const excludedByReason: Record<string, number> = {};
    const addExclusion = (reason: string) => {
      excludedByReason[reason] = (excludedByReason[reason] || 0) + 1;
    };

    // Filter: cats & dogs only, no policy-unsafe items
    const petSafe = allProducts.filter(p => {
      if (!isSafeForFeed(p.name, p.category, p.description)) {
        addExclusion("non_pet_or_policy_unsafe");
        return false;
      }
      return true;
    });

    // Cap at MAX_EXPORT
    const capped = petSafe.slice(0, MAX_EXPORT);

    // Build XML items with exclusion tracking
    const items: string[] = [];
    let titleRewriteCount = 0;
    let descRewriteCount = 0;

    for (const p of capped) {
      const result = buildItemXml(p);
      if (result.excluded) {
        addExclusion(result.excluded);
      } else {
        items.push(result.xml);
        if (!p.optimized_title) titleRewriteCount++;
        if (!p.optimized_description) descRewriteCount++;
      }
    }

    // Metrics
    const categoryCoverage = capped.filter(p => getGoogleProductCategory(p.name, p.category) !== "Animals & Pet Supplies > Pet Supplies").length;
    const exclusionRate = allProducts.length > 0 ? ((allProducts.length - items.length) / allProducts.length * 100).toFixed(1) : "0";

    console.log(`[google-shopping-feed] Feed metrics: raw=${allProducts.length} petSafe=${petSafe.length} capped=${capped.length} exported=${items.length} exclusionRate=${exclusionRate}% categories=${categoryCoverage}/${items.length} titleRewrites=${titleRewriteCount} descRewrites=${descRewriteCount} excludedByReason=${JSON.stringify(excludedByReason)}`);

    const now = new Date().toISOString();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>GetPawsy Product Feed</title>
    <link>${BASE_URL}</link>
    <description>GetPawsy Google Merchant Center Feed – US Pet Supplies</description>
    <language>en-US</language>
    <lastBuildDate>${now}</lastBuildDate>
${items.join("\n")}
  </channel>
</rss>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Feed-Raw-Count": String(allProducts.length),
        "X-Feed-Pet-Safe": String(petSafe.length),
        "X-Feed-Exported": String(items.length),
        "X-Feed-Exclusion-Rate": `${exclusionRate}%`,
        "X-Feed-Category-Coverage": `${categoryCoverage}/${items.length}`,
        "X-Feed-Title-Rewrites": String(titleRewriteCount),
        "X-Feed-Desc-Rewrites": String(descRewriteCount),
        "X-Feed-Generated": now,
      },
    });
  } catch (err) {
    console.error("[google-shopping-feed] Error:", err);
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>GetPawsy Product Feed</title>
    <link>${BASE_URL}</link>
    <description>GetPawsy Google Merchant Center Feed</description>
  </channel>
</rss>`;
    return new Response(fallback, {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
      },
    });
  }
});
