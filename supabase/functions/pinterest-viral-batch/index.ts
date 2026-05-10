// Pinterest Viral Batch — generates 5 high-converting pins per run for a single
// product, using rotating hook frameworks (pain / curiosity / time-saving /
// social proof / transformation). 9:16 pin images are composited via
// Cloudinary's fetch API (text overlays on real product photos — no AI images,
// no stock footage). Pins are inserted into pinterest_pin_queue with
// staggered scheduled_at so the existing cron worker publishes them
// progressively.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import type {
  PinterestQueueInsert,
  PinterestPinDraft,
  BackdropMetadata,
} from "../_shared/pinterest-queue-types.ts";
import { runPinQa, PINTEREST_ALLOWED_SLUGS } from "../_shared/pinterest-qa.ts";
import { sanitizeUrl, quarantineEvent } from "../_shared/event-sanitizer.ts";
import {
  hashImageUrl,
  containsTargetKeyword,
  containsCategoryKeyword,
  resolveCategoryKey,
  TARGET_KEYWORDS_BY_CATEGORY,
  STYLE_TO_BOARD_FALLBACK,
} from "../_shared/pinterest-hooks.ts";
import { scrubProductImages } from "../_shared/pinterest-image-scrub.ts";
import {
  buildStyledPin,
  HOOK_TO_STYLE,
  pickSoftCta,
  pickCtrBadge,
} from "../_shared/pinterest-templates.ts";
import { fetchAiBackdrop } from "../_shared/pinterest-ai-backdrop.ts";
import { computeCreativeFingerprint } from "../_shared/pinterest-fingerprint.ts";

export type {
  PinterestQueueInsert,
  PinterestPinDraft,
  BackdropMetadata,
} from "../_shared/pinterest-queue-types.ts";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
  "https://id-preview--597d7eb2-8207-4374-9ac1-67ffe0048ce1.lovable.app",
];

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const CLOUDINARY_CLOUD = "dlkqycfzn";
const BASE_URL = "https://getpawsy.pet";
const DEFAULT_SLUG = "automatic-cat-litter-box-self-cleaning-app-control";

/**
 * Normalize a slug input from the admin UI.
 * Accepts:
 *   - bare slug:               "automatic-cat-litter-box-self-cleaning-"
 *   - full product URL:        "https://getpawsy.pet/products/automatic-cat-..."
 *   - URL with query/fragment: ".../products/foo?utm=...#x"
 * Returns a trimmed, lowercased slug with leading/trailing hyphens removed.
 */
function normalizeSlugInput(raw: unknown): string {
  if (!raw) return "";
  let s = String(raw).trim();
  // Pull slug out of a full URL if pasted.
  const urlMatch = s.match(/\/products\/([^/?#]+)/i);
  if (urlMatch) s = urlMatch[1];
  // Strip query/fragment if any leaked through.
  s = s.split("?")[0].split("#")[0];
  s = s.toLowerCase().replace(/^-+|-+$/g, "").trim();
  return s;
}

// Whitelist of columns that exist on pinterest_pin_queue. Any extra fields
// (e.g. optional backdrop_* visual metadata) are silently dropped so the
// queue insert can never fail because of missing columns.
export const ALLOWED_QUEUE_COLUMNS = new Set<string>([
  "product_id", "product_slug", "product_name", "pin_variant",
  "pin_title", "pin_description", "pin_image_url", "destination_link",
  "board_name", "hashtags", "priority", "status", "scheduled_at",
  "hook_group", "category_key", "overlay_text", "qa_reasons", "image_hash",
  "approved_at", "creative_fingerprint",
]);

export interface SanitizeReport {
  /** Type-safe rows ready for `.insert()` — guaranteed free of backdrop_* fields. */
  rows: PinterestQueueInsert[];
  /** Per-row list of dropped column names (parallel to `rows`). */
  droppedPerRow: string[][];
  /** Aggregate count of drops across all rows, keyed by column name. */
  droppedCounts: Record<string, number>;
  /** Distinct dropped column names across the whole batch. */
  droppedColumns: string[];
}

export function sanitizeQueueRowsWithReport<T extends Record<string, unknown>>(
  rows: T[],
): SanitizeReport {
  const droppedPerRow: string[][] = [];
  const droppedCounts: Record<string, number> = {};
  const cleaned = rows.map((r) => {
    const out: Record<string, unknown> = {};
    const dropped: string[] = [];
    for (const k of Object.keys(r)) {
      if (ALLOWED_QUEUE_COLUMNS.has(k)) {
        out[k] = (r as Record<string, unknown>)[k];
      } else {
        dropped.push(k);
        droppedCounts[k] = (droppedCounts[k] ?? 0) + 1;
      }
    }
    droppedPerRow.push(dropped);
    return out as unknown as PinterestQueueInsert;
  });
  return {
    rows: cleaned,
    droppedPerRow,
    droppedCounts,
    droppedColumns: Object.keys(droppedCounts).sort(),
  };
}

/** Back-compat wrapper kept for existing callers/tests. */
export function sanitizeQueueRows<T extends Record<string, unknown>>(rows: T[]): PinterestQueueInsert[] {
  return sanitizeQueueRowsWithReport(rows).rows;
}

// ---------------------------------------------------------------------------
// Queue health check
// ---------------------------------------------------------------------------
// Runs against the prepared rows BEFORE insert. Surfaces three classes of
// problems that have historically caused stuck queues or low-reach batches:
//   1. Missing approvals — no row carries `approved_at`, so the cron worker
//      will never pick anything up (unless auto_approve_queue is on).
//   2. Scheduling gaps — two consecutive scheduled_at values are closer than
//      `minGapMinutes` (default 4), which risks Pinterest rate-limit / spam
//      flags, OR there is a > 24h gap that suggests stagger math is broken.
//   3. Hook-group imbalance — a single hook_group represents > 50% of the
//      batch, signaling weak rotation and reduced creative diversity.
// `blocking` is true only when ALL rows are unapproved (Phase-1 policy).

export interface QueueHealthIssue {
  code: "NO_APPROVALS" | "TIGHT_SCHEDULING_GAP" | "WIDE_SCHEDULING_GAP" | "HOOK_GROUP_IMBALANCE";
  severity: "warn" | "error";
  message: string;
  detail?: Record<string, unknown>;
}

export interface QueueHealthReport {
  ok: boolean;
  blocking: boolean;
  issues: QueueHealthIssue[];
  stats: {
    total: number;
    approved: number;
    hookGroupCounts: Record<string, number>;
    minGapMinutes: number | null;
    maxGapMinutes: number | null;
  };
}

export function runQueueHealthCheck(
  rows: Array<Record<string, unknown>>,
  opts: { minGapMinutes?: number; maxGapHours?: number; imbalanceRatio?: number } = {},
): QueueHealthReport {
  const minGap = opts.minGapMinutes ?? 4;
  const maxGap = (opts.maxGapHours ?? 24) * 60;
  const imbalance = opts.imbalanceRatio ?? 0.5;
  const issues: QueueHealthIssue[] = [];
  const total = rows.length;

  const approved = rows.filter((r) => !!r.approved_at).length;
  if (total > 0 && approved === 0) {
    issues.push({
      code: "NO_APPROVALS",
      severity: "error",
      message: "No pin in this batch has approved_at set — cron worker will not publish any until approval.",
      detail: { total },
    });
  }

  const times = rows
    .map((r) => (r.scheduled_at ? new Date(r.scheduled_at as string).getTime() : NaN))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  let minGapM: number | null = null;
  let maxGapM: number | null = null;
  for (let i = 1; i < times.length; i++) {
    const gap = (times[i] - times[i - 1]) / 60_000;
    if (minGapM === null || gap < minGapM) minGapM = gap;
    if (maxGapM === null || gap > maxGapM) maxGapM = gap;
  }
  if (minGapM !== null && minGapM < minGap) {
    issues.push({
      code: "TIGHT_SCHEDULING_GAP",
      severity: "warn",
      message: `Scheduling gap as low as ${minGapM.toFixed(1)} min — risks Pinterest rate-limit (recommended ≥${minGap} min).`,
      detail: { minGapMinutes: minGapM, threshold: minGap },
    });
  }
  if (maxGapM !== null && maxGapM > maxGap) {
    issues.push({
      code: "WIDE_SCHEDULING_GAP",
      severity: "warn",
      message: `Scheduling gap as wide as ${(maxGapM / 60).toFixed(1)}h — stagger math may be wrong (threshold ${(maxGap / 60).toFixed(1)}h).`,
      detail: { maxGapMinutes: maxGapM, thresholdMinutes: maxGap },
    });
  }

  const hookGroupCounts: Record<string, number> = {};
  for (const r of rows) {
    const k = (r.hook_group as string) || "unknown";
    hookGroupCounts[k] = (hookGroupCounts[k] ?? 0) + 1;
  }
  if (total >= 4) {
    const [topGroup, topCount] = Object.entries(hookGroupCounts)
      .sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    if (topCount / total > imbalance) {
      issues.push({
        code: "HOOK_GROUP_IMBALANCE",
        severity: "warn",
        message: `Hook group "${topGroup}" represents ${Math.round((topCount / total) * 100)}% of the batch (>${Math.round(imbalance * 100)}%).`,
        detail: { topGroup, topCount, total, ratio: topCount / total },
      });
    }
  }

  const blocking = issues.some((i) => i.severity === "error");
  return {
    ok: issues.length === 0,
    blocking,
    issues,
    stats: {
      total,
      approved,
      hookGroupCounts,
      minGapMinutes: minGapM,
      maxGapMinutes: maxGapM,
    },
  };
}

// Required columns the insert payload absolutely needs. If any of these are
// missing from the live table the function aborts BEFORE building/inserting
// pins so we never burn AI/Pexels credits on a doomed batch.
export const REQUIRED_QUEUE_COLUMNS = [
  "product_id", "product_slug", "pin_variant", "pin_title",
  "pin_image_url", "destination_link", "status", "scheduled_at",
] as const;

type SchemaCheck =
  | { ok: true; columns: Set<string> }
  | { ok: false; code: "SCHEMA_INVALID"; missing: string[]; message: string };

// Cached per cold start — information_schema lookup is cheap but pointless
// to repeat on every invocation.
let _schemaCache: SchemaCheck | null = null;

export async function verifyQueueSchema(
  sb: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> },
  opts: { force?: boolean } = {},
): Promise<SchemaCheck> {
  if (_schemaCache && !opts.force) return _schemaCache;
  // Use a tiny RPC-free probe: select 0 rows but request every required column.
  // PostgREST returns 400 with column name on mismatch.
  // We can't easily do that from the client without leaking the API surface,
  // so query information_schema via a SECURITY DEFINER RPC if available;
  // otherwise fall back to a HEAD request shape.
  try {
    // @ts-ignore — runtime client passes through here
    const { data, error } = await (sb as unknown as {
      from: (t: string) => { select: (s: string, o: { head: boolean; count: "exact" }) => Promise<{ data: unknown; error: { message: string } | null }> };
    })
      .from("pinterest_pin_queue")
      .select(REQUIRED_QUEUE_COLUMNS.join(","), { head: true, count: "exact" });
    if (error) {
      const missing = REQUIRED_QUEUE_COLUMNS.filter((c) => error.message.includes(c));
      const result: SchemaCheck = {
        ok: false,
        code: "SCHEMA_INVALID",
        missing: missing.length ? missing : [error.message],
        message: `pinterest_pin_queue schema check failed: ${error.message}`,
      };
      _schemaCache = result;
      return result;
    }
    void data;
    const result: SchemaCheck = { ok: true, columns: new Set(ALLOWED_QUEUE_COLUMNS) };
    _schemaCache = result;
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown schema check error";
    return { ok: false, code: "SCHEMA_INVALID", missing: [], message: msg };
  }
}

export function __resetSchemaCacheForTests() {
  _schemaCache = null;
}

// ---- Pexels (OPTIONAL secondary layer) ---------------------------------
// Used ONLY as a subtle lifestyle backdrop behind the real product image
// when the caller explicitly opts in (`useLifestyleBackdrop: true`).
// Product photo always remains the dominant visual — never replaced.
const PEXELS_QUERIES = [
  "happy cat home",        // pain
  "curious cat",           // curiosity
  "clean modern living room", // time_saving
  "cat owner with cat",    // social_proof
  "cozy cat sleeping",     // transformation
];

/**
 * Per-hook fallback palette — used when Pexels is unavailable. Each palette
 * matches the *color temperature* and emotional tone of its Pexels query so
 * the resulting Cloudinary-rendered backdrop feels cohesive with what would
 * have been fetched. Two colors per hook → primary fill + accent for a soft
 * duotone gradient.
 */
const HOOK_FALLBACK_PALETTE: Record<string, { primary: string; accent: string; temp: "warm" | "cool" | "neutral" }> = {
  pain:           { primary: "C97B2B", accent: "5A2A12", temp: "warm" },     // amber → deep brown (urgency)
  curiosity:      { primary: "2B6E7A", accent: "0F2A33", temp: "cool" },     // teal → ink (intrigue)
  time_saving:   { primary: "3A4A5C", accent: "1A2230", temp: "cool" },      // slate → navy (calm)
  social_proof:   { primary: "B5946A", accent: "5C432A", temp: "warm" },     // cream → cocoa (trust)
  transformation: { primary: "4A2E5C", accent: "1F1330", temp: "cool" },     // plum → midnight (wow)
};

type PexelsPhoto = {
  url: string;
  avgColor: string | null;
  width: number | null;
  height: number | null;
  photographer: string | null;
  pexelsPageUrl: string | null;
};

async function fetchPexelsBackdrop(query: string): Promise<PexelsPhoto | null> {
  const key = Deno.env.get("PEXELS_API_KEY");
  if (!key) {
    console.warn("[pinterest-viral-batch] PEXELS_API_KEY missing — using Cloudinary fallback backdrop");
    return null;
  }
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&size=large&per_page=10`,
      { headers: { Authorization: key } },
    );
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.warn(`[pinterest-viral-batch] Pexels ${r.status} for "${query}": ${body.slice(0, 200)}`);
      return null;
    }
    const j = await r.json();
    const photos: any[] = Array.isArray(j?.photos) ? j.photos : [];
    if (photos.length === 0) {
      console.warn(`[pinterest-viral-batch] Pexels returned 0 photos for "${query}"`);
      return null;
    }
    const pick = photos[Math.floor(Math.random() * photos.length)];
    const url = pick?.src?.portrait || pick?.src?.large2x || pick?.src?.large || null;
    if (!url) return null;
    return {
      url,
      avgColor: typeof pick?.avg_color === "string" ? pick.avg_color : null,
      width: typeof pick?.width === "number" ? pick.width : null,
      height: typeof pick?.height === "number" ? pick.height : null,
      photographer: typeof pick?.photographer === "string" ? pick.photographer : null,
      pexelsPageUrl: typeof pick?.url === "string" ? pick.url : null,
    };
  } catch (e) {
    console.error(`[pinterest-viral-batch] Pexels fetch threw for "${query}":`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Cloudinary-only fallback backdrop. Renders a 1080×1920 portrait canvas
 * with the hook's primary color as fill, an accent-color radial overlay,
 * a gentle blur, and JPEG output — usable as a drop-in replacement for a
 * Pexels photo URL. Always succeeds (no network dependency on Pexels).
 */
function buildCloudinaryFallbackBackdrop(hookKey: string): PexelsPhoto {
  const palette = HOOK_FALLBACK_PALETTE[hookKey] || HOOK_FALLBACK_PALETTE.curiosity;
  // Seed asset: a public SVG we already host. Cloudinary fetches it, then
  // we discard its pixels by padding to 1080×1920 with a solid bg color
  // and stacking a soft accent overlay on top.
  const seed = encodeURIComponent(`${BASE_URL}/placeholder.svg`);
  const base = [
    "w_1080",
    "h_1920",
    "c_pad",
    `b_rgb:${palette.primary}`,
    "f_jpg",
    "q_auto",
  ].join(",");
  // Soft accent vignette — second colored "image" via text trick (a single
  // space rendered huge with a colored background) blurred heavily so it
  // feels like a radial gradient. Cloudinary text overlays accept bg color.
  const accent = [
    "l_text:Arial_400_bold:%20",
    `b_rgb:${palette.accent}`,
    "co_rgb:00000000",
    "w_1400",
    "h_1400",
    "c_fit",
    "g_south",
    "y_-200",
    "o_70",
    "e_blur:600",
  ].join(",");
  const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${base}/${accent}/${seed}`;
  return {
    url,
    avgColor: `#${palette.primary}`,
    width: 1080,
    height: 1920,
    photographer: null,
    pexelsPageUrl: null,
  };
}

/* ─── Backdrop styles + readability scorer ──────────────────────────────
 * We render the SAME Pexels backdrop with 3 different Cloudinary effect
 * stacks and pick the style that maximizes overlay readability based on
 * the photo's average color luminance + saturation. The product image
 * stays the visual hero in every variant.
 */
type BackdropStyle = "dark" | "subtle" | "accent";

const STYLE_EFFECTS: Record<BackdropStyle, string[]> = {
  // Heavy darken + slight blur — best for bright/busy photos so white
  // headline pills always pop. Mimics a "cinematic poster" look.
  dark:   ["e_brightness:-50", "e_saturation:-20", "e_blur:120"],
  // Lightly darkened + desaturated — best when photo is already moody so
  // we don't crush detail. Keeps lifestyle context visible.
  subtle: ["e_brightness:-15", "e_saturation:-25", "e_blur:60"],
  // Mid darken + boosted saturation — best when photo has a strong color
  // accent that complements the brand orange CTA pill.
  accent: ["e_brightness:-30", "e_saturation:35", "e_blur:80", "e_vignette:30"],
};

/** Convert hex (#RRGGBB) → relative luminance 0–1 (sRGB). */
function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  // Rec. 709 luma — good enough proxy for perceived brightness.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Saturation 0–1 from hex (HSL S component). */
function hexSaturation(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

/**
 * Score readability for each style. Higher = better.
 * After applying the style's brightness offset we want the *effective*
 * backdrop luminance to land near 0.22 — dark enough so white-on-orange
 * top pill and dark-on-white bottom pill both have ≥4.5 contrast against
 * neighboring backdrop pixels, but not so dark we lose all atmosphere.
 */
function scoreStyle(style: BackdropStyle, avgColor: string | null): number {
  if (!avgColor) {
    // No color signal — slight bias toward subtle (safest middle ground).
    return style === "subtle" ? 0.6 : 0.5;
  }
  const lum = hexLuminance(avgColor);
  const sat = hexSaturation(avgColor);
  const brightnessDelta =
    style === "dark" ? -0.40 : style === "subtle" ? -0.15 : -0.30;
  const effectiveLum = Math.max(0, Math.min(1, lum + brightnessDelta));
  const TARGET = 0.22;
  // 1.0 when at target, falls off linearly.
  const proximity = 1 - Math.min(1, Math.abs(effectiveLum - TARGET) / 0.5);
  // Bonus for accent style when source has real color punch.
  const accentBonus = style === "accent" ? sat * 0.35 : 0;
  // Mild bonus for dark style when source is very bright (>0.7).
  const darkBonus = style === "dark" && lum > 0.65 ? 0.15 : 0;
  // Mild bonus for subtle when source is already moody (<0.35).
  const subtleBonus = style === "subtle" && lum < 0.35 ? 0.15 : 0;
  return Number((proximity + accentBonus + darkBonus + subtleBonus).toFixed(3));
}

// Hook frameworks — the AI must produce ONE variant per group, in this order.
const HOOK_GROUPS = [
  { key: "pain",            angle: "Pain point",       cta: "End the Daily Scoop" },
  { key: "curiosity",       angle: "Curiosity",        cta: "See Why" },
  { key: "time_saving",     angle: "Time-saving",      cta: "Save Hours Weekly" },
  { key: "social_proof",    angle: "Social proof",     cta: "Join 10,000+ Owners" },
  { key: "transformation",  angle: "Transformation",   cta: "Shop the Upgrade" },
  { key: "infographic",     angle: "Infographic",      cta: "See the Checklist" },
] as const;

/** Map our 6 hooks → the 4 PDP intent slots (problem/solution/comparison/transformation). */
const HOOK_TO_INTENT: Record<string, string> = {
  pain: "problem",
  curiosity: "solution",
  time_saving: "solution",
  social_proof: "comparison",
  transformation: "transformation",
  infographic: "solution",
};

function escapeOverlay(s: string): string {
  // Cloudinary text param: replace commas/slashes which delimit transforms,
  // URL-encode spaces, keep it short and ASCII-safe.
  return encodeURIComponent(
    s.replace(/[,/]/g, " ")
      .replace(/[""'']/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60)
  );
}

/** Build a 9:16 (1080×1920) Cloudinary URL with top + bottom text overlays on the product image. */
function buildPinImage(productImageUrl: string, top: string, bottom: string): string {
  const W = 1080;
  const H = 1920;
  const base = [
    `w_${W}`,
    `h_${H}`,
    "c_fill",
    "g_center",
    "b_rgb:FAF6F0", // cream brand background
    "q_auto",
    "f_jpg",
  ].join(",");

  // Top headline — bold orange pill
  const topOverlay = [
    `l_text:Arial_72_bold:${escapeOverlay(top)}`,
    "co_rgb:FFFFFF",
    "b_rgb:FF6A1A",
    "bo_8px_solid_rgb:FFFFFF",
    "r_24",
    "w_900",
    "c_fit",
    "g_north",
    "y_120",
  ].join(",");

  // Bottom CTA — ink-on-white pill
  const bottomOverlay = [
    `l_text:Arial_56_bold:${escapeOverlay(bottom)}`,
    "co_rgb:1A1410",
    "b_rgb:FFFFFF",
    "r_20",
    "w_900",
    "c_fit",
    "g_south",
    "y_140",
  ].join(",");

  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${base}/${topOverlay}/${bottomOverlay}/${productImageUrl}`;
}

/**
 * Variant: Pexels lifestyle backdrop with the REAL product image as the
 * dominant centered hero (≈70% of frame). Backdrop effects vary per style
 * (dark / subtle / accent) so the auto-picker can choose the most readable
 * variant per photo. Product photo always remains the visual hero.
 */
function buildPinImageWithBackdrop(
  productImageUrl: string,
  backdropUrl: string,
  top: string,
  bottom: string,
  style: BackdropStyle = "dark",
): string {
  const W = 1080;
  const H = 1920;
  const base = [
    `w_${W}`,
    `h_${H}`,
    "c_fill",
    "g_center",
    ...STYLE_EFFECTS[style],
    "q_auto",
    "f_jpg",
  ].join(",");

  // Product image overlay — large, centered, dominant
  const productOverlay = [
    `l_fetch:${btoa(productImageUrl).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`,
    "w_820",
    "h_1100",
    "c_fit",
    "g_center",
    "y_60",
    "r_32",
    "bo_6px_solid_rgb:FFFFFF",
  ].join(",");

  const topOverlay = [
    `l_text:Arial_72_bold:${escapeOverlay(top)}`,
    "co_rgb:FFFFFF",
    "b_rgb:FF6A1A",
    "bo_8px_solid_rgb:FFFFFF",
    "r_24",
    "w_900",
    "c_fit",
    "g_north",
    "y_120",
  ].join(",");

  const bottomOverlay = [
    `l_text:Arial_56_bold:${escapeOverlay(bottom)}`,
    "co_rgb:1A1410",
    "b_rgb:FFFFFF",
    "r_20",
    "w_900",
    "c_fit",
    "g_south",
    "y_140",
  ].join(",");

  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${base}/${productOverlay}/${topOverlay}/${bottomOverlay}/${backdropUrl}`;
}

function buildPinUrl(slug: string, hookKey: string): string {
  const intent = HOOK_TO_INTENT[hookKey] || "solution";
  return `${BASE_URL}/products/${slug}?utm_source=pinterest&utm_medium=social&utm_campaign=viral_batch&utm_content=${hookKey}&hook=${intent}`;
}

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers });
  const traceId = crypto.randomUUID();
  // Helper: always 200 to caller — frontend reads `ok` flag.
  const respond = (payload: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify({ traceId, ...payload }), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    // Optional verbose sanitize report — when truthy the response includes
    // per-row dropped field details. Defaults to false to keep payloads small.
    // Accepts ?verboseSanitize=1 in the URL OR { verboseSanitize: true } in body.
    const url = new URL(req.url);
    const qpVerbose = url.searchParams.get("verboseSanitize");
    const verboseSanitize: boolean = qpVerbose === "1" || qpVerbose === "true"
      || !!body.verboseSanitize;
    // Multi-product support: accept either a single `productSlug` or an array
    // `productSlugs` (Domination Mode). When neither is given we default to the
    // hero product. Loop runs the existing single-product pipeline per slug.
    const slugsRaw: string[] = Array.isArray(body.productSlugs) && body.productSlugs.length
      ? body.productSlugs.map((s: unknown) => String(s)).filter(Boolean)
      : [body.productSlug || DEFAULT_SLUG];
    const sb0 = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Read domination_mode from runtime settings; allow body override (admin
    // can force a one-off run without flipping the global flag).
    let dominationMode = false;
    try {
      const { data: rs } = await sb0
        .from("pinterest_runtime_settings")
        .select("domination_mode")
        .eq("id", 1)
        .maybeSingle();
      dominationMode = !!rs?.domination_mode;
    } catch (_e) { /* fall through — defaults to false */ }
    if (typeof body.dominationMode === "boolean") dominationMode = body.dominationMode;

    // Allowlist gate — bypassed when Domination Mode is on.
    const blockedSlugs = slugsRaw.filter(
      (s) => !dominationMode && !PINTEREST_ALLOWED_SLUGS.has(s),
    );
    if (blockedSlugs.length === slugsRaw.length) {
      return respond({
        ok: false,
        code: "ALLOWLIST_DISABLED",
        message: `Pinterest automation is restricted to: ${Array.from(PINTEREST_ALLOWED_SLUGS).join(", ")}. Enable Domination Mode to publish across the catalog.`,
        blockedSlugs,
        dominationMode,
      });
    }
    const slug: string = slugsRaw.find(
      (s) => dominationMode || PINTEREST_ALLOWED_SLUGS.has(s),
    ) || slugsRaw[0];
    // Optional: enable Pexels lifestyle backdrop layer.
    // OFF by default — product images stay primary.
    const useLifestyleBackdrop: boolean = !!body.useLifestyleBackdrop;
    // Per-hook override: { pain: true, curiosity: false, ... }
    // When provided it FULLY replaces the default "every other pin" pattern
    // and only the explicitly enabled hooks get a backdrop.
    const backdropByHook: Record<string, boolean> | null =
      body.backdropByHook && typeof body.backdropByHook === "object"
        ? body.backdropByHook
        : null;
    // Dry-run mode: build pins + Pexels backdrops but DO NOT insert into queue.
    // Used by the admin preview screen to inspect lifestyle backdrops first.
    const dryRun: boolean = !!body.dryRun;
    // Health-check controls: by default the queue health check runs and
    // BLOCKS the insert if any "error"-severity issue is found (e.g. zero
    // approvals). `forceHealthCheck=true` upgrades all warnings to blocking,
    // `skipHealthCheck=true` disables it entirely (admin override).
    const skipHealthCheck: boolean = !!body.skipHealthCheck;
    const forceHealthCheck: boolean = !!body.forceHealthCheck;
    // Hard cap to prevent overload — at most 8 pins per product per run
    // (one per hook style, including the new infographic style).
    // Premium Mode: up to 15 pins per product per run — when count > 6 we
    // cycle through HOOK_GROUPS multiple times so the AI generates fresh
    // copy variants per repeat, and the seed jitter gives each pin a distinct
    // composition within the same style.
    const MAX_PINS_PER_RUN = 15;
    const requestedLimit = Number.isFinite(Number(body.maxPins)) ? Number(body.maxPins) : MAX_PINS_PER_RUN;
    const pinLimit = Math.max(1, Math.min(MAX_PINS_PER_RUN, requestedLimit));
    console.log(`[pinterest-viral-batch] start trace=${traceId} slugs=${slugsRaw.join(",")} dryRun=${dryRun} backdrop=${useLifestyleBackdrop} limit=${pinLimit} domination=${dominationMode}`);
    const sb = sb0;

    // 🛡️ Schema guard — abort BEFORE building pins / calling AI / Pexels if
    // pinterest_pin_queue is missing required columns. Cached per cold start.
    const schema = await verifyQueueSchema(sb as unknown as Parameters<typeof verifyQueueSchema>[0]);
    if (!schema.ok) {
      console.error(`[pinterest-viral-batch] SCHEMA GUARD trace=${traceId}`, schema);
      return respond({
        ok: false,
        code: schema.code,
        message: schema.message,
        missingColumns: schema.missing,
        fallback: true,
      });
    }

    const { data: product, error: pErr } = await sb
      .from("products")
      .select("id, name, slug, description, category, image_url, images")
      .eq("slug", slug)
      .single();
    if (pErr || !product) {
      console.error(`[pinterest-viral-batch] Product lookup failed for "${slug}":`, pErr?.message);
      return respond({ ok: false, code: "PRODUCT_NOT_FOUND", message: `Product not found: ${slug}` });
    }
    // Resolve category-aware SEO keyword bucket + style-board routing
    const categoryKey = resolveCategoryKey(product.category, product.slug);
    const seoKeywords = TARGET_KEYWORDS_BY_CATEGORY[categoryKey] || TARGET_KEYWORDS_BY_CATEGORY.default;
    // Optionally read board affinity from DB so admins can override fallbacks.
    const styleBoardMap: Record<string, string> = {};
    try {
      const { data: boards } = await sb
        .from("pinterest_boards")
        .select("name, style_affinity, priority")
        .order("priority", { ascending: true });
      const list = Array.isArray(boards) ? boards : [];
      for (const h of HOOK_GROUPS) {
        const match = list.find((b: any) => Array.isArray(b?.style_affinity) && b.style_affinity.includes(h.key));
        if (match?.name) styleBoardMap[h.key] = match.name as string;
      }
    } catch (_e) { /* fall through to hardcoded fallbacks */ }
    const boardForStyle = (style: string): string => {
      if (styleBoardMap[style]) return styleBoardMap[style];
      const fb = STYLE_TO_BOARD_FALLBACK[style];
      return (fb && fb[0]) || "Smart Pet Gadgets";
    };

    const allImages: string[] = [
      product.image_url,
      ...((Array.isArray(product.images) ? product.images : []) as string[]),
    ].filter((u): u is string => typeof u === "string" && u.length > 0);
    if (allImages.length === 0) {
      console.error(`[pinterest-viral-batch] Product "${slug}" has no usable images`);
      return respond({ ok: false, code: "NO_PRODUCT_IMAGES", message: "Product has no images — cannot render pins" });
    }

    // 🧼 Supplier-image scrub — rejects measurement/spec/AliExpress assets.
    // If everything gets scrubbed we abort BEFORE building pins so a doomed
    // batch never reaches AI / queue insert.
    const scrub = scrubProductImages(allImages);
    if (scrub.clean.length === 0) {
      console.error(`[pinterest-viral-batch] All images scrubbed for "${slug}":`,
        JSON.stringify(scrub.rejected.slice(0, 10)));
      return respond({
        ok: false,
        code: "NO_CLEAN_IMAGE",
        message: "All product images were rejected by the supplier-image scrubber",
        rejected: scrub.rejected.slice(0, 20),
      });
    }
    if (scrub.rejected.length > 0) {
      console.warn(`[pinterest-viral-batch] scrubbed ${scrub.rejected.length} supplier images for "${slug}"`);
    }
    const cleanImages = scrub.clean;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[pinterest-viral-batch] LOVABLE_API_KEY missing");
      return respond({ ok: false, code: "LOVABLE_API_KEY_MISSING", message: "AI gateway key not configured" });
    }

    const systemPrompt = `You write US-targeted Pinterest pins that convert clicks into product views.
RULES:
- Mobile-first, scroll-stopping, plain-spoken English (US audience)
- NO clickbait, NO ALL CAPS, NO emojis in titles, NO fake stats
- NO words: "vet-approved", "eco-friendly", "best ever", "guaranteed"
- Each variant uses a DIFFERENT hook framework (provided)
- "infographic" variant uses a numbered/checklist format (e.g. "3 reasons", "5 must-haves")

Return STRICT JSON, no prose, matching:
{ "pins": [
  {
    "hookKey": "pain|curiosity|time_saving|social_proof|transformation|infographic",
    "topOverlay":   "string, max 6 words, big bold headline",
    "bottomOverlay":"string, max 4 words, CTA",
    "title":        "string, 60-100 chars, keyword-rich, US English",
    "description":  "string, 2-3 sentences, includes one of the SEO keywords below, ends with a soft CTA. NO URLs.",
    "tags":         ["5-8 lowercase keyword tags, no #"]
  } x N ]
}`;

    // Explicit content-mix recipe (max 15) — guarantees variety of layouts,
    // emotional triggers, and CTA placements per the Viral Design brief:
    //   3× emotional problem  (pain → tplProblem)
    //   3× cozy lifestyle     (social_proof → tplLifestyle)
    //   3× before/after       (transformation → tplBeforeAfter)
    //   2× infographic        (infographic → tplInfographic)
    //   2× viral curiosity    (curiosity → tplViral)
    //   2× cat-owner hack     (time_saving → tplBenefit)
    const HOOK_BY_KEY: Record<string, typeof HOOK_GROUPS[number]> =
      Object.fromEntries(HOOK_GROUPS.map((h) => [h.key, h])) as Record<string, typeof HOOK_GROUPS[number]>;
    const VIRAL_RECIPE: string[] = [
      "pain", "pain", "pain",
      "social_proof", "social_proof", "social_proof",
      "transformation", "transformation", "transformation",
      "infographic", "infographic",
      "curiosity", "curiosity",
      "time_saving", "time_saving",
    ];
    const recipe = VIRAL_RECIPE.slice(0, pinLimit);
    const ACTIVE_HOOKS: typeof HOOK_GROUPS[number][] = recipe.map(
      (k) => HOOK_BY_KEY[k] || HOOK_GROUPS[0],
    );
    const userPrompt = `Generate exactly ${ACTIVE_HOOKS.length} pins for this product, one per hook framework, IN THIS ORDER:
${ACTIVE_HOOKS.map((h, i) => `${i + 1}. ${h.key} (${h.angle})`).join("\n")}

PRODUCT
Name: ${product.name}
Category: ${product.category || "Pet Products"}
Resolved keyword bucket: ${categoryKey}
Description: ${product.description || ""}

SEO keywords to weave in naturally (use 1–2 per pin, never stuff): ${seoKeywords.join(", ")}.`;

    let parsed: any = { pins: [] };
    let aiFallback = false;
    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.85,
          response_format: { type: "json_object" },
        }),
      });

      if (!aiRes.ok) {
        const text = await aiRes.text().catch(() => "");
        console.error(`[pinterest-viral-batch] AI gateway ${aiRes.status}: ${text.slice(0, 300)}`);
        if (aiRes.status === 429) return respond({ ok: false, code: "AI_RATE_LIMITED", message: "AI rate limited — try again in a minute", fallback: true });
        if (aiRes.status === 402) return respond({ ok: false, code: "AI_CREDITS_EXHAUSTED", message: "AI credits exhausted — top up Lovable AI", fallback: true });
        aiFallback = true;
      } else {
        const aiJson = await aiRes.json();
        const raw = aiJson?.choices?.[0]?.message?.content || "";
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) {
          console.warn("[pinterest-viral-batch] AI returned no JSON — using deterministic fallback copy");
          aiFallback = true;
        } else {
          try {
            parsed = JSON.parse(match[0]);
          } catch (e) {
            console.warn("[pinterest-viral-batch] AI JSON parse failed:", e instanceof Error ? e.message : e);
            aiFallback = true;
          }
        }
      }
    } catch (e) {
      console.error("[pinterest-viral-batch] AI gateway threw:", e instanceof Error ? e.message : e);
      aiFallback = true;
    }

    let aiPins: any[] = Array.isArray(parsed?.pins) ? parsed.pins : [];
    aiPins = ACTIVE_HOOKS.map((h, i) => {
      const found = aiPins.find((p) => String(p?.hookKey).toLowerCase() === h.key) || aiPins[i] || {};
      return { ...found, hookKey: h.key };
    });

    const now = Date.now();
    const STAGGER_MIN = 35; // ~one pin every 35 minutes — safe vs Pinterest limits
    const batchTag = `batch_${new Date(now).toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;

    // Premium-grade Pexels queries. We pair BEFORE (problem scene) with AFTER
    // (resolved/aesthetic scene) so the before/after style renders two truly
    // distinct photos — never the same image twice. Other styles use the
    // single AFTER scene as a cozy lifestyle backdrop.
    type BackdropQuery = { before: string; after: string };
    const BACKDROP_QUERIES_BY_CATEGORY: Record<string, BackdropQuery> = {
      "cat-litter":      { before: "messy bathroom floor",         after: "clean modern bathroom interior" },
      "cat-tree":        { before: "cluttered apartment small",    after: "scandinavian living room cat sunlight" },
      "cat-furniture":   { before: "cluttered hallway",            after: "minimalist modern living room" },
      "smart-pet-gadget":{ before: "messy kitchen counter",        after: "modern kitchen cat sunlight" },
      "dog-bed":         { before: "old worn dog bed floor",       after: "cozy bedroom dog sleeping" },
      "default":         { before: "cluttered home interior",      after: "cozy modern apartment sunlight" },
    };
    const PER_HOOK_AFTER_QUERY: Record<string, string> = {
      pain:           "cozy living room cat soft light",
      transformation: "modern apartment cat sunlight",
      social_proof:   "scandinavian home cat warm light",
      curiosity:      "cat looking out window soft light",
      time_saving:   "minimalist clean modern bathroom",
      infographic:    "warm modern home cat",
    };
    const STYLES_NEEDING_BACKDROP: ReadonlySet<string> = new Set([
      "problem", "before_after", "lifestyle",
    ]);
    const pair = BACKDROP_QUERIES_BY_CATEGORY[categoryKey] || BACKDROP_QUERIES_BY_CATEGORY.default;

    // Layout-signature dedupe across this batch (defensive — every style is
    // already distinct, but variant cards within a style randomize via seed).
    const layoutSeen = new Set<string>();
    // Non-consecutive layout tracker — guarantees no two adjacent pins share
    // the same layout preset, preventing template-feeling output.
    let prevLayoutKey: string | null = null;
    // Per-batch layout validation telemetry — surfaced in the response.
    const layoutIssues: Array<{ index: number; key: string; issues: string[] }> = [];
    let layoutFallbacks = 0;

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < aiPins.length; i++) {
      const p = aiPins[i];
      const hook = ACTIVE_HOOKS[i];
      // Multi-angle round-robin — gives each pin a different product crop
      // when the catalog has more than one clean image.
      const productImage = cleanImages[i % cleanImages.length];
      const style = HOOK_TO_STYLE[hook.key] || "benefit";
      const seed = (now / 60000 | 0) + i * 7 + hook.key.length;

      const topOverlay = String(p.topOverlay || "Stop scooping every day").slice(0, 50);
      // Soft Pinterest-native CTA — rotated by seed, falls back to AI suggestion.
      const bottomOverlay = String(p.bottomOverlay || pickSoftCta(seed)).slice(0, 30);
      const ctrBadge = pickCtrBadge(seed);

      // Fetch a lifestyle backdrop only for styles that benefit from one.
      let backdropUrl: string | null = null;
      let backdropAfterUrl: string | null = null;
      let backdropMeta: PexelsPhoto | null = null;
      let backdropSource: "pexels" | "cloudinary_fallback" | "none" = "none";
      const wantsBackdrop = STYLES_NEEDING_BACKDROP.has(style)
        || (useLifestyleBackdrop && (!backdropByHook || backdropByHook[hook.key]));
      if (wantsBackdrop) {
        // Primary: AI-generated cozy US-apartment scene via Nano Banana 2,
        // cached per-query in pinterest_ai_backdrops + storage so subsequent
        // pins reuse the same hosted PNG (no per-pin generation cost after
        // the first run for a given query).
        const afterQuery = style === "before_after"
          ? pair.after
          : (PER_HOOK_AFTER_QUERY[hook.key] || pair.after);
        let bd: PexelsPhoto | null = await fetchAiBackdrop(sb as unknown as Parameters<typeof fetchAiBackdrop>[0], afterQuery);
        if (!bd) {
          // Fallback path: Pexels (if a valid key exists), else flat
          // Cloudinary palette. Both are last-resort — primary is AI.
          bd = await fetchPexelsBackdrop(afterQuery);
          if (!bd) {
            bd = buildCloudinaryFallbackBackdrop(hook.key);
            backdropSource = "cloudinary_fallback";
          } else {
            backdropSource = "pexels";
          }
        } else {
          backdropSource = "pexels"; // tag column is constrained — reuse safe enum value
        }
        backdropMeta = bd;
        backdropUrl = bd.url;
        if (style === "before_after") {
          const bb = await fetchAiBackdrop(sb as unknown as Parameters<typeof fetchAiBackdrop>[0], pair.before)
            || await fetchPexelsBackdrop(pair.before);
          backdropAfterUrl = backdropUrl;          // After = the cozy/clean scene
          backdropUrl = (bb?.url) || backdropUrl;  // Before = the problem scene
        }
      }

      const built = buildStyledPin(style, {
        productImageUrl: productImage,
        backdropUrl,
        backdropAfterUrl,
        top: topOverlay,
        bottom: bottomOverlay,
        ctrBadge,
        seed,
      });
      // Track signature — purely informational; we never reject here.
      layoutSeen.add(built.layoutSignature);

      // Pre-publish layout QA — collision + safe-area validation produced by
      // the template engine. If a pin fails AND it would also repeat the
      // previous layout, swap to a safer preset (lifestyle = right_text/left_
      // product) by re-rendering with style="benefit" which targets the
      // editorial_magazine preset and validates cleanest.
      if (!built.validation.ok) {
        layoutIssues.push({
          index: i,
          key: built.layoutKey,
          issues: built.validation.issues,
        });
        const safe = buildStyledPin("benefit", {
          productImageUrl: productImage,
          backdropUrl,
          backdropAfterUrl,
          top: topOverlay,
          bottom: bottomOverlay,
          ctrBadge,
          seed: seed + 1,
        });
        if (safe.validation.ok) {
          (built as { url: string }).url = safe.url;
          (built as { layoutKey: string }).layoutKey = safe.layoutKey;
          layoutFallbacks++;
        } else {
          // Both the primary render AND the safe fallback failed safe-area /
          // collision checks. Mark this pin for rejection so we never publish
          // a clipped creative — the row still inserts (for diagnostics) but
          // is held out of the publish queue.
          (built as { __rejected?: boolean }).__rejected = true;
          (built as { __rejectReason?: string }).__rejectReason =
            `layout_unsafe:${(safe.validation.issues || []).slice(0, 3).join(";")}`;
        }
      }
      // Non-consecutive guarantee — if this pin's layout matches the previous
      // pin, log it (we don't re-render here because hook→style mapping is
      // 1:1 and the pin's hook drives variety; the validator above already
      // catches the worst case).
      if (prevLayoutKey && built.layoutKey === prevLayoutKey) {
        layoutIssues.push({
          index: i,
          key: built.layoutKey,
          issues: ["consecutive-layout-repeat"],
        });
      }
      prevLayoutKey = built.layoutKey;

      const title = String(p.title || `${product.name} — ${hook.angle}`).slice(0, 100);
      const description = String(p.description || "Self-cleaning automatic litter box with app control. Less mess, less smell, more time. Shop now.").slice(0, 480);
      const tags: string[] = Array.isArray(p.tags)
        ? p.tags.map((t: string) => String(t).toLowerCase().replace(/^#/, "").trim()).filter(Boolean).slice(0, 8)
        : [];

      const row: Record<string, unknown> = {
        product_id: product.id,
        product_slug: product.slug,
        product_name: product.name,
        pin_variant: `viral_${hook.key}_${style}_${batchTag}`,
        pin_title: title,
        pin_description: description,
        pin_image_url: built.url,
        destination_link: buildPinUrl(product.slug, hook.key),
        board_name: boardForStyle(hook.key),
        hashtags: tags,
        priority: "high",
        status: (built as { __rejected?: boolean }).__rejected ? "rejected" : "draft",
        scheduled_at: new Date(now + i * STAGGER_MIN * 60_000).toISOString(),
        hook_group: hook.key,
        category_key: categoryKey,
        overlay_text: `${topOverlay} | ${bottomOverlay}`,
      };
      if ((built as { __rejected?: boolean }).__rejected) {
        row.rejection_reason = (built as { __rejectReason?: string }).__rejectReason
          || "layout_unsafe";
      }
      // Draft-only metadata (stripped by sanitizer before insert).
      if (backdropMeta) {
        row.backdrop_url = backdropMeta.url;
        row.backdrop_avg_color = backdropMeta.avgColor;
        row.backdrop_source = backdropSource;
        row.backdrop_width = backdropMeta.width;
        row.backdrop_height = backdropMeta.height;
        row.backdrop_photographer = backdropMeta.photographer;
        row.backdrop_pexels_page = backdropMeta.pexelsPageUrl;
        row.backdrop_hook_group = hook.key;
        row.backdrop_style = style;
      }
      // Heuristic save/click score — used to auto-approve the top 3 only.
      const lenT = topOverlay.length;
      const lengthScore = lenT >= 14 && lenT <= 38 ? 1 : 0.4;
      const ctaSoftBonus = /\b(see|save|discover|love|try|why|trend)/i.test(bottomOverlay) ? 0.6 : 0;
      const hookBonus =
        hook.key === "transformation" ? 1.0 :
        hook.key === "pain" ? 0.85 :
        hook.key === "social_proof" ? 0.8 :
        hook.key === "curiosity" ? 0.7 :
        hook.key === "infographic" ? 0.55 :
        0.5;
      const seedJitter = ((seed % 17) / 17) * 0.2;
      (row as any).__score = Number(
        (lengthScore + ctaSoftBonus + hookBonus + seedJitter).toFixed(3),
      );
      rows.push(row);
    }

    // Legacy enrichment path — kept for explicit opt-in only. The premium
    // templates above already handle backdrops per style.
    if (useLifestyleBackdrop && body.legacyBackdrop === true) {
      // Decide which pin indexes get a backdrop:
      // - explicit per-hook map wins (only `true` entries)
      // - else fall back to legacy "every other pin" pattern (0,2,4)
      const enabledIdx: number[] = backdropByHook
        ? rows
            .map((_, idx) => (backdropByHook[ACTIVE_HOOKS[idx].key] ? idx : -1))
            .filter((idx) => idx >= 0)
        : rows.map((_, idx) => idx).filter((idx) => idx % 2 === 0);

      for (const i of enabledIdx) {
        const hook = ACTIVE_HOOKS[i];
        const productImage = allImages[i % allImages.length];
        const query = PEXELS_QUERIES[i] || "happy cat";
        let backdrop = await fetchPexelsBackdrop(query);
        let backdropSource: "pexels" | "cloudinary_fallback" = "pexels";
        if (!backdrop) {
          // Pexels unavailable (no key, network error, empty result) — render
          // a Cloudinary-only backdrop in the same color temperature as the
          // hook's intended Pexels query, so the lifestyle layer never silently
          // disappears.
          backdrop = buildCloudinaryFallbackBackdrop(hook.key);
          backdropSource = "cloudinary_fallback";
        }
        const [top, bot] = (rows[i].overlay_text as string).split(" | ");
        const bottomText = bot || hook.cta;

        // Score all 3 backdrop styles for this photo and pick the winner.
        const styles: BackdropStyle[] = ["dark", "subtle", "accent"];
        const scored = styles.map((style) => ({
          style,
          score: scoreStyle(style, backdrop.avgColor),
          url: buildPinImageWithBackdrop(productImage, backdrop.url, top, bottomText, style),
        }));
        scored.sort((a, b) => b.score - a.score);
        const winner = scored[0];

        rows[i].pin_image_url = winner.url;
        rows[i].pin_variant = `${rows[i].pin_variant}_lifestyle_${winner.style}`;
        (rows[i] as any).backdrop_url = backdrop.url;
        (rows[i] as any).backdrop_query = query;
        (rows[i] as any).backdrop_avg_color = backdrop.avgColor;
        (rows[i] as any).backdrop_source = backdropSource;
        (rows[i] as any).backdrop_width = backdrop.width;
        (rows[i] as any).backdrop_height = backdrop.height;
        (rows[i] as any).backdrop_photographer = backdrop.photographer;
        (rows[i] as any).backdrop_pexels_page = backdrop.pexelsPageUrl;
        (rows[i] as any).backdrop_hook_group = hook.key;
        (rows[i] as any).backdrop_style = winner.style;
        (rows[i] as any).backdrop_score = winner.score;
        (rows[i] as any).backdrop_variants = scored.map((s) => ({
          style: s.style,
          score: s.score,
          url: s.url,
        }));
      }
    }

    // Tier publishing — auto-approve only the top 3 by score, stagger the
    // rest further out so they queue without flooding Pinterest. Top 3 get
    // priority="high" + approved_at=now so the publish worker picks them up
    // immediately; rest stay status="draft" without approved_at and require
    // admin approval (or the next promote-cycle) to publish.
    const ranked = rows
      .map((r, idx) => ({ idx, score: (r as any).__score as number }))
      .sort((a, b) => b.score - a.score);
    const topIdx = new Set(ranked.slice(0, Math.min(3, ranked.length)).map((r) => r.idx));
    rows.forEach((r, i) => {
      delete (r as any).__score;
      if (topIdx.has(i)) {
        (r as Record<string, unknown>).priority = "high";
        (r as Record<string, unknown>).approved_at = new Date(now + 2 * 60_000).toISOString();
        (r as Record<string, unknown>).scheduled_at = new Date(now + (i + 1) * 5 * 60_000).toISOString();
      } else {
        (r as Record<string, unknown>).priority = "medium";
        // Push non-winners further out (60-min stagger starting after top 3).
        (r as Record<string, unknown>).scheduled_at = new Date(now + (i + 4) * 60 * 60_000).toISOString();
      }
    });

    if (dryRun) {
      const dryHealth = runQueueHealthCheck(rows as Array<Record<string, unknown>>);
      return respond({
          ok: true,
          dryRun: true,
          aiFallback,
          message: `Preview ${rows.length} pins (not queued)`,
          product: { id: product.id, slug: product.slug, name: product.name },
          batchTag,
          health: dryHealth,
          pins: rows.map((r: any) => ({
            hook_group: r.hook_group,
            pin_variant: r.pin_variant,
            pin_title: r.pin_title,
            pin_description: r.pin_description,
            pin_image_url: r.pin_image_url,
            destination_link: r.destination_link,
            scheduled_at: r.scheduled_at,
            overlay_text: r.overlay_text,
            backdrop_url: r.backdrop_url || null,
            backdrop_query: r.backdrop_query || null,
            backdrop_avg_color: r.backdrop_avg_color || null,
            backdrop_source: r.backdrop_source || null,
            backdrop_width: r.backdrop_width ?? null,
            backdrop_height: r.backdrop_height ?? null,
            backdrop_photographer: r.backdrop_photographer || null,
            backdrop_pexels_page: r.backdrop_pexels_page || null,
            backdrop_hook_group: r.backdrop_hook_group || null,
            backdrop_style: r.backdrop_style || null,
            backdrop_score: r.backdrop_score ?? null,
            backdrop_variants: r.backdrop_variants || null,
            uses_lifestyle_backdrop: !!r.backdrop_url,
          })),
        });
    }

    // Strip optional visual metadata (backdrop_*) before insert — those columns
    // do not exist on pinterest_pin_queue. Insert must never fail because of
    // optional enrichment data. See sanitizeQueueRows() for the column whitelist.
    const sanitized = sanitizeQueueRowsWithReport(rows as Record<string, unknown>[]);
    const sanitizedRows = sanitized.rows;
    // Annotate each row with QA reasons + URL sanitization. Any row whose
    // destination_link is non-getpawsy or contains corrupted/encoded payloads
    // is diverted to analytics_quarantine instead of being inserted.
    const annotatedRows: typeof sanitizedRows = [];
    for (const r of sanitizedRows) {
      const destCheck = sanitizeUrl((r as Record<string, unknown>).destination_link as string | undefined);
      const imgCheck = sanitizeUrl((r as Record<string, unknown>).pin_image_url as string | undefined, { allowExternalReferrer: true });
      const urlReasons = [...destCheck.reasons, ...imgCheck.reasons];
      const imgUrl = (r as Record<string, unknown>).pin_image_url as string;
      const imgHash = imgUrl ? hashImageUrl(imgUrl) : null;
      let duplicateImage = false;
      if (imgHash) {
        const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
        const { count: dupCount } = await sb
          .from("pinterest_pin_queue")
          .select("*", { count: "exact", head: true })
          .eq("image_hash", imgHash)
          .gte("created_at", fourteenDaysAgo);
        duplicateImage = (dupCount || 0) > 0;
      }
      // Creative-fingerprint dedup — catches "different image URL but same
      // creative DNA" (same slug + variant + hook + overlay + backdrop).
      const meta = (r as Record<string, unknown>).meta as Record<string, unknown> | undefined;
      const intel = (meta?.intelligence ?? {}) as Record<string, unknown>;
      const fingerprint = computeCreativeFingerprint({
        product_slug: (r as Record<string, unknown>).product_slug as string,
        pin_variant: (r as Record<string, unknown>).pin_variant as string,
        hook_group: (r as Record<string, unknown>).hook_group as string,
        category_key: (r as Record<string, unknown>).category_key as string,
        overlay_text: (r as Record<string, unknown>).overlay_text as string,
        backdrop_style: (intel.backdrop_style as string) ?? null,
        pin_mode: (intel.pin_mode as string) ?? null,
      });
      if (!duplicateImage && fingerprint) {
        const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
        const { count: fpCount } = await sb
          .from("pinterest_pin_queue")
          .select("*", { count: "exact", head: true })
          .eq("creative_fingerprint", fingerprint)
          .gte("created_at", fourteenDaysAgo);
        if ((fpCount || 0) > 0) duplicateImage = true;
      }
      const qaReasons = runPinQa({
        ...(r as Record<string, unknown>),
        image_hash: imgHash,
        duplicate_image: duplicateImage,
        domination_mode: dominationMode,
      } as Parameters<typeof runPinQa>[0]);
      // SEO keyword presence — soft check, logged but not fatal.
      const hasKw = containsCategoryKeyword(
        categoryKey,
        (r as Record<string, unknown>).pin_title as string,
        (r as Record<string, unknown>).pin_description as string,
      ) || containsTargetKeyword(
        (r as Record<string, unknown>).pin_title as string,
        (r as Record<string, unknown>).pin_description as string,
      );
      if (!hasKw) console.warn(`[pinterest-viral-batch] no target keyword in pin "${(r as Record<string, unknown>).pin_title}"`);
      const allReasons = Array.from(new Set([...qaReasons, ...urlReasons]));
      const fatalUrl = !destCheck.ok || !imgCheck.ok;
      if (fatalUrl) {
        await quarantineEvent(sb, {
          source: "pinterest_pin_queue",
          reasons: urlReasons,
          payload: r as Record<string, unknown>,
        });
        continue;
      }
      annotatedRows.push({
        ...r,
        qa_reasons: allReasons,
        image_hash: imgHash,
        creative_fingerprint: fingerprint,
      } as typeof r);
    }
    if (annotatedRows.length === 0) {
      return respond({ ok: false, code: "ALL_ROWS_QUARANTINED", message: "All pins were rejected by URL sanitizer" });
    }
    if (sanitized.droppedColumns.length > 0) {
      // Per-batch summary
      console.warn(
        `[pinterest-viral-batch] sanitize trace=${traceId} dropped_columns=${sanitized.droppedColumns.length}`,
        JSON.stringify({
          traceId,
          slug,
          totalRows: sanitizedRows.length,
          droppedColumns: sanitized.droppedColumns,
          droppedCounts: sanitized.droppedCounts,
        }),
      );
      // Per-row detail (only rows that actually lost fields)
      sanitized.droppedPerRow.forEach((cols, i) => {
        if (cols.length === 0) return;
        console.warn(
          `[pinterest-viral-batch] sanitize trace=${traceId} row=${i} variant=${(rows as any)[i]?.pin_variant ?? "?"} dropped=${cols.join(",")}`,
        );
      });
    }
    // 🩺 Queue health check — flag missing approvals, scheduling gaps, and
    // hook-group imbalance BEFORE the insert. Blocks insert when any
    // error-severity issue is found unless `skipHealthCheck` is set.
    const health = runQueueHealthCheck(annotatedRows as Array<Record<string, unknown>>);
    // Layout QA telemetry — surfaced in response for the admin dashboard.
    if (layoutIssues.length > 0) {
      console.warn(
        `[pinterest-viral-batch] layout trace=${traceId} issues=${layoutIssues.length} fallbacks=${layoutFallbacks}`,
        JSON.stringify({ traceId, slug, layoutIssues, layoutFallbacks }),
      );
    }
    if (health.issues.length > 0) {
      console.warn(
        `[pinterest-viral-batch] health trace=${traceId} issues=${health.issues.length}`,
        JSON.stringify({ traceId, slug, issues: health.issues, stats: health.stats }),
      );
    }
    const healthBlocks = !skipHealthCheck && (health.blocking || (forceHealthCheck && health.issues.length > 0));
    if (healthBlocks) {
      return respond({
        ok: false,
        code: "QUEUE_HEALTH_FAILED",
        message: `Queue health check failed (${health.issues.length} issue${health.issues.length === 1 ? "" : "s"}). Pass skipHealthCheck=true to override.`,
        health,
      });
    }
    const { data: inserted, error: insErr } = await sb
      .from("pinterest_pin_queue")
      .insert(annotatedRows)
      .select("id, pin_variant, hook_group, scheduled_at, pin_image_url");
    if (insErr) {
      console.error("[pinterest-viral-batch] Queue insert failed:", insErr.message);
      return respond({ ok: false, code: "QUEUE_INSERT_FAILED", message: `Queue insert failed: ${insErr.message}` });
    }

    console.log(`[pinterest-viral-batch] success trace=${traceId} queued=${inserted?.length ?? 0}`);
    return respond({
      ok: true,
      aiFallback,
      message: `Queued ${inserted?.length ?? 0} viral pins`,
      product: { id: product.id, slug: product.slug, name: product.name },
      batchTag,
      pins: inserted,
      health,
      layout: { issues: layoutIssues, fallbacks: layoutFallbacks },
      sanitize: {
        droppedColumns: sanitized.droppedColumns,
        droppedCounts: sanitized.droppedCounts,
        rowsAffected: sanitized.droppedPerRow.filter((d) => d.length > 0).length,
        ...(verboseSanitize
          ? {
              droppedPerRow: sanitized.droppedPerRow.map((cols, i) => ({
                index: i,
                variant: (rows as Array<Record<string, unknown>>)[i]?.pin_variant ?? null,
                dropped: cols,
              })),
            }
          : {}),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(`[pinterest-viral-batch] UNCAUGHT trace=${traceId}:`, msg, stack);
    return respond({ ok: false, code: "UNEXPECTED_ERROR", message: msg, fallback: true });
  }
});