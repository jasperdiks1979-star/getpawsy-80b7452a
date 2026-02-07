import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FREE_SHIPPING_THRESHOLD = 35;
const FLAT_SHIPPING_RATE = 5.99;
const HANDLING_TIME = "1-3";
const TRANSIT_TIME = "3-7";

function getAvailability(stock: number | null, isActive: boolean | null): string {
  if (isActive === false) return "out of stock";
  if (stock !== null && stock !== undefined && stock > 0) return "in stock";
  return "out of stock";
}

function getPetType(category: string | null): string {
  if (!category) return "Pets";
  const cat = category.toLowerCase();
  if (cat.includes("dog")) return "Dogs";
  if (cat.includes("cat")) return "Cats";
  if (cat.includes("bird")) return "Birds";
  if (cat.includes("hamster") || cat.includes("guinea") || cat.includes("rabbit") || cat.includes("small pet")) return "Small Pets";
  if (cat.includes("fish") || cat.includes("aqua")) return "Fish";
  return "Pets";
}

function getPriceTier(price: number): string {
  if (price < 15) return "Budget";
  if (price < 35) return "Mid-Range";
  if (price < 75) return "Premium";
  return "Luxury";
}

function getShippingType(price: number): string {
  return price >= FREE_SHIPPING_THRESHOLD ? "Free Shipping" : "Flat Rate";
}

function getGoogleProductCategory(category: string | null): string {
  if (!category) return "Animals & Pet Supplies";
  const cat = category.toLowerCase();
  if (cat.includes("dog")) return "Animals & Pet Supplies > Pet Supplies > Dog Supplies";
  if (cat.includes("cat")) return "Animals & Pet Supplies > Pet Supplies > Cat Supplies";
  if (cat.includes("bird")) return "Animals & Pet Supplies > Pet Supplies > Bird Supplies";
  if (cat.includes("fish") || cat.includes("aqua")) return "Animals & Pet Supplies > Pet Supplies > Fish Supplies";
  return "Animals & Pet Supplies > Pet Supplies";
}

function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function formatBool(val: boolean | null | undefined): string {
  return val === true ? "true" : "false";
}

const BASE_URL = "https://getpawsy.pet";

const COLUMNS = [
  "product_id", "canonical_product_id", "dedupe_key", "is_duplicate", "is_active",
  "created_at", "updated_at",
  "name", "slug", "sku", "brand", "category", "product_type_taxonomy", "google_product_category",
  "price_usd", "compare_at_price_usd", "on_sale", "sale_price_usd", "currency",
  "supplier_stock", "availability", "stock_source", "last_stock_sync_at",
  "shipping_country", "free_shipping_threshold_usd", "shipping_price_under_threshold_usd",
  "handling_time_days", "transit_time_days",
  "primary_image_url", "additional_image_urls", "image_count",
  "visible_on_storefront", "add_to_cart_enabled", "checkout_enabled",
  "feed_included", "google_availability", "google_price", "google_sale_price",
  "schema_availability", "schema_price", "schema_currency",
  "custom_label_0", "custom_label_1", "custom_label_2", "custom_label_3",
];

interface Product {
  id: string;
  name: string;
  slug: string | null;
  sku: string | null;
  category: string | null;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  images: string[] | null;
  stock: number | null;
  is_active: boolean | null;
  weight: number | null;
  shipping_time: string | null;
  supplier_name: string | null;
  created_at: string;
  updated_at: string;
  last_stock_sync_at: string | null;
  is_duplicate: boolean;
  canonical_product_id: string | null;
  dedupe_key: string | null;
  cj_product_id: string | null;
}

function productToRow(p: Product): string[] {
  const availability = getAvailability(p.stock, p.is_active);
  const isInStock = availability === "in stock";
  const onSale = p.compare_at_price !== null && p.compare_at_price > p.price;
  const isCanonical = !p.is_duplicate;
  const visibleOnStorefront = isCanonical && (p.is_active !== false);
  const addToCartEnabled = visibleOnStorefront && isInStock;
  const feedIncluded = isCanonical && (p.is_active !== false) && isInStock;

  const googlePrice = `${p.price.toFixed(2)} USD`;
  const googleSalePrice = onSale ? `${p.price.toFixed(2)} USD` : "";
  const googlePriceForFeed = onSale ? `${p.compare_at_price!.toFixed(2)} USD` : googlePrice;

  const schemaAvailability = isInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";

  const additionalImages = (p.images || [])
    .filter((img: string) => img && img !== p.image_url)
    .map((img: string) => img.startsWith("http") ? img : `${BASE_URL}${img}`);

  const primaryImageUrl = p.image_url
    ? (p.image_url.startsWith("http") ? p.image_url : `${BASE_URL}${p.image_url}`)
    : "";

  return [
    p.id,
    p.canonical_product_id || "",
    p.dedupe_key || "",
    formatBool(p.is_duplicate),
    formatBool(p.is_active),
    p.created_at,
    p.updated_at,
    p.name,
    p.slug || "",
    p.sku || "",
    "GetPawsy",
    p.category || "",
    p.category || "",
    getGoogleProductCategory(p.category),
    p.price.toFixed(2),
    p.compare_at_price !== null ? p.compare_at_price.toFixed(2) : "",
    formatBool(onSale),
    onSale ? p.price.toFixed(2) : "",
    "USD",
    p.stock !== null && p.stock !== undefined ? String(p.stock) : "0",
    availability,
    p.cj_product_id ? "supplier" : "manual",
    p.last_stock_sync_at || "",
    "US",
    String(FREE_SHIPPING_THRESHOLD),
    FLAT_SHIPPING_RATE.toFixed(2),
    HANDLING_TIME,
    TRANSIT_TIME,
    primaryImageUrl,
    additionalImages.join("|"),
    String(1 + additionalImages.length),
    formatBool(visibleOnStorefront),
    formatBool(addToCartEnabled),
    formatBool(addToCartEnabled),
    formatBool(feedIncluded),
    availability,
    googlePriceForFeed,
    googleSalePrice,
    schemaAvailability,
    `${p.price.toFixed(2)} USD`,
    "USD",
    getPetType(p.category),
    getPriceTier(p.price),
    isInStock ? "In Stock" : "Out of Stock",
    getShippingType(p.price),
  ];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const userId = userData.user.id;

    // Verify admin
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // Fetch ALL products (no limit, paginate)
    const allProducts: Product[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("id, name, slug, sku, category, description, price, compare_at_price, image_url, images, stock, is_active, weight, shipping_time, supplier_name, created_at, updated_at, last_stock_sync_at, is_duplicate, canonical_product_id, dedupe_key, cj_product_id")
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw new Error(`DB error: ${error.message}`);
      if (!data || data.length === 0) break;
      allProducts.push(...(data as Product[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Build CSV
    const lines: string[] = [COLUMNS.join(",")];
    let validationErrors = 0;

    for (const p of allProducts) {
      // Validate critical fields
      if (!p.id || p.price === null || p.price === undefined) {
        validationErrors++;
        continue;
      }
      const row = productToRow(p);
      lines.push(row.map(escapeCSV).join(","));
    }

    const csv = "\uFEFF" + lines.join("\n"); // BOM for Excel UTF-8

    const today = new Date().toISOString().split("T")[0];
    const filename = `getpawsy_full_product_export_${today}.csv`;

    const totalProducts = allProducts.length;
    const duplicates = allProducts.filter(p => p.is_duplicate).length;
    const inactive = allProducts.filter(p => p.is_active === false).length;
    const canonical = totalProducts - duplicates;

    console.log(`CSV Export: ${totalProducts} total, ${canonical} canonical, ${duplicates} duplicates, ${inactive} inactive, ${validationErrors} validation errors`);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Export-Total": String(totalProducts),
        "X-Export-Duplicates": String(duplicates),
        "X-Export-Inactive": String(inactive),
        "X-Export-Canonical": String(canonical),
        "X-Export-Timestamp": new Date().toISOString(),
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("CSV export error:", error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
};

serve(handler);
