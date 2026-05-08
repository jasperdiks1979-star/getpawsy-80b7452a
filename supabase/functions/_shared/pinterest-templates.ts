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
  /** Optional second backdrop — used by `before_after` for the AFTER scene.
   *  When omitted the AFTER half falls back to a brighter recolor of `backdropUrl`. */
  backdropAfterUrl?: string | null;
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
/** Solid cream "blank" base used for canvases without a backdrop photo.
 * Must be a real raster (JPG/PNG) — Cloudinary cannot render our local
 * placeholder.svg cleanly and ends up showing its icon glyph through the
 * overlays. placehold.co reliably returns a tiny solid-color JPEG that we
 * then pad to 1080×1920 with the canvas bg color. */
const BLANK_BASE = "https://placehold.co/8x8/FAF6F0/FAF6F0.jpg";

// Cloudinary text supports %0A for newlines. We use it to soft-wrap headlines
// so they never overflow the safe area. Word-aware to avoid breaking mid-word.
function wrapHeadline(s: string, charsPerLine: number, maxLines = 3): string {
  const words = (s || "").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + " " + w).length <= charsPerLine) cur += " " + w;
    else { lines.push(cur); cur = w; if (lines.length >= maxLines) break; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.slice(0, maxLines).join("%0A");
}

// Right-arrow glyph for premium CTAs — URL-encoded UTF-8.
const ARROW = "%20%E2%86%92"; // "  →"

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

// Like escapeText but PRESERVES injected %0A line breaks produced by wrapHeadline.
function escapeWrapped(s: string): string {
  // s is already URL-segment-friendly except for spaces/commas which we must clean.
  return s
    .replace(/[,/]/g, " ")
    .replace(/[“”‘’]/g, "'")
    .split("%0A")
    .map((line) => encodeURIComponent(line.trim().slice(0, 28)))
    .join("%0A");
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
  // Cloudinary fetch URL terminates with the raw source URL — Cloudinary
  // accepts unencoded or single-encoded; raw matches the working behavior of
  // the legacy `buildPinImage` helper.
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${segments}/${baseImage}`;
}

/** Background canvas — used when no backdrop image is supplied. */
function creamCanvas(extra: string[] = []): string[] {
  return ["w_" + W, "h_" + H, "c_pad", "b_rgb:FAF6F0", "q_auto", "f_jpg", ...extra];
}

function darkCanvas(extra: string[] = []): string[] {
  return ["w_" + W, "h_" + H, "c_pad", "b_rgb:121212", "q_auto", "f_jpg", ...extra];
}

/** Soft gradient scrim band — gives photo backdrops a legible zone for
 *  headlines without the harsh "black rectangle" look. Uses Cloudinary's
 *  `e_gradient_fade` so the rectangle fades to transparent on its leading
 *  edge (fade direction is chosen per gravity). */
function scrimBand(opts: { gravity: "north" | "south" | "center"; height: number; y: number; opacity?: number }): string[] {
  // Gradient direction per anchor: north scrim fades upward (top stays
  // strong, bottom edge dissolves), south fades downward, center fades
  // outward both directions (we approximate with symmetric fade).
  const fadeDir =
    opts.gravity === "north" ? "symmetric_pad" :
    opts.gravity === "south" ? "symmetric_pad" :
    "symmetric_pad";
  void fadeDir;
  return [
    "l_text:Arial_120_bold:%20",
    "b_rgb:000000",
    "co_rgb:00000000",
    "w_" + W, "h_" + opts.height, "c_fit",
    "g_" + opts.gravity, "y_" + opts.y,
    // Soften the rectangle into a gradient: ~50% fade strength.
    "e_gradient_fade:50",
    "o_" + (opts.opacity ?? 55),
  ];
}

// ── Per-style templates ────────────────────────────────────────────────────

/**
 * PROBLEM — emotional editorial poster.
 * Full-bleed photo, soft top vignette + bottom scrim for legibility,
 * 3-line wrapped serif headline anchored bottom-left, premium pill CTA above it,
 * tiny brand mark + CTR badge top-right. NO empty cream zones.
 */
function tplProblem(input: TemplateInput): TemplateOutput {
  const backdrop = input.backdropUrl || input.productImageUrl;
  const base = [
    "w_" + W, "h_" + H, "c_fill", "g_auto",
    "e_brightness:-15", "e_saturation:-5", "e_contrast:10",
    "q_auto", "f_jpg",
  ];
  // Bottom scrim — guarantees text legibility regardless of photo content.
  const bottomScrim = scrimBand({ gravity: "south", height: 720, y: 0, opacity: 70 });
  // Top scrim — softer, supports the badge row.
  const topScrim = scrimBand({ gravity: "north", height: 240, y: 0, opacity: 45 });

  // Product floating bottom-right — soft white card, generous shadow feel via border.
  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_460", "h_460", "c_fit", "g_south_east", "x_70", "y_180", "r_28",
    "bo_3px_solid_rgb:FFFFFF",
  ];

  // Headline — wrapped serif, max 3 lines. Smaller font + tighter wrap so
  // long lines never overflow the 640-wide safe zone on the left half.
  const wrapped = wrapHeadline(input.top, 13, 3);
  const headline = [
    "l_text:Georgia_72_bold:" + escapeWrapped(wrapped),
    "co_rgb:FFFFFF", "w_640", "c_fit", "g_south_west", "x_80", "y_360",
  ];

  // Premium CTA pill — centered along the south edge so the rounded pill
  // never gets clipped by the canvas left edge regardless of text length.
  const cta = [
    "l_text:Arial_42_bold:" + escapeText(input.bottom) + ARROW,
    "co_rgb:FFFFFF", "b_rgb:FF6A1A", "r_max", "w_560", "c_fit",
    "g_south", "y_220",
  ];

  const ctrBadge = input.ctrBadge
    ? [
        "l_text:Arial_34_bold:" + escapeText(input.ctrBadge),
        "co_rgb:1A1410", "b_rgb:FFFFFF", "r_max", "w_460", "c_fit",
        "g_north_west", "x_60", "y_90",
      ]
    : null;

  const brand = [
    "l_text:Georgia_30:" + escapeText("getpawsy.pet"),
    "co_rgb:FFFFFF", "g_north_east", "x_60", "y_110", "o_85",
  ];

  const layers: string[][] = [base, topScrim, bottomScrim, product, headline, cta, brand];
  if (ctrBadge) layers.push(ctrBadge);
  return {
    url: build(layers, backdrop),
    layoutSignature: `problem|premium|badge${ctrBadge ? 1 : 0}`,
  };
}

/**
 * BEFORE / AFTER — true split with TWO different scenes.
 * Top half = "Before" backdrop (messy/cluttered, desaturated).
 * Bottom half = "After" backdrop (clean/aesthetic, vibrant) with the product
 * composited as the hero. Diagonal divider, premium labels, headline as a
 * narrow center band so neither scene is hidden.
 */
function tplBeforeAfter(input: TemplateInput): TemplateOutput {
  const beforeBg = input.backdropUrl || input.productImageUrl;
  const afterBg = input.backdropAfterUrl || input.backdropUrl || input.productImageUrl;

  // Base = BEFORE photo on top half, desaturated to feel "problematic".
  const base = [
    "w_" + W, "h_" + H, "c_fill", "g_auto",
    "e_saturation:-55", "e_brightness:-10", "e_contrast:5",
    "q_auto", "f_jpg",
  ];

  // AFTER backdrop covers the lower 60% with a warmer, vibrant look.
  const afterCover = [
    "l_fetch:" + fetchB64(afterBg),
    "w_" + W, "h_1180", "c_fill", "g_south", "y_0",
    "e_brightness:5", "e_saturation:25", "e_contrast:8",
  ];

  // Soft cream divider band — emulates a fold instead of a hard line.
  const fold = [
    "l_text:Arial_120_bold:%20",
    "b_rgb:FAF6F0", "co_rgb:00000000",
    "w_" + W, "h_24", "c_fit",
    "g_center", "y_-20", "o_90",
  ];

  // Product hero composited into the AFTER half.
  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_720", "h_720", "c_fit", "g_south", "y_280", "r_28",
    "bo_4px_solid_rgb:FFFFFF",
  ];

  // Premium pill labels — Before (ink) / After (orange).
  const beforeLabel = [
    "l_text:Arial_42_bold:" + escapeText("Before"),
    "co_rgb:FFFFFF", "b_rgb:1A1410", "r_max", "w_240", "c_fit",
    "g_north_west", "x_70", "y_140",
  ];
  const afterLabel = [
    "l_text:Arial_42_bold:" + escapeText("After"),
    "co_rgb:FFFFFF", "b_rgb:FF6A1A", "r_max", "w_240", "c_fit",
    "g_south_west", "x_70", "y_180",
  ];

  // Headline sits inside a small center band so it doesn't cover either scene.
  const wrapped = wrapHeadline(input.top, 24, 2);
  const headlineScrim = scrimBand({ gravity: "center", height: 220, y: 0, opacity: 78 });
  const headline = [
    "l_text:Georgia_60_bold:" + escapeWrapped(wrapped),
    "co_rgb:FFFFFF", "w_920", "c_fit", "g_center", "y_0",
  ];

  // Bottom CTA pill on the AFTER half.
  const cta = [
    "l_text:Arial_44_bold:" + escapeText(input.bottom) + ARROW,
    "co_rgb:FFFFFF", "b_rgb:FF6A1A", "r_max", "w_540", "c_fit",
    "g_south", "y_110",
  ];

  return {
    url: build([base, afterCover, fold, product, beforeLabel, afterLabel, headlineScrim, headline, cta], beforeBg),
    layoutSignature: "before_after|premium_split",
  };
}

/**
 * BENEFIT — premium editorial card.
 * Warm cream canvas, large product hero with soft shadow plate, headline
 * in serif at top, 3 stat-style chips inline below product, premium CTA
 * with arrow. Dense composition, no empty zones.
 */
function tplBenefit(input: TemplateInput): TemplateOutput {
  // Warm cream with a soft accent corner — adds depth vs flat fill.
  const base = ["w_" + W, "h_" + H, "c_pad", "b_rgb:F5EBDD", "q_auto", "f_jpg"];
  const accentCorner = [
    "l_text:Arial_400_bold:%20",
    "b_rgb:FF6A1A", "co_rgb:00000000",
    "w_900", "h_900", "c_fit",
    "g_north_east", "x_-200", "y_-200", "o_18",
  ];

  // Editorial headline (serif, wrapped, anchored top-left).
  const wrapped = wrapHeadline(input.top, 16, 3);
  const headline = [
    "l_text:Georgia_84_bold:" + escapeWrapped(wrapped),
    "co_rgb:1A1410", "w_920", "c_fit", "g_north_west", "x_80", "y_140",
  ];

  // Soft plate behind the product for depth.
  const plate = [
    "l_text:Arial_400_bold:%20",
    "b_rgb:FFFFFF", "co_rgb:00000000",
    "w_860", "h_900", "c_fit",
    "g_center", "y_60", "o_85", "r_36",
  ];

  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_760", "h_840", "c_fit", "g_center", "y_60", "r_24",
  ];

  // Three stat chips inline at the bottom of the plate.
  const stats: [string, string, string] = [
    pick(["No scoop", "Self-clean", "App-control"], input.seed),
    pick(["Odor-free", "Quiet motor", "Quick setup"], input.seed + 1),
    pick(["Save hours", "Cat-loved", "Built to last"], input.seed + 2),
  ];
  const chip = (label: string, x: number) => [
    "l_text:Arial_34_bold:" + escapeText(label),
    "co_rgb:1A1410", "b_rgb:FFFFFF", "bo_2px_solid_rgb:FF6A1A",
    "r_max", "w_300", "c_fit",
    "g_south", "x_" + x, "y_280",
  ];
  const c1 = chip(stats[0], -340);
  const c2 = chip(stats[1], 0);
  const c3 = chip(stats[2], 340);

  const cta = [
    "l_text:Arial_50_bold:" + escapeText(input.bottom) + ARROW,
    "co_rgb:FFFFFF", "b_rgb:1A1410", "r_max", "w_640", "c_fit",
    "g_south", "y_120",
  ];

  return {
    url: build([base, accentCorner, plate, product, headline, c1, c2, c3, cta], BLANK_BASE),
    layoutSignature: `benefit|premium|s=${stats.join("/")}`,
  };
}

/**
 * LIFESTYLE — full-bleed cozy interior, product composited as a soft hero.
 * Editorial wrapped headline top-left over a top scrim; pill CTA + brand mark
 * bottom row. Photo is the star.
 */
function tplLifestyle(input: TemplateInput): TemplateOutput {
  const backdrop = input.backdropUrl || input.productImageUrl;
  const base = [
    "w_" + W, "h_" + H, "c_fill", "g_auto",
    "e_brightness:-5", "e_saturation:15", "e_contrast:6",
    "q_auto", "f_jpg",
  ];
  const topScrim = scrimBand({ gravity: "north", height: 520, y: 0, opacity: 55 });
  const bottomScrim = scrimBand({ gravity: "south", height: 280, y: 0, opacity: 55 });

  // Product hero — soft white card bottom-right.
  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_560", "h_700", "c_fit", "g_south_east", "x_70", "y_240", "r_24",
    "bo_4px_solid_rgb:FFFFFF",
  ];

  // Editorial wrapped headline.
  const wrapped = wrapHeadline(input.top, 18, 3);
  const headline = [
    "l_text:Georgia_76_bold:" + escapeWrapped(wrapped),
    "co_rgb:FFFFFF", "w_840", "c_fit",
    "g_north_west", "x_80", "y_180",
  ];

  // Premium pill CTA + brand mark on the bottom scrim.
  const cta = [
    "l_text:Arial_42_bold:" + escapeText(input.bottom) + ARROW,
    "co_rgb:1A1410", "b_rgb:FFFFFF", "r_max", "w_520", "c_fit",
    "g_south_west", "x_80", "y_110",
  ];
  const brand = [
    "l_text:Georgia_30:" + escapeText("getpawsy.pet"),
    "co_rgb:FFFFFF", "g_south_east", "x_80", "y_130", "o_85",
  ];

  return {
    url: build([base, topScrim, bottomScrim, product, headline, cta, brand], backdrop),
    layoutSignature: "lifestyle|premium",
  };
}

/**
 * VIRAL — TikTok energy with breathing room.
 * Charcoal canvas, slightly rotated orange splash, screaming wrapped headline,
 * product mid with neon outline, premium curiosity CTA bottom.
 */
function tplViral(input: TemplateInput): TemplateOutput {
  const base = darkCanvas();

  // Subtle rotation jitter — splash is a soft accent, not a banner.
  const angle = -3 - (Math.abs(input.seed) % 4);
  const splash = [
    "l_text:Arial_400_bold:%20",
    "b_rgb:FF6A1A", "co_rgb:00000000",
    "w_1100", "h_360", "c_fit",
    "g_north", "y_140", "a_" + angle, "o_55",
    "e_gradient_fade:60",
  ];

  const wrapped = wrapHeadline(input.top, 14, 3);
  const headline = [
    "l_text:Impact_104_bold:" + escapeWrapped(wrapped),
    "co_rgb:FFFFFF", "w_980", "c_fit",
    "g_north", "y_200",
  ];

  // Product card with white inner border for depth.
  const productPlate = [
    "l_text:Arial_400_bold:%20",
    "b_rgb:FFFFFF", "co_rgb:00000000",
    "w_840", "h_840", "c_fit",
    "g_center", "y_60", "r_36", "o_100",
  ];
  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_780", "h_780", "c_fit", "g_center", "y_60", "r_24",
  ];

  const cta = [
    "l_text:Arial_56_bold:" + escapeText(input.bottom) + ARROW,
    "co_rgb:121212", "b_rgb:FFFFFF", "r_max", "w_760", "c_fit",
    "g_south", "y_140",
  ];

  // Tiny CTR badge below CTA for save-prompts.
  const ctrBadge = input.ctrBadge
    ? [
        "l_text:Arial_30_bold:" + escapeText(input.ctrBadge),
        "co_rgb:FFFFFF", "b_rgb:FF6A1A", "r_max", "w_360", "c_fit",
        "g_south", "y_60",
      ]
    : null;

  const layers: string[][] = [base, splash, headline, productPlate, product, cta];
  if (ctrBadge) layers.push(ctrBadge);
  return {
    url: build(layers, BLANK_BASE),
    layoutSignature: `viral|premium|a${angle}`,
  };
}

/**
 * INFOGRAPHIC — save-worthy numbered checklist.
 * Warm cream canvas, serif title block top, product hero left,
 * 3 numbered cards stacked right with tight spacing, premium "Save" badge,
 * CTA bar bottom.
 */
function tplInfographic(input: TemplateInput): TemplateOutput {
  const base = ["w_" + W, "h_" + H, "c_pad", "b_rgb:F5EBDD", "q_auto", "f_jpg"];

  // Wrapped serif title up top.
  const wrappedTitle = wrapHeadline(input.top, 18, 2);
  const title = [
    "l_text:Georgia_72_bold:" + escapeWrapped(wrappedTitle),
    "co_rgb:1A1410", "w_920", "c_fit",
    "g_north_west", "x_80", "y_120",
  ];

  // Product hero on the left, contained within bottom 65% so cards fit right.
  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_500", "h_900", "c_fit", "g_south_west", "x_60", "y_220", "r_24",
  ];

  const stepLabels = [
    pick(["Plug it in", "Open the box", "Place anywhere"], input.seed),
    pick(["Tap to clean", "Pair the app", "Set a schedule"], input.seed + 1),
    pick(["Save 30 min/week", "Done in seconds", "Quiet & odor-free"], input.seed + 2),
  ];
  // Cards stacked right, tight vertical rhythm.
  const card = (n: number, label: string, y: number, fill: string, ink: string) => [
    "l_text:Arial_38_bold:" + escapeText(`${n}.  ${label}`),
    "co_rgb:" + ink, "b_rgb:" + fill, "bo_2px_solid_rgb:1A1410",
    "r_28", "w_440", "c_fit",
    "g_east", "x_60", `y_${y}`,
  ];
  const c1 = card(1, stepLabels[0], 80, "FFFFFF", "1A1410");
  const c2 = card(2, stepLabels[1], -80, "FAE4D2", "1A1410");
  const c3 = card(3, stepLabels[2], -240, "FF6A1A", "FFFFFF");

  const saveBadge = [
    "l_text:Arial_32_bold:" + escapeText(input.ctrBadge || "Save this") + ARROW,
    "co_rgb:FFFFFF", "b_rgb:1A1410", "r_max", "w_320", "c_fit",
    "g_north_east", "x_60", "y_140",
  ];

  const cta = [
    "l_text:Arial_44_bold:" + escapeText(input.bottom) + ARROW,
    "co_rgb:FFFFFF", "b_rgb:FF6A1A", "r_max", "w_640", "c_fit",
    "g_south", "y_100",
  ];

  return {
    url: build([base, title, product, c1, c2, c3, saveBadge, cta], BLANK_BASE),
    layoutSignature: `infographic|premium|s=${stepLabels.join("/")}`,
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
  "Discover why",
  "See the setup",
  "Explore the trend",
  "Shop the viral find",
  "See it in action",
  "Shop the upgrade",
];

/** CTR badges — natural rotation. */
export const CTR_BADGES: string[] = [
  "Save for later",
  "Trending with cat parents",
  "Cat owners love this",
  "Viral cat-parent find",
  "Must-have setup",
];

export function pickSoftCta(seed: number): string {
  return SOFT_CTAS[Math.abs(seed) % SOFT_CTAS.length];
}

export function pickCtrBadge(seed: number): string | null {
  // Skip ~30% of pins so badges feel handcrafted, not stamped on every one.
  if (Math.abs(seed) % 10 < 3) return null;
  return CTR_BADGES[Math.abs(seed) % CTR_BADGES.length];
}
