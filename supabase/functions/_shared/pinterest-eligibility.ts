// Pinterest publishing eligibility + media-score helpers.
// Single source of truth used by drain, director, orchestrator, dashboard.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EligibilityReason =
  | "ok"
  | "out_of_stock"
  | "inactive"
  | "hidden_product"
  | "archived"
  | "missing_inventory"
  | "cj_zero"
  | "all_warehouses_empty"
  | "media_score_low"
  | "destination_404"
  | "product_not_found";

export interface EligibilityResult {
  productId: string | null;
  productSlug: string | null;
  eligible: boolean;
  reason: EligibilityReason;
  mediaScore: number;
  inventory: number | null;
  mediaBreakdown: Record<string, number>;
  details: Record<string, unknown>;
  warehouseSource?: "US" | "EU" | "CN" | "NONE";
  isFallback?: boolean;
}

const MIN_MEDIA_SCORE = 60;

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function computeMediaScore(args: {
  hasVideo: boolean;
  photoCount: number;
  maxDim: number;
  hasLifestyle: boolean;
  hasWhiteBg: boolean;
  multiAngle: boolean;
}): { score: number; breakdown: Record<string, number> } {
  const b: Record<string, number> = {};
  b.video = args.hasVideo ? 30 : 0;
  b.photos = args.photoCount >= 5 ? 20 : 0;
  b.resolution = args.maxDim > 1200 ? 20 : 0;
  b.lifestyle = args.hasLifestyle ? 10 : 0;
  b.white_bg = args.hasWhiteBg ? 10 : 0;
  b.multi_angle = args.multiAngle ? 10 : 0;
  const score = Object.values(b).reduce((a, v) => a + v, 0);
  return { score: Math.max(0, Math.min(100, score)), breakdown: b };
}

export async function assessProductEligibility(
  productId: string,
  opts: { sourceLabel?: string; supabase?: SupabaseClient; skipLog?: boolean } = {},
): Promise<EligibilityResult> {
  const sb = opts.supabase ?? admin();

  const { data: p } = await sb
    .from("products")
    .select("id, slug, category, price, stock, is_active, images, image_url, us_stock, eu_stock, cn_stock")
    .eq("id", productId)
    .maybeSingle();

  if (!p) {
    const res: EligibilityResult = {
      productId,
      productSlug: null,
      eligible: false,
      reason: "product_not_found",
      mediaScore: 0,
      inventory: null,
      mediaBreakdown: {},
      details: {},
    };
    if (!opts.skipLog) await logEligibility(sb, res, opts.sourceLabel);
    return res;
  }

  // Inventory checks
  if (p.is_active === false) {
    return finalize(sb, p, false, "inactive", 0, {}, opts);
  }

  // Multi-warehouse gate (Item 14): pass when any warehouse > 0.
  const us = Number((p as any).us_stock ?? 0);
  const eu = Number((p as any).eu_stock ?? 0);
  const cn = Number((p as any).cn_stock ?? 0);
  const hasWarehouseCols =
    (p as any).us_stock != null || (p as any).eu_stock != null || (p as any).cn_stock != null;
  if (hasWarehouseCols) {
    if (us + eu + cn <= 0) {
      return finalize(sb, p, false, "all_warehouses_empty", 0, {}, opts);
    }
  } else {
    if (p.stock === null || p.stock === undefined) {
      return finalize(sb, p, false, "missing_inventory", 0, {}, opts);
    }
    if (p.stock <= 0) {
      return finalize(sb, p, false, "out_of_stock", 0, {}, opts);
    }
  }

  // Media scoring
  const { data: media } = await sb
    .from("product_media")
    .select("media_type, storage_url, supplier_url, width, height, alt_text, metadata")
    .eq("product_id", productId);

  const rows = media ?? [];
  const videos = rows.filter((r) => r.media_type === "video");
  const photos = rows.filter((r) => r.media_type !== "video");
  const maxDim = rows.reduce((m, r) => Math.max(m, r.width ?? 0, r.height ?? 0), 0);
  const lifestyleMarker = /lifestyle|scene|room|home|pet|cat|dog/i;
  const whiteBgMarker = /white|isolat|studio|cutout|transparent/i;
  const hasLifestyle = rows.some((r) =>
    lifestyleMarker.test(`${r.alt_text ?? ""} ${JSON.stringify(r.metadata ?? {})}`)
  );
  const hasWhiteBg = rows.some((r) =>
    whiteBgMarker.test(`${r.alt_text ?? ""} ${JSON.stringify(r.metadata ?? {})}`)
  );
  const multiAngle = photos.length >= 3;

  const { score, breakdown } = computeMediaScore({
    hasVideo: videos.length > 0,
    photoCount: photos.length || (p.images?.length ?? 0),
    maxDim,
    hasLifestyle,
    hasWhiteBg,
    multiAngle,
  });

  if (score < MIN_MEDIA_SCORE) {
    return finalize(sb, p, false, "media_score_low", score, breakdown, opts);
  }

  const result = await finalize(sb, p, true, "ok", score, breakdown, opts);
  const source: "US" | "EU" | "CN" | "NONE" =
    us > 0 ? "US" : eu > 0 ? "EU" : cn > 0 ? "CN" : "NONE";
  result.warehouseSource = source;
  result.isFallback = source === "CN" || source === "EU";
  return result;
}

async function finalize(
  sb: SupabaseClient,
  p: { id: string; slug: string; stock: number | null },
  eligible: boolean,
  reason: EligibilityReason,
  score: number,
  breakdown: Record<string, number>,
  opts: { sourceLabel?: string; skipLog?: boolean },
): Promise<EligibilityResult> {
  const res: EligibilityResult = {
    productId: p.id,
    productSlug: p.slug,
    eligible,
    reason,
    mediaScore: score,
    inventory: p.stock ?? null,
    mediaBreakdown: breakdown,
    details: { breakdown },
  };
  if (!opts.skipLog) await logEligibility(sb, res, opts.sourceLabel);
  return res;
}

async function logEligibility(
  sb: SupabaseClient,
  res: EligibilityResult,
  source?: string,
) {
  try {
    await sb.from("pinterest_eligibility_log").insert({
      product_id: res.productId,
      product_slug: res.productSlug,
      eligible: res.eligible,
      reason: res.reason,
      media_score: res.mediaScore,
      inventory: res.inventory,
      source: source ?? "unknown",
      details: res.details,
    });
  } catch (_e) {
    // swallow — eligibility logging must never break a publish path
  }
}

/** Tier label for cinematic source selection (item 5). */
export function pickCreativeSourceTier(args: {
  hasProductVideo: boolean;
  photoCount: number;
}): "product_video" | "photos" | "ai" {
  if (args.hasProductVideo) return "product_video";
  if (args.photoCount >= 5) return "photos";
  return "ai";
}

export const ELIGIBILITY_MIN_MEDIA_SCORE = MIN_MEDIA_SCORE;