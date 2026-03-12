import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.pet";
const MAX_EXPORT = 290;
const FREE_SHIPPING_THRESHOLD = 49;

// ── XML helpers ──────────────────────────────────────────────────────

function esc(text: string): string {
  return text
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
    .replace(/,?\s*fast delivery/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getPetType(category: string | null): string {
  if (!category) return "Pets";
  const c = category.toLowerCase();
  if (c.includes("dog")) return "Dogs";
  if (c.includes("cat")) return "Cats";
  if (c.includes("bird")) return "Birds";
  return "Pets";
}

function extractBenefit(name: string, desc: string | null): string {
  const n = name.toLowerCase();
  const d = (desc || "").toLowerCase();
  if (n.includes("orthopedic") || d.includes("joint")) return "Joint & Hip Support";
  if (n.includes("calming") || d.includes("anxiety")) return "Anxiety Relief";
  if (n.includes("interactive")) return "Interactive Enrichment";
  if (n.includes("waterproof")) return "Waterproof Protection";
  if (n.includes("scratch") || d.includes("scratch")) return "Natural Scratching";
  if (n.includes("grooming")) return "Easy Grooming";
  if (n.includes("training")) return "Effective Training";
  if (n.includes("adjustable")) return "Adjustable Fit";
  if (n.includes("durable") || d.includes("durable")) return "Built to Last";
  return "Everyday Comfort";
}

function buildOptimizedTitle(p: Product): string {
  const clean = cleanProductName(p.name);
  const pet = getPetType(p.category);
  const benefit = extractBenefit(p.name, p.description);
  return truncate(`${clean} for ${pet} – ${benefit} | GetPawsy`, 150);
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

// ── Google taxonomy ──────────────────────────────────────────────────

function getGoogleProductCategory(cat: string | null): string {
  if (!cat) return "Animals & Pet Supplies > Pet Supplies";
  const c = cat.toLowerCase();
  // Dog categories
  if (c.includes("dog") && c.includes("bed")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds";
  if (c.includes("dog") && c.includes("toy")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys";
  if (c.includes("dog") && (c.includes("collar") || c.includes("leash"))) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Leads";
  if (c.includes("dog") && c.includes("bowl")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Bowls & Feeders";
  if (c.includes("dog") && c.includes("house")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Houses";
  if (c.includes("dog") && c.includes("carrier")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Carriers & Travel";
  if (c.includes("dog") && c.includes("groom")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Grooming Supplies";
  if (c.includes("dog") && c.includes("cloth")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Apparel";
  if (c.includes("dog") && c.includes("train")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Training Aids";
  if (c.includes("dog")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies";
  // Cat categories
  if (c.includes("cat") && (c.includes("tree") || c.includes("tower") || c.includes("condo"))) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture";
  if (c.includes("cat") && c.includes("litter")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter Box Supplies";
  if (c.includes("cat") && c.includes("toy")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys";
  if (c.includes("cat") && c.includes("scratch")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture";
  if (c.includes("cat") && c.includes("bed")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Beds";
  if (c.includes("cat") && c.includes("carrier")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Carriers";
  if (c.includes("cat") && (c.includes("bowl") || c.includes("feeder") || c.includes("fountain"))) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Bowls & Feeders";
  if (c.includes("cat") && (c.includes("furniture") || c.includes("perch") || c.includes("hammock"))) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture";
  if (c.includes("cat")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies";
  // Small pets
  if (c.includes("hamster") && c.includes("cage")) return "Animals & Pet Supplies > Pet Supplies > Small Animal Supplies > Small Animal Habitats & Cages";
  if (c.includes("rabbit") || c.includes("hutch")) return "Animals & Pet Supplies > Pet Supplies > Small Animal Supplies > Small Animal Habitats & Cages";
  if (c.includes("small pet") || c.includes("guinea")) return "Animals & Pet Supplies > Pet Supplies > Small Animal Supplies";
  // Bird categories
  if (c.includes("bird") && (c.includes("feeder") || c.includes("bowl"))) return "Animals & Pet Supplies > Pet Supplies > Bird Supplies > Bird Food & Treats";
  if (c.includes("bird") && (c.includes("house") || c.includes("nest") || c.includes("coop") || c.includes("chicken"))) return "Animals & Pet Supplies > Pet Supplies > Bird Supplies > Bird Cages & Stands";
  if (c.includes("bird")) return "Animals & Pet Supplies > Pet Supplies > Bird Supplies";
  // Reptile
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
}

// ── Item XML builder ─────────────────────────────────────────────────

function buildItemXml(p: Product): string {
  const url = `${BASE_URL}/product/${p.slug || p.id}`;
  const img = sanitizeImageUrl(p.image_url || (p.images && p.images[0]) || null);
  if (!img) return ""; // skip products without valid image

  const title = buildOptimizedTitle(p);
  const desc = buildCleanDescription(p);

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

  const avail = p.stock !== null && p.stock > 0 ? "in stock" : "out of stock";
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
      <g:google_product_category>${esc(getGoogleProductCategory(p.category))}</g:google_product_category>
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
      .select("id,name,description,price,compare_at_price,image_url,images,stock,category,sku,slug,weight,is_active")
      .eq("is_active", true)
      .eq("is_duplicate", false)
      .gt("price", 0)
      .gt("stock", 0)
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
