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

async function fetchCjVariants(token: string, pid: string) {
  const params = new URLSearchParams({ pid });
  const res = await fetch(`${CJ_API_BASE}/product/variant/queryByVid?${params}`, {
    headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
  }).catch(() => null);
  if (!res) return { status: 0, json: null };
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function fetchCjVariantsByPid(token: string, pid: string) {
  // Correct CJ endpoint for product variants
  const res = await fetch(`${CJ_API_BASE}/product/variant/query?pid=${pid}`, {
    headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
  }).catch(() => null);
  if (!res) return { status: 0, json: null };
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function fetchCjStock(token: string, pid: string) {
  const res = await fetch(`${CJ_API_BASE}/product/stock/queryByPid?pid=${pid}`, {
    headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
  }).catch(() => null);
  if (!res) return { status: 0, json: null };
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
  "stockUs", "stockNum", "variantVideo", "video", "inventories",
  "variantSpecs",
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

  // 3. Stock mapping — derive US stock from variant.inventories[]
  // (countryCode === 'US'), summing totalInventory/cjInventory. Fall back
  // to other warehouses only when US has zero.
  const perVariantStock = cjVariants.map((v: any) => {
    const invs: any[] = Array.isArray(v?.inventories) ? v.inventories : [];
    let us = 0, other = 0;
    for (const inv of invs) {
      const qty = Number(inv?.totalInventory ?? inv?.cjInventory ?? inv?.storageNum ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (String(inv?.countryCode ?? "").toUpperCase() === "US") us += qty;
      else other += qty;
    }
    return {
      sku: v?.variantSku,
      vid: v?.vid ?? null,
      us,
      other,
      effective: us > 0 ? us : other,
      inventories_count: invs.length,
    };
  });
  const cjStockUsTotal = perVariantStock.reduce((s, r) => s + r.us, 0);
  const cjStockEffectiveTotal = perVariantStock.reduce((s, r) => s + r.effective, 0);
  const recalculatedFromInventories = perVariantStock.some((r) => r.inventories_count > 0);
  gaps.stock = {
    cj_per_variant: perVariantStock,
    cj_us_total: cjStockUsTotal,
    cj_total: cjStockEffectiveTotal, // backward-compat: prefer US, fallback other
    recalculated_from_inventories: recalculatedFromInventories,
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
    const sampleCount = Math.min(
      Math.max(Number(body.sample_count ?? 0) | 0, 0),
      25,
    );

    // ===== Batch / sample mode =====
    if (sampleCount > 0) {
      const { data: pool, error: poolErr } = await supabase
        .from("products")
        .select("id, slug, sku, stock, variants, variant_stock, images, cj_product_id, cj_variant_id")
        .not("cj_product_id", "is", null)
        .eq("is_active", true)
        .limit(500);
      if (poolErr) throw poolErr;
      const shuffled = (pool ?? []).sort(() => Math.random() - 0.5).slice(0, sampleCount);

      const token = await getCjToken(supabase);
      const reports: unknown[] = [];
      const agg = {
        sampled: 0,
        cj_ok: 0,
        cj_failed: 0,
        products_with_cj_videos: 0,
        products_with_no_cj_videos: 0,
        products_with_db_videos: 0,
        total_cj_videos: 0,
        total_db_videos: 0,
        discarded_video_urls: 0,
        cj_variants_total: 0,
        db_variants_total: 0,
        products_missing_variants: 0,
        products_with_us_stock: 0,
        products_stock_recalculated_from_inventories: 0,
        cj_us_stock_total: 0,
      };

      for (const dbp of shuffled) {
        agg.sampled++;
        try {
          const { json } = await fetchCjProduct(token, dbp.cj_product_id);
          if (!json?.result || !json?.data) { agg.cj_failed++; continue; }
          agg.cj_ok++;

          if ((!Array.isArray(json.data.variants) || json.data.variants.length === 0)) {
            const vr = await fetchCjVariantsByPid(token, dbp.cj_product_id);
            if (Array.isArray(vr.json?.data)) json.data.variants = vr.json.data;
          }
          const { data: media } = await supabase
            .from("product_media")
            .select("media_type, storage_url")
            .eq("product_id", dbp.id);
          const gap = buildGapReport(json.data, dbp, media ?? []) as Record<string, any>;

          const cjVideos = (gap.videos?.cj_product_videos?.length ?? 0)
            + (gap.videos?.cj_variant_videos?.length ?? 0);
          const dbVideos = gap.videos?.db_video_rows ?? 0;
          if (cjVideos > 0) agg.products_with_cj_videos++;
          else agg.products_with_no_cj_videos++;
          if (dbVideos > 0) agg.products_with_db_videos++;
          agg.total_cj_videos += cjVideos;
          agg.total_db_videos += dbVideos;
          agg.discarded_video_urls += gap.videos?.discarded_extensions?.length ?? 0;
          agg.cj_variants_total += gap.variants?.cj_count ?? 0;
          agg.db_variants_total += gap.variants?.db_count ?? 0;
          if ((gap.variants?.cj_count ?? 0) > (gap.variants?.db_count ?? 0)) {
            agg.products_missing_variants++;
          }
          const usTot = Number(gap.stock?.cj_us_total ?? 0);
          if (usTot > 0) agg.products_with_us_stock++;
          agg.cj_us_stock_total += usTot;
          if (gap.stock?.recalculated_from_inventories) {
            agg.products_stock_recalculated_from_inventories++;
          }

          // Per-product machine-readable reason labels
          const reasons: string[] = [];
          if (cjVideos === 0) reasons.push("cj_returned_no_video");
          else if (dbVideos === 0) reasons.push("cj_video_not_yet_imported");
          if ((gap.variants?.cj_count ?? 0) === 0) reasons.push("cj_returned_no_variants");
          else if ((gap.variants?.db_count ?? 0) === 0) reasons.push("db_variants_empty_needs_repair");
          else if ((gap.variants?.cj_count ?? 0) > (gap.variants?.db_count ?? 0)) reasons.push("db_variants_partial");
          if (usTot === 0 && (gap.stock?.cj_total ?? 0) > 0) reasons.push("no_us_stock_only_other_warehouse");
          if (usTot === 0 && (gap.stock?.cj_total ?? 0) === 0) reasons.push("out_of_stock_everywhere");

          reports.push({
            product_id: dbp.id,
            slug: dbp.slug,
            cj_product_id: dbp.cj_product_id,
            reasons,
            gap_report: gap,
          });
        } catch (e) {
          agg.cj_failed++;
          reports.push({
            product_id: dbp.id,
            slug: dbp.slug,
            error: String((e as Error).message ?? e),
          });
        }
        // gentle pacing
        await new Promise((r) => setTimeout(r, 800));
      }

      return new Response(
        JSON.stringify({ ok: true, mode: "sample", aggregate: agg, reports }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let query = supabase
      .from("products")
      .select("id, slug, sku, stock, variants, variant_stock, images, cj_product_id, cj_variant_id")
      .limit(1);
    if (productId) query = query.eq("id", productId);
    else if (cjProductId) query = query.eq("cj_product_id", cjProductId);
    else if (slug) query = query.eq("slug", slug);
    else throw new Error("Provide product_id, cj_product_id, slug, or sample_count");

    const { data: products, error: prodErr } = await query;
    if (prodErr) throw prodErr;
    const dbProduct = products?.[0];
    if (!dbProduct) throw new Error("Product not found");
    if (!dbProduct.cj_product_id) throw new Error("Product has no cj_product_id");

    const token = await getCjToken(supabase);
    const { status, json } = await fetchCjProduct(token, dbProduct.cj_product_id);
    const variantsRes = await fetchCjVariantsByPid(token, dbProduct.cj_product_id);
    const stockRes = await fetchCjStock(token, dbProduct.cj_product_id);

    // Merge variants into payload if /product/query returned none
    if (json?.data && (!Array.isArray(json.data.variants) || json.data.variants.length === 0)) {
      if (Array.isArray(variantsRes.json?.data)) {
        json.data.variants = variantsRes.json.data;
      }
    }

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
        cj_variant_endpoint: {
          status: variantsRes.status,
          message: variantsRes.json?.message ?? null,
          count: Array.isArray(variantsRes.json?.data) ? variantsRes.json.data.length : null,
          sample: Array.isArray(variantsRes.json?.data) ? variantsRes.json.data.slice(0, 3) : null,
        },
        cj_stock_endpoint: {
          status: stockRes.status,
          message: stockRes.json?.message ?? null,
          data: stockRes.json?.data ?? null,
        },
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