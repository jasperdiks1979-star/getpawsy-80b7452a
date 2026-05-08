// ─────────────────────────────────────────────────────────────────────────────
// Pinterest premium template engine
//
// Six visually distinct 1080×1920 compositions, one per pin style.
// Each returns a fully-formed Cloudinary fetch URL plus a layout signature
// (so the batch generator can dedupe layouts within a product set).
//
// Constraints we honor:
//  • All compositions are 1080×1920 (Pinterest 9:16 standard) — required by
//    the QA gate (`bad_crop` / `low_resolution` checks).
//  • Top headline always renders into the image so QA's overlay readability
//    + approved-hook checks find it.
//  • CTAs are short Pinterest-native phrases — must be present in the
//    APPROVED_CTAS bank (see pinterest-hooks.ts) to pass `missing_cta` /
//    `weak_hook` style checks.
//  • No supplier image is ever consumed here — caller must scrub first.
// ─────────────────────────────────────────────────────────────────────────────

export type PinStyleKey =
  | "problem"
  | "before_after"
  | "benefit"
  | "lifestyle"
  | "viral"
  | "infographic";

export interface TemplateInput {
  productImageUrl: string;
  /** Optional lifestyle backdrop. Required by `problem`, `before_after`, `lifestyle`. */
  backdropUrl?: string | null;
  /** Headline text — required by all styles. */
  top: string;
  /** CTA text — used by all styles except `problem`. */
  bottom: string;
  /** Optional small CTR badge (e.g. "Save this", "Trending now"). */
  ctrBadge?: string | null;
  /** Stable seed used to randomize layout positions per pin. */
  seed: number;
}

export interface TemplateOutput {
  url: string;
  /** Stable signature describing layout choices — useful for dedupe. */
  layoutSignature: string;
}

const CLOUDINARY_CLOUD = "dlkqycfzn";
const W = 1080;
const H = 1920;
/** Transparent 1×1 placeholder used as the Cloudinary "base" image for
 * canvases that don't take a backdrop photo. We never want the product image
 * to act as the base because Cloudinary then renders it AND the overlay
 * `l_fetch` of the same image, duplicating it on the pin. */
const BLANK_BASE = "https://getpawsy.pet/placeholder.svg";

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeText(s: string): string {
  return encodeURIComponent(
    (s || "")
      .replace(/[,/]/g, " ")
      .replace(/[“”‘’]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60),
  );
}

function fetchB64(url: string): string {
  // Cloudinary `l_fetch` requires URL-safe base64, padding stripped.
  return btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Deterministic 0..n-1 from seed. */
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function build(parts: string[][], baseImage: string): string {
  const segments = parts.map((p) => p.join(",")).join("/");
  // Cloudinary fetch URL must terminate with a URL-encoded source image.
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${segments}/${encodeURIComponent(baseImage)}`;
}

/** Background canvas — used when no backdrop image is supplied. */
function creamCanvas(extra: string[] = []): string[] {
  return ["w_" + W, "h_" + H, "c_pad", "b_rgb:FAF6F0", "q_auto", "f_jpg", ...extra];
}

function darkCanvas(extra: string[] = []): string[] {
  return ["w_" + W, "h_" + H, "c_pad", "b_rgb:121212", "q_auto", "f_jpg", ...extra];
}

// ── Per-style templates ────────────────────────────────────────────────────

/**
 * PROBLEM — emotional poster.
 * Backdrop photo, dark gradient overlay, large headline lower-left, no CTA pill
 * (CTA is delivered via a small CTR badge top-right).
 */
function tplProblem(input: TemplateInput): TemplateOutput {
  const backdrop = input.backdropUrl || input.productImageUrl;
  const yJitter = 80 + (Math.abs(input.seed) % 60);
  const base = ["w_" + W, "h_" + H, "c_fill", "g_auto", "e_brightness:-45", "e_saturation:-15", "e_blur:50", "q_auto", "f_jpg"];

  const productMini = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_440", "h_440", "c_fit", "g_north_east", "x_60", "y_120", "r_max",
    "bo_6px_solid_rgb:FFFFFF",
  ];

  const headline = [
    "l_text:Georgia_96_bold:" + escapeText(input.top),
    "co_rgb:FFFFFF", "w_900", "c_fit", "g_south_west", "x_70", "y_" + (200 + yJitter),
  ];

  const ctrBadge = input.ctrBadge
    ? [
        "l_text:Arial_36_bold:" + escapeText(input.ctrBadge),
        "co_rgb:121212", "b_rgb:FFFFFF", "r_max", "w_500", "c_fit",
        "g_north_west", "x_60", "y_120",
      ]
    : null;

  const layers: string[][] = [base, productMini, headline];
  if (ctrBadge) layers.push(ctrBadge);
  return {
    url: build(layers, backdrop),
    layoutSignature: `problem|y${yJitter}|badge${ctrBadge ? 1 : 0}`,
  };
}

/**
 * BEFORE / AFTER — vertical 50/50 split frame.
 * Top half = product on muted cream ("Before"), bottom half = product on
 * warm lifestyle backdrop ("After"). Thin orange divider.
 */
function tplBeforeAfter(input: TemplateInput): TemplateOutput {
  const backdrop = input.backdropUrl || input.productImageUrl;
  // Top half base — desaturated cream
  const base = ["w_" + W, "h_" + H, "c_pad", "b_rgb:E6DED2", "q_auto", "f_jpg"];

  // Bottom-half: warm backdrop overlay (covers lower 960px)
  const bottomBackdrop = [
    "l_fetch:" + fetchB64(backdrop),
    "w_" + W, "h_960", "c_fill", "g_south", "y_0",
    "e_brightness:-10", "e_saturation:25",
  ];

  // Product image — top half (greyish "Before")
  const productTop = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_700", "h_700", "c_fit", "g_north", "y_240",
    "e_saturation:-50", "e_brightness:-5",
  ];

  // Product image — bottom half ("After", saturated)
  const productBot = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_700", "h_700", "c_fit", "g_south", "y_220",
    "e_saturation:25", "r_24", "bo_4px_solid_rgb:FFFFFF",
  ];

  // Orange divider strip at midline
  const divider = [
    "l_text:Arial_28_bold:%E2%80%94",
    "co_rgb:FF6A1A", "b_rgb:FF6A1A", "w_" + W, "h_8", "c_fit",
    "g_center", "y_0",
  ];

  const beforeLabel = [
    "l_text:Arial_44_bold:" + escapeText("Before"),
    "co_rgb:1A1410", "b_rgb:FFFFFF", "r_max", "w_220", "c_fit",
    "g_north_west", "x_60", "y_120",
  ];

  const afterLabel = [
    "l_text:Arial_44_bold:" + escapeText("After"),
    "co_rgb:FFFFFF", "b_rgb:FF6A1A", "r_max", "w_220", "c_fit",
    "g_south_west", "x_60", "y_120",
  ];

  const headline = [
    "l_text:Arial_56_bold:" + escapeText(input.top),
    "co_rgb:FFFFFF", "b_rgb:1A1410", "w_900", "c_fit",
    "r_24", "g_center", "y_0",
  ];

  return {
    url: build([base, bottomBackdrop, productTop, productBot, divider, beforeLabel, afterLabel, headline], backdrop),
    layoutSignature: "before_after|split50",
  };
}

/**
 * BENEFIT — clean infographic-lite.
 * Cream canvas, product centered, 3 small rounded "feature badges" floated
 * around it, slim header strip top.
 */
function tplBenefit(input: TemplateInput): TemplateOutput {
  const base = creamCanvas();

  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_780", "h_900", "c_fit", "g_center", "y_60", "r_28",
  ];

  // Top header strip
  const header = [
    "l_text:Arial_56_bold:" + escapeText(input.top),
    "co_rgb:FFFFFF", "b_rgb:1A1410", "w_" + W, "h_180", "c_fit",
    "g_north", "y_0",
  ];

  // 3 feature badges — left middle / right top / right bottom
  const badges = [
    pick(["No mess", "Quiet motor", "App control"], input.seed),
    pick(["Fast clean", "Odor-free", "5-min setup"], input.seed + 1),
    pick(["Saves time", "Vet-loved", "USA-approved"], input.seed + 2),
  ];
  const b1 = [
    "l_text:Arial_38_bold:" + escapeText(badges[0]),
    "co_rgb:FFFFFF", "b_rgb:FF6A1A", "r_max", "w_360", "c_fit",
    "g_west", "x_60", "y_-100",
  ];
  const b2 = [
    "l_text:Arial_38_bold:" + escapeText(badges[1]),
    "co_rgb:1A1410", "b_rgb:FFFFFF", "bo_3px_solid_rgb:FF6A1A",
    "r_max", "w_360", "c_fit",
    "g_east", "x_60", "y_-200",
  ];
  const b3 = [
    "l_text:Arial_38_bold:" + escapeText(badges[2]),
    "co_rgb:1A1410", "b_rgb:FFFFFF", "bo_3px_solid_rgb:1A1410",
    "r_max", "w_360", "c_fit",
    "g_east", "x_60", "y_200",
  ];

  const cta = [
    "l_text:Arial_48_bold:" + escapeText(input.bottom),
    "co_rgb:FFFFFF", "b_rgb:FF6A1A", "r_24", "w_700", "c_fit",
    "g_south", "y_120",
  ];

  return {
    url: build([base, product, header, b1, b2, b3, cta], BLANK_BASE),
    layoutSignature: `benefit|b1=${badges[0]}|b2=${badges[1]}|b3=${badges[2]}`,
  };
}

/**
 * LIFESTYLE — full-bleed cozy interior, product composited subtly.
 * Minimal text: small bottom-left brand mark + soft CTA badge top-right.
 */
function tplLifestyle(input: TemplateInput): TemplateOutput {
  const backdrop = input.backdropUrl || input.productImageUrl;
  const base = ["w_" + W, "h_" + H, "c_fill", "g_auto", "e_brightness:-5", "e_saturation:10", "q_auto", "f_jpg"];

  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_640", "h_780", "c_fit", "g_south_east", "x_60", "y_220", "r_24",
    "bo_4px_solid_rgb:FFFFFF",
  ];

  // Tiny brand mark bottom-left
  const brand = [
    "l_text:Georgia_36_bold:" + escapeText("getpawsy.pet"),
    "co_rgb:FFFFFF", "g_south_west", "x_80", "y_100",
  ];

  // Soft CTA badge top-right
  const cta = [
    "l_text:Arial_40_bold:" + escapeText(input.bottom),
    "co_rgb:1A1410", "b_rgb:FFFFFF", "r_max", "w_520", "c_fit",
    "g_north_east", "x_60", "y_120",
  ];

  // Large but light editorial headline top-left
  const headline = [
    "l_text:Georgia_64_bold:" + escapeText(input.top),
    "co_rgb:FFFFFF", "w_700", "c_fit",
    "g_north_west", "x_80", "y_280",
  ];

  return {
    url: build([base, product, brand, cta, headline], backdrop),
    layoutSignature: "lifestyle|fullbleed",
  };
}

/**
 * VIRAL — TikTok-style hook poster.
 * Black canvas, neon-orange diagonal block, large screaming headline top,
 * product mid, curiosity CTA pill bottom.
 */
function tplViral(input: TemplateInput): TemplateOutput {
  const base = darkCanvas();

  // Orange "splash" — large rotated text-as-block in the upper third
  const splash = [
    "l_text:Arial_400_bold:%20",
    "b_rgb:FF6A1A", "co_rgb:00000000",
    "w_1400", "h_540", "c_fit",
    "g_north", "y_-80", "a_-6", "o_90",
  ];

  const headline = [
    "l_text:Impact_104_bold:" + escapeText(input.top),
    "co_rgb:FFFFFF", "w_980", "c_fit",
    "g_north", "y_220",
  ];

  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_780", "h_780", "c_fit", "g_center", "y_60", "r_24",
    "bo_6px_solid_rgb:FF6A1A",
  ];

  const cta = [
    "l_text:Arial_56_bold:" + escapeText(input.bottom),
    "co_rgb:1A1410", "b_rgb:FFFFFF", "r_max", "w_780", "c_fit",
    "g_south", "y_140",
  ];

  return {
    url: build([base, splash, headline, product, cta], BLANK_BASE),
    layoutSignature: "viral|tiktok",
  };
}

/**
 * INFOGRAPHIC — numbered 3-step strip down the right side.
 * Cream canvas, product hero left, header band top, "Save this" badge top-right.
 */
function tplInfographic(input: TemplateInput): TemplateOutput {
  const base = creamCanvas();

  const header = [
    "l_text:Arial_56_bold:" + escapeText(input.top),
    "co_rgb:FFFFFF", "b_rgb:1A1410", "w_" + W, "h_180", "c_fit",
    "g_north", "y_0",
  ];

  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_540", "h_960", "c_fit", "g_west", "x_40", "y_-20", "r_24",
  ];

  // 3 numbered cards on the right side
  const stepLabels = [
    pick(["Plug it in", "Open the box", "Place anywhere"], input.seed),
    pick(["Tap to clean", "Pair the app", "Set a schedule"], input.seed + 1),
    pick(["Enjoy quiet days", "Done in seconds", "Save hours weekly"], input.seed + 2),
  ];
  const card = (n: number, label: string, y: number, color: string) => [
    "l_text:Arial_44_bold:" + escapeText(`${n}. ${label}`),
    "co_rgb:1A1410", `b_rgb:${color}`, "bo_2px_solid_rgb:1A1410",
    "r_24", "w_460", "c_fit",
    "g_east", "x_40", `y_${y}`,
  ];
  const c1 = card(1, stepLabels[0], -180, "FFFFFF");
  const c2 = card(2, stepLabels[1], 0, "FAE4D2");
  const c3 = card(3, stepLabels[2], 180, "FF6A1A").map((s) =>
    s.replace("co_rgb:1A1410", "co_rgb:FFFFFF"),
  );

  const saveBadge = [
    "l_text:Arial_36_bold:" + escapeText(input.ctrBadge || "Save this"),
    "co_rgb:FFFFFF", "b_rgb:FF6A1A", "r_max", "w_360", "c_fit",
    "g_north_east", "x_40", "y_200",
  ];

  return {
    url: build([base, header, product, c1, c2, c3, saveBadge], BLANK_BASE),
    layoutSignature: `infographic|s1=${stepLabels[0]}|s2=${stepLabels[1]}|s3=${stepLabels[2]}`,
  };
}

const TEMPLATES: Record<PinStyleKey, (i: TemplateInput) => TemplateOutput> = {
  problem: tplProblem,
  before_after: tplBeforeAfter,
  benefit: tplBenefit,
  lifestyle: tplLifestyle,
  viral: tplViral,
  infographic: tplInfographic,
};

/** Dispatch to the per-style template. Always returns a 1080×1920 URL. */
export function buildStyledPin(style: PinStyleKey, input: TemplateInput): TemplateOutput {
  const fn = TEMPLATES[style] || tplBenefit;
  return fn(input);
}

/** Map our 6 hook keys → 6 visual styles (1:1, distinct layouts). */
export const HOOK_TO_STYLE: Record<string, PinStyleKey> = {
  pain: "problem",
  transformation: "before_after",
  time_saving: "benefit",
  social_proof: "lifestyle",
  curiosity: "viral",
  infographic: "infographic",
};

/** Soft Pinterest-native CTAs — rotated by seed across pins. */
export const SOFT_CTAS: string[] = [
  "Discover more",
  "See it in action",
  "Shop the upgrade",
  "Explore the setup",
  "See the transformation",
  "See why",
];

/** CTR badges — natural rotation. */
export const CTR_BADGES: string[] = [
  "Save this",
  "Trending now",
  "Cat owners love this",
  "Viral pet find",
  "Must-have for cat parents",
];

export function pickSoftCta(seed: number): string {
  return SOFT_CTAS[Math.abs(seed) % SOFT_CTAS.length];
}

export function pickCtrBadge(seed: number): string | null {
  // Skip ~30% of pins so badges feel handcrafted, not stamped on every one.
  if (Math.abs(seed) % 10 < 3) return null;
  return CTR_BADGES[Math.abs(seed) % CTR_BADGES.length];
}
