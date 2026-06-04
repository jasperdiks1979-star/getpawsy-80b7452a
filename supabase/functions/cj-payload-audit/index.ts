// CJ Payload Audit — fetches the raw CJ payload for one product, compares
// against products + product_media in the DB, and returns a gap report
// listing every CJ field currently discarded by GetPawsy.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

// deno-lint-ignore no-explicit-any
async function getCjToken(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("cj_token_cache")
    .select("access_token, token_expiry")
    .eq("id", "singleton")
    .maybeSingle();
  if (data && new Date(data.token_expiry).getTime() > Date.now()) {
    return data.access_token;
  }
  const apiKey = Deno.env.get("CJ_API_KEY");
  if (!apiKey) throw new Error("CJ_API_KEY not configured");
  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const json = await res.json();
  if (!json.result) throw new Error(`CJ auth failed: ${json.message ?? res.status}`);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton",
    access_token: json.data.accessToken,
    token_expiry: new Date(
      new Date(json.data.accessTokenExpiryDate).getTime() - 5 * 60 * 1000,
    ).toISOString(),
    updated_at: new Date().toISOString(),
  });
  return json.data.accessToken;
}

async function fetchCjProduct(token: string, pid: string) {
  const params = new URLSearchParams({
    pid,
    features: "enable_inventory,enable_video",
    countryCode: "US",
  });
  const res = await fetch(`${CJ_API_BASE}/product/query?${params}`, {
    headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// Known CJ payload fields (top-level + variant-level) we explicitly recognise.
const CONSUMED_TOP_LEVEL = new Set([
  "pid", "productSku", "productName", "productNameEn", "categoryId",
  "categoryName", "productImage", "productImageSet", "productWeight",
  "productUnit", "productType", "sellPrice", "listedNum", "supplierName",
  "supplierId", "sourceFrom", "remark", "createrTime", "entryNameEn",
]);
const CONSUMED_VIDEO_FIELDS = new Set([
  "productVideo", "video", "videoUrls", "videoUrl", "productVideoUrl",
  "videoGallery",
]);
const CONSUMED_VARIANT_FIELDS = new Set([
  "vid", "pid", "variantSku", "variantNameEn", "variantName",
  "variantSellPrice", "variantStandard", "variantImage", "variantWeight",
  "variantLength", "variantWidth", "variantHeight", "variantVolume",
  "variantUnit", "variantKey", "variantValue", "inventoryUs", "inventory",
  "stockUs", "stockNum", "variantVideo", "video",
]);

// deno-lint-ignore no-explicit-any
function buildGapReport(cj: any, dbProduct: any, media: any[]) {
  const gaps: Record<string, unknown> = {};

  // 1. Variant coverage
  const cjVariants = Array.isArray(cj?.variants) ? cj.variants : [];
  const dbVariants = Array.isArray(dbProduct?.variants) ? dbProduct.variants : [];
  gaps.variants = {
    cj_count: cjVariants.length,
    db_count: dbVariants.length,
    missing_in_db: cjVariants.length - dbVariants.length,
    cj_sample: cjVariants.slice(0, 2),
    db_sample: dbVariants.slice(0, 2),
  };

  // 2. Colors + sizes (from variantKey / variantStandard / variantNameEn)
  const colors = new Set<string>();
  const sizes = new Set<string>();
  const skus = new Set<string>();
  for (const v of cjVariants) {
    const name = String(v?.variantNameEn ?? v?.variantName ?? v?.variantKey ?? "");
    const parts = name.split(/[-\/|,]/).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (/^(xs|s|m|l|xl|xxl|xxxl|\d+(\.\d+)?\s*(cm|mm|inch|in|kg|g|m|l|ml))$/i.test(p)) {
        sizes.add(p);
      } else if (p.length < 30) {
        colors.add(p);
      }
    }
    if (v?.variantSku) skus.add(String(v.variantSku));
  }
  gaps.colors = { cj_unique: Array.from(colors), db_has_color_column: false };
  gaps.sizes = { cj_unique: Array.from(sizes), db_has_size_column: false };
  gaps.sku_mapping = {
    cj_variant_skus: Array.from(skus),
    cj_master_sku: cj?.productSku ?? null,
    db_product_sku: dbProduct?.sku ?? null,
    db_cj_variant_id: dbProduct?.cj_variant_id ?? null,
  };

  // 3. Stock mapping
  const cjStockTotal = cjVariants.reduce((sum: number, v: any) => {
    return sum + (Number(v?.inventoryUs ?? v?.stockUs ?? v?.inventory ?? v?.stockNum) || 0);
  }, 0);
  gaps.stock = {
    cj_per_variant: cjVariants.map((v: any) => ({
      sku: v?.variantSku,
      us: v?.inventoryUs ?? v?.stockUs ?? null,
      generic: v?.inventory ?? v?.stockNum ?? null,
    })),
    cj_total: cjStockTotal,
    db_aggregated_stock: dbProduct?.stock ?? null,
    db_variant_stock_json: dbProduct?.variant_stock ?? null,
  };

  // 4. Videos
  const cjVideos: string[] = [];
  for (const f of CONSUMED_VIDEO_FIELDS) {
    const v = cj?.[f];
    if (typeof v === "string" && v.startsWith("http")) cjVideos.push(v);
    if (Array.isArray(v)) {
      for (const x of v) if (typeof x === "string" && x.startsWith("http")) cjVideos.push(x);
    }
  }
  const cjVariantVideos: string[] = [];
  for (const v of cjVariants) {
    if (typeof v?.variantVideo === "string" && v.variantVideo.startsWith("http")) {
      cjVariantVideos.push(v.variantVideo);
    }
    if (typeof v?.video === "string" && v.video.startsWith("http")) {
      cjVariantVideos.push(v.video);
    }
  }
  const dbVideos = media.filter((m) => m.media_type === "video");
  const dbImages = media.filter((m) => m.media_type === "image");
  gaps.videos = {
    cj_product_videos: cjVideos,
    cj_variant_videos: cjVariantVideos,
    db_video_rows: dbVideos.length,
    db_video_urls: dbVideos.map((m) => m.storage_url),
    discarded_extensions: [...cjVideos, ...cjVariantVideos].filter(
      (u) => !/\.(mp4|mov|webm)(\?|$)/i.test(u),
    ),
  };

  // 5. Gallery media (productImageSet)
  const cjImageSet = Array.isArray(cj?.productImageSet) ? cj.productImageSet : [];
  const cjMainImage = cj?.productImage ?? null;
  gaps.gallery = {
    cj_main_image: cjMainImage,
    cj_image_set_count: cjImageSet.length,
    db_image_rows: dbImages.length,
    db_images_column_count: Array.isArray(dbProduct?.images) ? dbProduct.images.length : 0,
    cj_variant_images: cjVariants
      .map((v: any) => v?.variantImage)
      .filter(Boolean),
  };

  // 6. Unknown / discarded top-level fields
  const unknownTop: Record<string, string> = {};
  for (const k of Object.keys(cj ?? {})) {
    if (CONSUMED_TOP_LEVEL.has(k) || CONSUMED_VIDEO_FIELDS.has(k) || k === "variants") continue;
    const val = (cj as Record<string, unknown>)[k];
    unknownTop[k] = typeof val === "object" ? JSON.stringify(val).slice(0, 200) : String(val).slice(0, 200);
  }
  gaps.discarded_top_level_fields = unknownTop;

  // 7. Unknown / discarded variant fields (use first variant as sample)
  const variantSample = cjVariants[0] ?? {};
  const unknownVar: Record<string, string> = {};
  for (const k of Object.keys(variantSample)) {
    if (CONSUMED_VARIANT_FIELDS.has(k)) continue;
    const val = (variantSample as Record<string, unknown>)[k];
    unknownVar[k] = typeof val === "object" ? JSON.stringify(val).slice(0, 200) : String(val).slice(0, 200);
  }
  gaps.discarded_variant_fields_sample = unknownVar;

  return gaps;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : Object.fromEntries(url.searchParams);
    const productId = body.product_id as string | undefined;
    const cjProductId = body.cj_product_id as string | undefined;
    const slug = body.slug as string | undefined;

    let query = supabase
      .from("products")
      .select("id, slug, sku, stock, variants, variant_stock, images, cj_product_id, cj_variant_id")
      .limit(1);
    if (productId) query = query.eq("id", productId);
    else if (cjProductId) query = query.eq("cj_product_id", cjProductId);
    else if (slug) query = query.eq("slug", slug);
    else throw new Error("Provide product_id, cj_product_id, or slug");

    const { data: products, error: prodErr } = await query;
    if (prodErr) throw prodErr;
    const dbProduct = products?.[0];
    if (!dbProduct) throw new Error("Product not found");
    if (!dbProduct.cj_product_id) throw new Error("Product has no cj_product_id");

    const token = await getCjToken(supabase);
    const { status, json } = await fetchCjProduct(token, dbProduct.cj_product_id);

    const { data: media } = await supabase
      .from("product_media")
      .select("*")
      .eq("product_id", dbProduct.id);

    const gap = json?.result
      ? buildGapReport(json.data, dbProduct, media ?? [])
      : null;

    return new Response(
      JSON.stringify({
        ok: !!json?.result,
        cj_http_status: status,
        cj_api_message: json?.message ?? null,
        product: {
          id: dbProduct.id,
          slug: dbProduct.slug,
          cj_product_id: dbProduct.cj_product_id,
        },
        raw_cj_payload: json?.data ?? null,
        gap_report: gap,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});