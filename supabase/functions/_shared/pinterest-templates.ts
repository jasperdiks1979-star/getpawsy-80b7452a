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

import {
  autoFitHeadline,
  CANVAS,
  SAFE_AREA,
  validatePreset,
  LAYOUT_PRESETS,
  type LayoutKey,
  type LayoutValidation,
} from "./pinterest-layout.ts";

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
  /** Layout preset that was rendered (used for non-consecutive rotation). */
  layoutKey: LayoutKey;
  /** Pre-publish layout validation — empty issues = safe to ship. */
  validation: LayoutValidation;
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

// ── Polish primitives ──────────────────────────────────────────────────────
// Soft drop shadow plate placed behind a product to ground it in the scene.
// Renders as a slightly larger, blurred, low-opacity dark ellipse offset
// downward — gives the product realistic contact shadow + ambient lift
// instead of looking pasted onto the backdrop.
function shadowPlate(opts: {
  width: number;
  height: number;
  gravity: string;
  x?: number;
  y?: number;
  opacity?: number;
}): string[] {
  return [
    "l_text:Arial_120_bold:%20",
    "b_rgb:1A1410", "co_rgb:00000000",
    "w_" + opts.width, "h_" + opts.height, "c_fit",
    "g_" + opts.gravity,
    ...(opts.x != null ? ["x_" + opts.x] : []),
    ...(opts.y != null ? ["y_" + opts.y] : []),
    "r_max", "e_blur:2000",
    "o_" + (opts.opacity ?? 32),
  ];
}

// Underline accent for editorial CTAs — a thin white bar drawn beneath
// a CTA text. Premium, never a hard pill.
function underlineAccent(opts: {
  width: number;
  gravity: string;
  x?: number;
  y?: number;
  color?: string;
  opacity?: number;
}): string[] {
  return [
    "l_text:Arial_120_bold:%20",
    "b_rgb:" + (opts.color ?? "FFFFFF"), "co_rgb:00000000",
    "w_" + opts.width, "h_3", "c_fit",
    "g_" + opts.gravity,
    ...(opts.x != null ? ["x_" + opts.x] : []),
    ...(opts.y != null ? ["y_" + opts.y] : []),
    "o_" + (opts.opacity ?? 75),
  ];
}

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
    "e_brightness:-8", "e_saturation:-2", "e_contrast:6",
    "q_auto", "f_jpg",
  ];
  // Subtle bottom gradient — much softer than a black bar, just enough to
  // anchor editorial typography in the lower-third whitespace.
  const bottomScrim = scrimBand({ gravity: "south", height: 900, y: 0, opacity: 38 });
  // Top is left fully open — no scrim — so the photo breathes.

  // Soft contact shadow grounds the product in the scene.
  const productShadow = shadowPlate({
    width: 500, height: 90, gravity: "south_east", x: 90, y: 130, opacity: 38,
  });
  // Product floating bottom-right — soft white card with a hairline border.
  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_440", "h_440", "c_fit", "g_south_east", "x_80", "y_200", "r_32",
    "bo_2px_solid_rgb:FFFFFF",
  ];

  // Headline — wrapped serif, max 3 lines. Auto-fit so it never overflows
  // the 640-wide safe zone on the left half regardless of input length.
  const preset = LAYOUT_PRESETS.left_text_right_product;
  const fitted = autoFitHeadline(input.top, {
    widthPx: 640,
    maxLines: 3,
    sizes: [88, 78, 70, 62, 54],
  });
  const headline = [
    "l_text:Georgia_" + fitted.fontSize + "_bold:" + escapeWrapped(fitted.wrapped),
    "co_rgb:FFFFFF", "w_640", "c_fit", "g_south_west", "x_80", "y_420",
  ];

  // Editorial underline CTA — small caps, white text + arrow, thin underline.
  // No pill, no orange block — feels like organic Pinterest typography.
  const cta = [
    "l_text:Arial_36:" + escapeText(input.bottom) + ARROW,
    "co_rgb:FFFFFF", "g_south_west", "x_92", "y_320",
  ];
  const ctaUnderline = underlineAccent({
    width: 280, gravity: "south_west", x: 92, y: 300, opacity: 70,
  });

  const ctrBadge = input.ctrBadge
    ? [
        "l_text:Arial_34_bold:" + escapeText(input.ctrBadge),
        "co_rgb:FFFFFF", "g_north_west", "x_72", "y_120", "o_85",
      ]
    : null;

  const brand = [
    "l_text:Georgia_30:" + escapeText("getpawsy.pet"),
    "co_rgb:FFFFFF", "g_north_east", "x_72", "y_120", "o_75",
  ];

  const layers: string[][] = [base, bottomScrim, productShadow, product, headline, ctaUnderline, cta, brand];
  if (ctrBadge) layers.push(ctrBadge);
  return {
    url: build(layers, backdrop),
    layoutSignature: `problem|polish|badge${ctrBadge ? 1 : 0}`,
    layoutKey: preset.key,
    validation: validatePreset(preset, fitted),
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
    "e_saturation:-35", "e_brightness:-6", "e_contrast:4",
    "q_auto", "f_jpg",
  ];

  // AFTER backdrop covers the lower 60% with a warmer, vibrant look.
  const afterCover = [
    "l_fetch:" + fetchB64(afterBg),
    "w_" + W, "h_1180", "c_fill", "g_south", "y_0",
    "e_brightness:6", "e_saturation:18", "e_contrast:6",
  ];

  // Hairline divider — feels like a magazine fold, not a banner.
  const fold = [
    "l_text:Arial_120_bold:%20",
    "b_rgb:FAF6F0", "co_rgb:00000000",
    "w_" + W, "h_2", "c_fit",
    "g_center", "y_-20", "o_90",
  ];

  const productShadow = shadowPlate({
    width: 760, height: 110, gravity: "south", y: 220, opacity: 36,
  });
  // Product hero composited into the AFTER half.
  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_700", "h_700", "c_fit", "g_south", "y_280", "r_32",
    "bo_2px_solid_rgb:FFFFFF",
  ];

  // Editorial labels — small caps, no pill, just elegant tags with underline.
  const beforeLabel = [
    "l_text:Arial_34:" + escapeText("BEFORE"),
    "co_rgb:FFFFFF", "g_north_west", "x_84", "y_160", "o_85",
  ];
  const afterLabel = [
    "l_text:Arial_34:" + escapeText("AFTER"),
    "co_rgb:1A1410", "g_south_west", "x_84", "y_960", "o_90",
  ];

  // Headline sits inside a small center band so it doesn't cover either scene.
  const preset = LAYOUT_PRESETS.split_screen;
  const fitted = autoFitHeadline(input.top, {
    widthPx: 880,
    maxLines: 2,
    sizes: [82, 72, 64, 56, 48],
  });
  // Soft narrow gradient scrim — much lighter than before, just enough
  // contrast for the headline without dominating the composition.
  const headlineScrim = scrimBand({ gravity: "center", height: 280, y: 0, opacity: 42 });
  const headline = [
    "l_text:Georgia_" + fitted.fontSize + "_bold:" + escapeWrapped(fitted.wrapped),
    "co_rgb:FFFFFF", "w_920", "c_fit", "g_center", "y_0",
  ];

  // Editorial underline CTA — sits on the AFTER half whitespace.
  const cta = [
    "l_text:Arial_38:" + escapeText(input.bottom) + ARROW,
    "co_rgb:1A1410", "g_south", "y_140",
  ];
  const ctaUnderline = underlineAccent({
    width: 220, gravity: "south", y: 120, color: "1A1410", opacity: 80,
  });

  return {
    url: build([base, afterCover, fold, productShadow, product, beforeLabel, afterLabel, headlineScrim, headline, ctaUnderline, cta], beforeBg),
    layoutSignature: "before_after|polish_split",
    layoutKey: preset.key,
    validation: validatePreset(preset, fitted),
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
    "g_north_east", "x_-200", "y_-200", "o_10",
  ];

  // Editorial headline (serif, wrapped, anchored top-left).
  const preset = LAYOUT_PRESETS.editorial_magazine;
  const fitted = autoFitHeadline(input.top, {
    widthPx: 920,
    maxLines: 3,
    sizes: [96, 84, 72, 64, 56],
  });
  const headline = [
    "l_text:Georgia_" + fitted.fontSize + "_bold:" + escapeWrapped(fitted.wrapped),
    "co_rgb:1A1410", "w_920", "c_fit", "g_north_west", "x_80", "y_140",
  ];

  // Soft contact shadow grounds the product in the cream canvas.
  const productShadow = shadowPlate({
    width: 720, height: 130, gravity: "center", y: 460, opacity: 28,
  });
  // Subtle cream plate — softer than pure white so it blends with bg.
  const plate = [
    "l_text:Arial_400_bold:%20",
    "b_rgb:FFFFFF", "co_rgb:00000000",
    "w_860", "h_900", "c_fit",
    "g_center", "y_60", "o_55", "r_48",
  ];

  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_780", "h_860", "c_fit", "g_center", "y_60", "r_24",
  ];

  // Three stat chips inline at the bottom of the plate.
  const stats: [string, string, string] = [
    pick(["No scoop", "Self-clean", "App-control"], input.seed),
    pick(["Odor-free", "Quiet motor", "Quick setup"], input.seed + 1),
    pick(["Save hours", "Cat-loved", "Built to last"], input.seed + 2),
  ];
  // Editorial chips — thin hairline outline, no orange fill.
  const chip = (label: string, x: number) => [
    "l_text:Arial_28:" + escapeText(label),
    "co_rgb:1A1410", "b_rgb:FFFFFF", "bo_1px_solid_rgb:1A1410",
    "r_max", "w_280", "c_fit",
    "g_south", "x_" + x, "y_300",
  ];
  const c1 = chip(stats[0], -340);
  const c2 = chip(stats[1], 0);
  const c3 = chip(stats[2], 340);

  // Editorial CTA — quiet ink type with a thin underline. No pill.
  const cta = [
    "l_text:Georgia_44:" + escapeText(input.bottom) + ARROW,
    "co_rgb:1A1410", "g_south", "y_150",
  ];
  const ctaUnderline = underlineAccent({
    width: 320, gravity: "south", y: 130, color: "1A1410", opacity: 80,
  });

  return {
    url: build([base, accentCorner, productShadow, plate, product, headline, c1, c2, c3, ctaUnderline, cta], BLANK_BASE),
    layoutSignature: `benefit|polish|s=${stats.join("/")}`,
    layoutKey: preset.key,
    validation: validatePreset(preset, fitted),
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
    "e_brightness:-2", "e_saturation:10", "e_contrast:4",
    "q_auto", "f_jpg",
  ];
  // Soft, generous gradient fades — barely-there, just enough to lift text.
  const topScrim = scrimBand({ gravity: "north", height: 720, y: 0, opacity: 32 });
  const bottomScrim = scrimBand({ gravity: "south", height: 380, y: 0, opacity: 30 });

  // Soft contact shadow grounds the product card.
  const productShadow = shadowPlate({
    width: 600, height: 110, gravity: "south_east", x: 80, y: 200, opacity: 38,
  });
  // Product hero — soft white card bottom-right.
  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_540", "h_680", "c_fit", "g_south_east", "x_80", "y_260", "r_28",
    "bo_2px_solid_rgb:FFFFFF",
  ];

  // Editorial wrapped headline — auto-fit so longer hooks shrink instead of
  // overflowing into the product card.
  const preset = LAYOUT_PRESETS.right_text_left_product;
  const fitted = autoFitHeadline(input.top, {
    widthPx: 840,
    maxLines: 3,
    sizes: [96, 84, 74, 66, 58],
  });
  const headline = [
    "l_text:Georgia_" + fitted.fontSize + "_bold:" + escapeWrapped(fitted.wrapped),
    "co_rgb:FFFFFF", "w_840", "c_fit",
    "g_north_west", "x_92", "y_220",
  ];

  // Editorial CTA — thin white type + arrow + hairline underline.
  const cta = [
    "l_text:Arial_38:" + escapeText(input.bottom) + ARROW,
    "co_rgb:FFFFFF", "g_south_west", "x_92", "y_160",
  ];
  const ctaUnderline = underlineAccent({
    width: 240, gravity: "south_west", x: 92, y: 140, opacity: 75,
  });
  const brand = [
    "l_text:Georgia_30:" + escapeText("getpawsy.pet"),
    "co_rgb:FFFFFF", "g_south_east", "x_92", "y_150", "o_75",
  ];

  return {
    url: build([base, topScrim, bottomScrim, productShadow, product, headline, ctaUnderline, cta, brand], backdrop),
    layoutSignature: "lifestyle|polish",
    layoutKey: preset.key,
    validation: validatePreset(preset, fitted),
  };
}

/**
 * VIRAL — TikTok energy with breathing room.
 * Charcoal canvas, slightly rotated orange splash, screaming wrapped headline,
 * product mid with neon outline, premium curiosity CTA bottom.
 */
function tplViral(input: TemplateInput): TemplateOutput {
  const base = darkCanvas();

  // Subtle warm glow — barely visible, just adds atmosphere top-of-frame.
  const angle = -2 - (Math.abs(input.seed) % 3);
  const splash = [
    "l_text:Arial_400_bold:%20",
    "b_rgb:FF6A1A", "co_rgb:00000000",
    "w_1200", "h_500", "c_fit",
    "g_north", "y_60", "a_" + angle, "o_22",
    "e_gradient_fade:80",
  ];

  const preset = LAYOUT_PRESETS.center_focus;
  const fitted = autoFitHeadline(input.top, {
    widthPx: 980,
    maxLines: 3,
    sizes: [120, 104, 92, 80, 70, 60],
    avgCharWidth: 0.52,
  });
  const headline = [
    "l_text:Georgia_" + fitted.fontSize + "_bold:" + escapeWrapped(fitted.wrapped),
    "co_rgb:FFFFFF", "w_980", "c_fit",
    "g_north", "y_220",
  ];

  // Soft contact shadow grounds the product within the dark canvas.
  const productShadow = shadowPlate({
    width: 760, height: 130, gravity: "center", y: 460, opacity: 50,
  });
  // Product card with subtle warm glow plate for depth.
  const productPlate = [
    "l_text:Arial_400_bold:%20",
    "b_rgb:FAF6F0", "co_rgb:00000000",
    "w_840", "h_840", "c_fit",
    "g_center", "y_60", "r_48", "o_92",
  ];
  const product = [
    "l_fetch:" + fetchB64(input.productImageUrl),
    "w_780", "h_780", "c_fit", "g_center", "y_60", "r_24",
  ];

  // Editorial CTA — quiet white type + arrow + hairline underline.
  const cta = [
    "l_text:Georgia_42:" + escapeText(input.bottom) + ARROW,
    "co_rgb:FFFFFF", "g_south", "y_180",
  ];
  const ctaUnderline = underlineAccent({
    width: 280, gravity: "south", y: 160, opacity: 75,
  });

  // Tiny CTR badge below CTA for save-prompts.
  const ctrBadge = input.ctrBadge
    ? [
        "l_text:Arial_30_bold:" + escapeText(input.ctrBadge),
        "co_rgb:FFFFFF", "g_south", "y_100", "o_70",
      ]
    : null;

  const layers: string[][] = [base, splash, headline, productShadow, productPlate, product, ctaUnderline, cta];
  if (ctrBadge) layers.push(ctrBadge);
  return {
    url: build(layers, BLANK_BASE),
    layoutSignature: `viral|polish|a${angle}`,
    layoutKey: preset.key,
    validation: validatePreset(preset, fitted),
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
  const preset = LAYOUT_PRESETS.bottom_cta_strip;
  const fitted = autoFitHeadline(input.top, {
    widthPx: 920,
    maxLines: 2,
    sizes: [88, 76, 68, 60, 54],
  });
  const title = [
    "l_text:Georgia_" + fitted.fontSize + "_bold:" + escapeWrapped(fitted.wrapped),
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
    layoutKey: preset.key,
    validation: validatePreset(preset, fitted),
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
