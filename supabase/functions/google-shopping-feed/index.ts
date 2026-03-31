import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.pet";
const MAX_EXPORT = 25; // CLEAN RESTART: minimal high-quality feed for Merchant re-approval
const FREE_SHIPPING_THRESHOLD = 49;

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

function cleanProductName(name: string): string {
  return name
    .replace(/,?\s*premium quality/gi, "")
    .replace(/,?\s*high quality/gi, "")
    .replace(/,?\s*best quality/gi, "")
    .replace(/,?\s*top quality/gi, "")
    .replace(/,?\s*new arrival/gi, "")
    .replace(/,?\s*hot sale/gi, "")
    .replace(/,?\s*free shipping/gi, "")
    .replace(/,?\s*US delivery/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getPetType(name: string, category: string | null): string {
  const c = `${name} ${category || ""}`.toLowerCase();
  if (c.includes("dog")) return "Dogs";
  if (c.includes("cat") && !c.includes("catch")) return "Cats";
  if (c.includes("bird") || c.includes("chicken") || c.includes("parrot")) return "Birds";
  if (c.includes("hamster")) return "Hamsters";
  if (c.includes("rabbit") || c.includes("hutch") || c.includes("bunny")) return "Rabbits";
  if (c.includes("guinea")) return "Guinea Pigs";
  if (c.includes("small pet") || c.includes("small animal")) return "Small Pets";
  if (c.includes("reptile") || c.includes("tortoise") || c.includes("terrarium")) return "Reptiles";
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
  return "Premium Quality";
}

function buildOptimizedTitle(p: Product): string {
  const clean = cleanProductName(p.name);
  const pet = getPetType(p.name, p.category);
  const feature = extractFeature(p.name, p.description);
  const material = extractMaterial(p.name, p.description);
  const size = extractSize(p.name);

  // Build keyword-first title: Main Keyword + Key Feature + Pet Type + Size/Material
  let parts = [clean];

  // Add pet type if not already in the name
  if (!clean.toLowerCase().includes(pet.toLowerCase().replace(/s$/, ""))) {
    parts[0] = `${clean} for ${pet}`;
  }

  // Add feature as dash-separated qualifier
  if (!clean.toLowerCase().includes(feature.toLowerCase().split(" ")[0].toLowerCase())) {
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
  if (!cleaned) return truncate(`${cleanProductName(p.name)} – quality pet supply from GetPawsy.`, 5000);
  return truncate(cleaned, 5000);
}

// ── Google taxonomy — checks BOTH name and category ─────────────────

function getGoogleProductCategory(name: string, cat: string | null): string {
  const c = `${name} ${cat || ""}`.toLowerCase();

  // Specific product types first (most specific wins)
  if (c.includes("cat tree") || c.includes("cat tower") || c.includes("cat condo"))
    return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Trees";
  if (c.includes("litter box") || c.includes("self cleaning litter") || c.includes("self-cleaning litter"))
    return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Litter Boxes";
  if (c.includes("dog bed") || c.includes("orthopedic dog bed") || c.includes("orthopedic bed"))
    return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds";
  if (c.includes("pet stroller") || c.includes("dog stroller") || c.includes("cat stroller"))
    return "Animals & Pet Supplies > Pet Supplies > Pet Strollers";
  if (c.includes("hamster cage") || c.includes("hamster habitat"))
    return "Animals & Pet Supplies > Pet Supplies > Small Animal Supplies > Small Animal Habitats";
  if (c.includes("rabbit hutch") || c.includes("bunny hutch"))
    return "Animals & Pet Supplies > Pet Supplies > Small Animal Supplies > Small Animal Habitats";
  if (c.includes("chicken coop"))
    return "Animals & Pet Supplies > Pet Supplies > Poultry Supplies";
  if (c.includes("reptile habitat") || c.includes("tortoise habitat") || c.includes("terrarium"))
    return "Animals & Pet Supplies > Pet Supplies > Reptile & Amphibian Supplies > Terrariums";

  // Bird supplies
  if (c.includes("bird feeder") || c.includes("bird cage") || c.includes("bird perch") || c.includes("bird toy"))
    return "Animals & Pet Supplies > Pet Supplies > Bird Supplies";

  // Dog sub-categories
  if (c.includes("dog") && c.includes("toy")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys";
  if (c.includes("dog") && (c.includes("collar") || c.includes("leash"))) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leads";
  if (c.includes("dog") && c.includes("bowl")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Bowls & Feeders";
  if (c.includes("dog") && c.includes("house")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Houses";
  if (c.includes("dog") && c.includes("carrier")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Carriers & Travel";
  if (c.includes("dog") && c.includes("groom")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Grooming Supplies";
  if (c.includes("dog") && c.includes("cloth")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Apparel";
  if (c.includes("dog") && c.includes("train")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Training Aids";
  if (c.includes("dog")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies";

  // Cat sub-categories
  if (c.includes("cat") && c.includes("scratch")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture";
  if (c.includes("cat") && c.includes("toy")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys";
  if (c.includes("cat") && c.includes("bed")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Beds";
  if (c.includes("cat") && c.includes("carrier")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Carriers";
  if (c.includes("cat") && (c.includes("bowl") || c.includes("feeder") || c.includes("fountain")))
    return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Bowls & Feeders";
  if (c.includes("cat") && (c.includes("furniture") || c.includes("perch") || c.includes("hammock")))
    return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture";
  if (c.includes("cat")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies";

  // Small pets
  if (c.includes("hamster") || c.includes("guinea") || c.includes("small pet") || c.includes("small animal"))
    return "Animals & Pet Supplies > Pet Supplies > Small Animal Supplies";
  if (c.includes("bird")) return "Animals & Pet Supplies > Pet Supplies > Bird Supplies";
  if (c.includes("reptile") || c.includes("tortoise")) return "Animals & Pet Supplies > Pet Supplies > Reptile & Amphibian Supplies";

  return "Animals & Pet Supplies > Pet Supplies";
}

function getProductType(cat: string | null): string {
  if (!cat) return "Pet Supplies";
  const c = cat.toLowerCase();
  let t = "Pet Supplies";
  if (c.includes("dog")) t += " > Dogs";
  else if (c.includes("cat")) t += " > Cats";
  else if (c.includes("bird") || c.includes("chicken")) t += " > Birds";
  else if (c.includes("hamster")) t += " > Small Pets > Hamsters";
  else if (c.includes("rabbit") || c.includes("hutch")) t += " > Small Pets > Rabbits";
  else if (c.includes("guinea")) t += " > Small Pets > Guinea Pigs";
  else if (c.includes("small pet")) t += " > Small Pets";
  else if (c.includes("reptile") || c.includes("tortoise")) t += " > Reptiles";
  else t += " > Accessories";
  if (c.includes("bed")) t += " > Beds";
  else if (c.includes("toy")) t += " > Toys";
  else if (c.includes("collar") || c.includes("leash")) t += " > Collars & Leashes";
  else if (c.includes("tree") || c.includes("furniture") || c.includes("condo")) t += " > Furniture";
  else if (c.includes("litter")) t += " > Litter & Accessories";
  else if (c.includes("bowl") || c.includes("feed") || c.includes("fountain")) t += " > Bowls & Feeders";
  else if (c.includes("house") || c.includes("cage") || c.includes("hutch") || c.includes("coop")) t += " > Habitats & Cages";
  else if (c.includes("groom") || c.includes("balm")) t += " > Grooming";
  else if (c.includes("train")) t += " > Training";
  else if (c.includes("carrier")) t += " > Carriers & Travel";
  else if (c.includes("cloth") || c.includes("shoe")) t += " > Apparel";
  else if (c.includes("perch") || c.includes("accessori")) t += " > Accessories";
  return t;
}

// ── Image sanitisation ───────────────────────────────────────────────

function sanitizeImageUrl(url: string | null): string | null {
  if (!url || url.trim() === "") return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://")) return null;
  if (/cjdropshipping\.com\/image\/null/i.test(trimmed)) return null;
  if (trimmed.length < 15) return null;
  return trimmed;
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
  const large = /\b(xl|extra.?large|large|cat.?tree|dog.?bed|stroller|cage|crate|kennel)\b/i;
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
}

// ── Item XML builder ─────────────────────────────────────────────────

function buildItemXml(p: Product): string {
  const url = `${BASE_URL}/product/${p.slug || p.id}`;
  const img = sanitizeImageUrl(p.image_url || (p.images && p.images[0]) || null);
  if (!img) return ""; // skip products without valid image

  // Prefer DB-optimized titles/descriptions, fallback to runtime generation
  const title = p.optimized_title || buildOptimizedTitle(p);
  const desc = p.optimized_description || buildCleanDescription(p);

  const priceStr = (v: number) => `${v.toFixed(2)} USD`;
  let priceXml: string;
  if (p.compare_at_price && p.compare_at_price > p.price) {
    priceXml = `      <g:price>${priceStr(p.compare_at_price)}</g:price>\n      <g:sale_price>${priceStr(p.price)}</g:sale_price>`;
  } else {
    priceXml = `      <g:price>${priceStr(p.price)}</g:price>`;
  }

  let extra = "";
  if (p.sku) {
    extra += `      <g:mpn>${esc(p.sku)}</g:mpn>\n`;
  } else {
    extra += `      <g:identifier_exists>no</g:identifier_exists>\n`;
    extra += `      <g:mpn>${esc(p.id)}</g:mpn>\n`;
  }

  // Additional images (up to 10)
  if (p.images && p.images.length > 1) {
    for (const ai of p.images.slice(1, 11)) {
      const s = sanitizeImageUrl(ai);
      if (s && s !== img) {
        extra += `      <g:additional_image_link>${esc(s)}</g:additional_image_link>\n`;
      }
    }
  }

  extra += `      <g:shipping_weight>${normalizeShippingWeight(p.weight, p.name)}</g:shipping_weight>\n`;

  // Dropship model: null/undefined stock = in stock (supplier manages inventory)
  // Only explicit 0 or is_active=false = out of stock
  const avail = (p.is_active === false || p.stock === 0) ? "out of stock" : "in stock";
  const shippingCost = p.price >= FREE_SHIPPING_THRESHOLD ? "0.00" : "5.99";

  return `    <item>
      <g:id>${esc(p.id)}</g:id>
      <g:title>${esc(title)}</g:title>
      <g:description>${esc(desc)}</g:description>
      <g:link>${esc(url)}</g:link>
      <g:image_link>${esc(img)}</g:image_link>
      <g:availability>${avail}</g:availability>
${priceXml}
      <g:condition>new</g:condition>
      <g:brand>GetPawsy</g:brand>
${extra}      <g:product_type>${esc(getProductType(p.category))}</g:product_type>
      <g:google_product_category>${esc(getGoogleProductCategory(p.name, p.category))}</g:google_product_category>
      <g:shipping>
        <g:country>US</g:country>
        <g:service>Standard</g:service>
        <g:price>${shippingCost} USD</g:price>
      </g:shipping>
    </item>`;
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

    // Fetch eligible products: active, not duplicate, priced, in-stock, with image & slug
    const { data: rawProducts, error } = await client
      .from("products")
      .select("id,name,description,price,compare_at_price,image_url,images,stock,category,sku,slug,weight,is_active,optimized_title,optimized_description")
      .eq("is_active", true)
      .eq("is_duplicate", false)
      .gt("price", 0)
      .not("image_url", "is", null)
      .not("slug", "is", null)
      .order("stock", { ascending: false }) // highest stock first
      .limit(5000);

    if (error) throw new Error(`DB error: ${error.message}`);

    const products = (rawProducts || []) as Product[];

    // Apply cap at MAX_EXPORT
    const capped = products.slice(0, MAX_EXPORT);

    // Build XML items, skip any that fail image validation
    const items = capped.map(p => buildItemXml(p)).filter(Boolean);

    // Logging metrics
    const categoryCoverage = capped.filter(p => getGoogleProductCategory(p.name, p.category) !== "Animals & Pet Supplies > Pet Supplies").length;
    const defaultCategory = capped.length - categoryCoverage;
    console.log(`[google-shopping-feed] Feed built: ${items.length} items exported, ${categoryCoverage} with specific category (${defaultCategory} fallback), ${capped.length} total eligible`);

    const now = new Date().toISOString();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>GetPawsy Product Feed</title>
    <link>${BASE_URL}</link>
    <description>GetPawsy Google Merchant Center Feed</description>
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
        "X-Feed-Products": String(items.length),
        "X-Feed-Generated": now,
        "X-Category-Coverage": `${categoryCoverage}/${capped.length}`,
      },
    });
  } catch (err) {
    console.error("[google-shopping-feed] Error:", err);
    // Return valid fallback XML even on error
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
