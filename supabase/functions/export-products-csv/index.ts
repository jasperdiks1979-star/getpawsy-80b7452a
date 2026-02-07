import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://getpawsy.pet";
const FREE_SHIPPING_THRESHOLD = 35;
const FLAT_SHIPPING_RATE = 5.99;

// ── Exact 50-column spec ────────────────────────────────────────────────
const COLUMNS = [
  // A) Identity & lifecycle
  "product_id",
  "name",
  "slug",
  "sku",
  "brand",
  "category",
  "created_at",
  "updated_at",
  "is_active",
  // B) Deduplication
  "dedupe_key",
  "dedupe_fingerprint",
  "is_duplicate",
  "canonical_product_id",
  "visible_on_storefront",
  "feed_included",
  // C) Pricing (USD)
  "currency",
  "price_usd",
  "compare_at_price_usd",
  "sale_price_usd",
  "on_sale",
  "effective_price_usd",
  // D) Availability & supplier stock
  "supplier_stock",
  "availability",
  "add_to_cart_enabled",
  "stock_source",
  "last_stock_sync_at",
  "stock_sync_status",
  "stock_sync_error",
  // E) Images / media
  "primary_image_url",
  "additional_image_urls",
  "image_count",
  // F) Shipping metadata
  "shipping_country",
  "free_shipping_threshold_usd",
  "shipping_price_under_threshold_usd",
  "handling_time_days_min",
  "handling_time_days_max",
  "transit_time_days_min",
  "transit_time_days_max",
  // G) Feed & schema diagnostics
  "google_availability",
  "google_price",
  "google_sale_price",
  "schema_availability",
  "schema_price",
  "schema_currency",
  "canonical_product_url",
  // H) Supplier / external identifiers
  "supplier_name",
  "supplier_product_id",
  "supplier_variant_id",
  "spu",
  "external_id",
];

// ── Helpers ──────────────────────────────────────────────────────────────

function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function bool(v: boolean | null | undefined): string {
  return v === true ? "true" : "false";
}

function abs(url: string | null | undefined): string {
  if (!url) return "";
  return url.startsWith("http") ? url : `${BASE_URL}${url}`;
}

// ── Row builder ──────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  slug: string | null;
  sku: string | null;
  category: string | null;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  images: string[] | null;
  stock: number | null;
  is_active: boolean | null;
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
  const isActive = p.is_active !== false;
  const stockKnown = p.stock !== null && p.stock !== undefined;
  const supplierStock = stockKnown ? p.stock! : null;
  const inStock = isActive && stockKnown && p.stock! > 0;
  const availability = inStock ? "in stock" : "out of stock";

  const onSale = p.compare_at_price !== null && p.compare_at_price > p.price;
  const salePrice = onSale ? p.price : null;
  const effectivePrice = salePrice ?? p.price;

  const isCanonical = !p.is_duplicate;
  const visibleOnStorefront = isCanonical && isActive;
  const feedIncluded = visibleOnStorefront && inStock;
  const addToCartEnabled = visibleOnStorefront && inStock;

  const googleAvailability = availability;
  const googlePrice = onSale
    ? `${p.compare_at_price!.toFixed(2)} USD`
    : `${p.price.toFixed(2)} USD`;
  const googleSalePrice = onSale ? `${p.price.toFixed(2)} USD` : "";

  const schemaAvailability = inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";

  const primaryImage = abs(p.image_url);
  const additional = (p.images || [])
    .filter((img: string) => img && img !== p.image_url)
    .map((img: string) => abs(img));

  const canonicalUrl = p.slug
    ? `${BASE_URL}/product/${p.slug}`
    : `${BASE_URL}/product/${p.id}`;

  return [
    // A
    p.id,
    p.name,
    p.slug || "",
    p.sku || "",
    "GetPawsy",
    p.category || "",
    p.created_at,
    p.updated_at,
    bool(p.is_active),
    // B
    p.dedupe_key || "",
    "", // dedupe_fingerprint – not stored yet
    bool(p.is_duplicate),
    p.canonical_product_id || "",
    bool(visibleOnStorefront),
    bool(feedIncluded),
    // C
    "USD",
    p.price.toFixed(2),
    p.compare_at_price !== null ? p.compare_at_price.toFixed(2) : "",
    salePrice !== null ? salePrice.toFixed(2) : "",
    bool(onSale),
    effectivePrice.toFixed(2),
    // D
    supplierStock !== null ? String(supplierStock) : "",
    availability,
    bool(addToCartEnabled),
    p.cj_product_id ? "supplier" : "manual",
    p.last_stock_sync_at || "",
    "", // stock_sync_status – not stored per-product
    "", // stock_sync_error – not stored per-product
    // E
    primaryImage,
    additional.join("|"),
    String(1 + additional.length),
    // F
    "US",
    String(FREE_SHIPPING_THRESHOLD),
    FLAT_SHIPPING_RATE.toFixed(2),
    "1",  // handling min
    "3",  // handling max
    "3",  // transit min
    "7",  // transit max
    // G
    googleAvailability,
    googlePrice,
    googleSalePrice,
    schemaAvailability,
    `${effectivePrice.toFixed(2)} USD`,
    "USD",
    canonicalUrl,
    // H
    p.supplier_name || "",
    p.cj_product_id || "",
    "", // supplier_variant_id
    "", // spu
    "", // external_id
  ];
}

// ── Handler ──────────────────────────────────────────────────────────────

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Admin check
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Determine mode from query string
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") === "canonical" ? "canonical" : "full";

    // Paginated fetch
    const allProducts: Product[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      let query = supabaseAdmin
        .from("products")
        .select(
          "id, name, slug, sku, category, price, compare_at_price, image_url, images, stock, is_active, supplier_name, created_at, updated_at, last_stock_sync_at, is_duplicate, canonical_product_id, dedupe_key, cj_product_id"
        )
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (mode === "canonical") {
        query = query
          .eq("is_active", true)
          .eq("is_duplicate", false);
      }

      const { data, error } = await query;
      if (error) throw new Error(`DB error: ${error.message}`);
      if (!data || data.length === 0) break;
      allProducts.push(...(data as Product[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Build CSV
    const lines: string[] = [COLUMNS.join(",")];
    for (const p of allProducts) {
      if (!p.id || p.price === null || p.price === undefined) continue;
      lines.push(productToRow(p).map(esc).join(","));
    }

    const csv = "\uFEFF" + lines.join("\n");
    const today = new Date().toISOString().split("T")[0];
    const filename =
      mode === "canonical"
        ? `getpawsy_canonical_product_export_${today}.csv`
        : `getpawsy_full_product_export_${today}.csv`;

    const totalProducts = allProducts.length;
    const duplicates = allProducts.filter((p) => p.is_duplicate).length;
    const inactive = allProducts.filter((p) => p.is_active === false).length;

    console.log(
      `CSV Export [${mode}]: ${totalProducts} rows, ${duplicates} duplicates, ${inactive} inactive`
    );

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Export-Mode": mode,
        "X-Export-Total": String(totalProducts),
        "X-Export-Duplicates": String(duplicates),
        "X-Export-Inactive": String(inactive),
        "X-Export-Timestamp": new Date().toISOString(),
        ...corsHeaders,
      },
    });
  } catch (error: unknown) {
    console.error("CSV export error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
