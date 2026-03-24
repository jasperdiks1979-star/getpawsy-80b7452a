import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sanitizeProduct, mapGoogleCategory, rewriteCloudinaryUrl, generateSafeDescription } from "../merchant-sync/compliance-sanitizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.pet";
const BRAND = "GetPawsy";
const YEAR = new Date().getFullYear();

// Google Product Category numeric IDs
const CATEGORY_MAP: Record<string, number> = {
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

interface Product {
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
  is_active: boolean | null;
  weight: number | null;
  is_duplicate: boolean;
}

function normalizeWeight(rawGrams: number | null): number {
  let grams = rawGrams ?? 0;
  if (!grams || isNaN(grams)) return 0.2;
  let kg: number;
  if (grams > 50) kg = grams / 1000;
  else kg = grams;
  if (kg < 0.05) kg = 0.2;
  if (kg > 25) kg = 25;
  return Math.round(kg * 100) / 100;
}

function buildGoogleTitle(name: string, category: string | null): string {
  const compliance = sanitizeProduct({
    title: name, description: "", category, weightKg: null,
  });
  let title = compliance.sanitizedTitle;
  // Add year if not already present
  if (!title.includes(String(YEAR))) {
    if (title.length + 7 <= 150) title += ` ${YEAR}`;
  }
  return title.substring(0, 150);
}

function buildGoogleDescription(name: string, rawDesc: string | null, category: string | null): string {
  let desc = rawDesc || "";
  if (desc.length < 50) desc = generateSafeDescription(name);
  const compliance = sanitizeProduct({
    title: name, description: desc, category, weightKg: null,
  });
  return compliance.sanitizedDescription.substring(0, 5000);
}

interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  additional_image_link: string[];
  availability: string;
  condition: string;
  price: string;
  sale_price: string;
  brand: string;
  google_product_category: number | null;
  product_type: string;
  identifier_exists: string;
  shipping_weight: string;
  // audit
  _audit: {
    original_title: string;
    title_changed: boolean;
    description_length: number;
    has_sale_price: boolean;
    image_count: number;
    category_mapped: boolean;
    issues: string[];
  };
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

    // Verify admin
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
    const format = url.searchParams.get("format") || "json"; // json | csv | audit

    // Fetch all feed-eligible products
    const allProducts: Product[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase.from("products")
        .select("id, name, slug, sku, category, price, compare_at_price, description, image_url, images, stock, is_active, weight, is_duplicate")
        .eq("is_active", true).eq("is_duplicate", false).gt("stock", 0)
        .order("stock", { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw new Error(`DB: ${error.message}`);
      if (!data || data.length === 0) break;
      allProducts.push(...(data as Product[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Build feed items
    const feedItems: FeedItem[] = [];
    const auditSummary = {
      total_scanned: allProducts.length,
      included: 0, excluded: 0,
      titles_optimized: 0, descriptions_generated: 0,
      missing_image: 0, missing_slug: 0, missing_price: 0,
      categories_mapped: 0, categories_unmapped: 0,
      with_sale_price: 0, avg_title_length: 0, avg_desc_length: 0,
      issues_by_type: {} as Record<string, number>,
    };

    for (const p of allProducts) {
      const issues: string[] = [];

      if (!p.slug) { auditSummary.missing_slug++; auditSummary.excluded++; issues.push("missing_slug"); continue; }
      if (!p.price || p.price <= 0) { auditSummary.missing_price++; auditSummary.excluded++; issues.push("missing_price"); continue; }
      if (!p.image_url) { auditSummary.missing_image++; auditSummary.excluded++; issues.push("missing_image"); continue; }

      // Title optimization
      const optimizedTitle = buildGoogleTitle(p.name, p.category);
      const titleChanged = optimizedTitle !== p.name;
      if (titleChanged) auditSummary.titles_optimized++;

      // Description
      const optimizedDesc = buildGoogleDescription(p.name, p.description, p.category);
      if (!p.description || p.description.length < 50) auditSummary.descriptions_generated++;

      // Pricing
      const hasSale = p.compare_at_price !== null && p.compare_at_price > p.price;
      if (hasSale) auditSummary.with_sale_price++;

      // Category
      const googleCat = CATEGORY_MAP[p.category || ""] || mapGoogleCategory(p.category, p.name);
      if (googleCat) auditSummary.categories_mapped++;
      else { auditSummary.categories_unmapped++; issues.push("no_google_category"); }

      // Images
      const cld = rewriteCloudinaryUrl(p.image_url);
      const primaryImg = cld.url;
      const additionalImgs = (p.images || [])
        .filter((img: string) => img && img !== p.image_url && img.startsWith("http"))
        .slice(0, 4)
        .map((img: string) => rewriteCloudinaryUrl(img).url);

      if (additionalImgs.length === 0) issues.push("only_1_image");
      if (optimizedTitle.length < 40) issues.push("short_title");
      if (optimizedDesc.length < 100) issues.push("short_description");

      // Weight
      const weightKg = normalizeWeight(p.weight);

      // Product type
      const productType = p.category ? `Pet Supplies > ${p.category}` : "Pet Supplies";

      for (const iss of issues) {
        auditSummary.issues_by_type[iss] = (auditSummary.issues_by_type[iss] || 0) + 1;
      }

      feedItems.push({
        id: `getpawsy_${p.id}`,
        title: optimizedTitle,
        description: optimizedDesc,
        link: `${BASE_URL}/product/${p.slug}`,
        image_link: primaryImg,
        additional_image_link: additionalImgs,
        availability: "in stock",
        condition: "new",
        price: hasSale ? `${p.compare_at_price!.toFixed(2)} USD` : `${p.price.toFixed(2)} USD`,
        sale_price: hasSale ? `${p.price.toFixed(2)} USD` : "",
        brand: BRAND,
        google_product_category: googleCat,
        product_type: productType,
        identifier_exists: "no",
        shipping_weight: `${weightKg} kg`,
        _audit: {
          original_title: p.name,
          title_changed: titleChanged,
          description_length: optimizedDesc.length,
          has_sale_price: hasSale,
          image_count: 1 + additionalImgs.length,
          category_mapped: !!googleCat,
          issues,
        },
      });
      auditSummary.included++;
    }

    // Compute averages
    if (feedItems.length > 0) {
      auditSummary.avg_title_length = Math.round(
        feedItems.reduce((sum, f) => sum + f.title.length, 0) / feedItems.length
      );
      auditSummary.avg_desc_length = Math.round(
        feedItems.reduce((sum, f) => sum + f.description.length, 0) / feedItems.length
      );
    }

    // Return based on format
    if (format === "audit") {
      return Response.json({
        ok: true,
        audit: auditSummary,
        sample_items: feedItems.slice(0, 10).map(f => ({
          id: f.id, title: f.title, link: f.link, price: f.price,
          sale_price: f.sale_price, category: f.google_product_category,
          image_count: f._audit.image_count, issues: f._audit.issues,
          original_title: f._audit.original_title, title_changed: f._audit.title_changed,
        })),
      }, { headers: corsHeaders });
    }

    if (format === "csv") {
      const csvColumns = [
        "id", "title", "description", "link", "image_link", "additional_image_link",
        "availability", "condition", "price", "sale_price", "brand",
        "google_product_category", "product_type", "identifier_exists", "shipping_weight",
      ];
      const esc = (v: unknown) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = [csvColumns.join(",")];
      for (const f of feedItems) {
        lines.push([
          f.id, f.title, f.description, f.link, f.image_link,
          f.additional_image_link.join("|"), f.availability, f.condition,
          f.price, f.sale_price, f.brand,
          f.google_product_category ?? "", f.product_type,
          f.identifier_exists, f.shipping_weight,
        ].map(esc).join(","));
      }
      const csv = "\uFEFF" + lines.join("\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="getpawsy_merchant_feed_${new Date().toISOString().split("T")[0]}.csv"`,
          "X-Feed-Total": String(feedItems.length),
          ...corsHeaders,
        },
      });
    }

    // Default: JSON (Google Merchant compatible)
    const jsonFeed = feedItems.map(({ _audit, ...item }) => item);
    return Response.json({
      ok: true,
      feed_info: {
        brand: BRAND,
        total_products: jsonFeed.length,
        generated_at: new Date().toISOString(),
        target_country: "US",
        content_language: "en",
      },
      audit: auditSummary,
      products: jsonFeed,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("Feed export error:", err);
    return Response.json(
      { ok: false, error: (err as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
});
