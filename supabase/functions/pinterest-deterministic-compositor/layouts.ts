// Deterministic 1200x1800 photo-lock-safe layouts.
// Pure geometry. No AI. No provider imports. No network I/O.

export const CANVAS = { w: 1200, h: 1800 } as const;
export const SAFE = { top: 80, bottom: 80, left: 80, right: 80 } as const;

// Minimum vertical breathing room between any two text/CTA blocks.
// Mobile-readability requirement: no block may sit within MIN_GAP of another.
export const MIN_GAP = 48;

// Line-height multiplier used by Cloudinary's l_text rendering for our
// chosen fonts. Empirically ~1.15 for Georgia Bold and Arial.
export const LINE_HEIGHT = 1.18;

// Absolute mobile-readable floors. fitText must not go below these.
export const MOBILE_MIN = {
  headline: 56,
  benefit: 34,
  cta: 36,
  chip: 22,
} as const;

// Warm palette (locked; text layers only — never applied to product).
export const BG = {
  cream: "F5EDE0",
  oat: "EDE1CE",
  beige: "E4D6BC",
} as const;

export const INK = {
  headline: "1F1B16",   // near-black warm
  benefit: "3B3226",
  ctaText: "FFFFFF",
  ctaFill: "0F0D0B",     // deep charcoal, near-black warm undertone
  ctaShadow: "000000",   // shadow beneath pill
} as const;

// CTA button system (v6). Reusable geometry constants applied at URL-build
// time so every layout renders the same premium push-button.
export const CTA_BUTTON = {
  radius: 28,          // corner radius on the pill
  minHeight: 104,      // minimum pill height at 1200x1800
  hPad: 48,            // horizontal padding around text
  vPadMin: 22,         // vertical padding around text (min)
  minWidth: 420,       // pill minimum width
  maxWidthFrac: 0.72,  // pill maximum width as fraction of canvas width
  shadowOffsetY: 8,    // shadow drop distance below pill
  shadowOpacity: 28,   // 0-100 (Cloudinary o_ token uses percentage)
  shadowGrow: 6,       // shadow rect is grown by this many px on all sides
  opticalLiftPct: 0.06, // shift text up by this fraction of font size for optical centering
} as const;

// Feature-chip strip (v7). Horizontal 3-up row that occupies the same
// reservation as `benefitBox` when chips are provided. Chips and benefit are
// mutually exclusive per compose call — the plan() picks chips when present.
export const CHIP_STRIP = {
  count: 3,             // fixed number of chips
  gap: 20,              // horizontal gap between chips
  height: 60,           // pill height
  hPad: 20,             // horizontal padding inside a chip
  radius: 22,           // corner radius
  fontMax: 32,          // starting font size (per-chip shrink to fit)
  fontMin: 22,          // absolute floor
  maxChars: 22,         // hard cap per chip label
  shadowOffsetY: 4,
  shadowOpacity: 22,
  shadowGrow: 4,
  opticalLiftPct: 0.06,
} as const;

export interface Box { x: number; y: number; w: number; h: number }

export interface LayoutSpec {
  key: LayoutVariant;
  bg: keyof typeof BG;
  /** Product layer inner-fit box (w,h). c_fit only. */
  productFit: { w: number; h: number };
  /** Final placement inside 1200x1800 (top-left origin). */
  productBox: Box;
  headlineBox: Box;
  headlineMaxSize: number;
  headlineMinSize: number;
  headlineMaxLines: 1 | 2;
  benefitBox: Box;
  benefitMaxSize: number;
  benefitMinSize: number;
  benefitMaxLines: 1 | 2;
  ctaBox: Box;
  ctaSize: number;
  /** Product occupancy fraction of canvas = productBox.w * h / (CANVAS.w * h). */
  targetOccupancy: [number, number]; // min, max
}

export type LayoutVariant =
  | "editorial_hero"
  | "feature_spotlight"
  | "compact_space"
  | "tall_product_scale"
  | "product_plus_benefit"
  | "seasonal_editorial";

// Layouts. All coordinates fall inside CANVAS \ SAFE.
export const LAYOUTS: Record<LayoutVariant, LayoutSpec> = {
  // Product upper-center, big block of text below.
  editorial_hero: {
    key: "editorial_hero",
    bg: "cream",
    productFit: { w: 960, h: 960 },
    productBox: { x: 120, y: 120, w: 960, h: 960 },
    headlineBox: { x: 100, y: 1120, w: 1000, h: 240 },
    headlineMaxSize: 88,
    headlineMinSize: 56,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 1410, w: 1000, h: 140 },
    benefitMaxSize: 46,
    benefitMinSize: 34,
    benefitMaxLines: 2,
    // ctaBox is now a *reservation* area. The actual pill is centered inside
    // this box at URL-build time and may be narrower for short labels.
    ctaBox: { x: 240, y: 1600, w: 720, h: 110 },
    ctaSize: 40,
    targetOccupancy: [0.35, 0.55],
  },
  // Product slightly smaller, dedicated headline zone above.
  feature_spotlight: {
    key: "feature_spotlight",
    bg: "oat",
    productFit: { w: 860, h: 860 },
    productBox: { x: 170, y: 480, w: 860, h: 860 },
    headlineBox: { x: 100, y: 140, w: 1000, h: 240 },
    headlineMaxSize: 92,
    headlineMinSize: 58,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 1420, w: 1000, h: 130 },
    benefitMaxSize: 44,
    benefitMinSize: 34,
    benefitMaxLines: 2,
    ctaBox: { x: 240, y: 1600, w: 720, h: 110 },
    ctaSize: 40,
    targetOccupancy: [0.30, 0.50],
  },
  // Compact — product mid-canvas, tight margins, minimalist copy.
  compact_space: {
    key: "compact_space",
    bg: "beige",
    productFit: { w: 900, h: 900 },
    productBox: { x: 150, y: 340, w: 900, h: 900 },
    headlineBox: { x: 100, y: 100, w: 1000, h: 200 },
    headlineMaxSize: 84,
    headlineMinSize: 56,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 1300, w: 1000, h: 130 },
    benefitMaxSize: 44,
    benefitMinSize: 34,
    benefitMaxLines: 2,
    ctaBox: { x: 240, y: 1490, w: 720, h: 110 },
    ctaSize: 40,
    targetOccupancy: [0.30, 0.50],
  },
  // Tall product — vertical bias, headline and benefit both above.
  tall_product_scale: {
    key: "tall_product_scale",
    bg: "cream",
    productFit: { w: 780, h: 980 },
    productBox: { x: 210, y: 500, w: 780, h: 980 },
    headlineBox: { x: 100, y: 120, w: 1000, h: 200 },
    headlineMaxSize: 88,
    headlineMinSize: 56,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 370, w: 1000, h: 125 },
    benefitMaxSize: 44,
    benefitMinSize: 34,
    benefitMaxLines: 2,
    ctaBox: { x: 240, y: 1600, w: 720, h: 110 },
    ctaSize: 40,
    targetOccupancy: [0.30, 0.50],
  },
  // Product-left visual, benefit right-hand column emphasis.
  product_plus_benefit: {
    key: "product_plus_benefit",
    bg: "oat",
    productFit: { w: 880, h: 880 },
    productBox: { x: 160, y: 320, w: 880, h: 880 },
    headlineBox: { x: 100, y: 100, w: 1000, h: 180 },
    headlineMaxSize: 80,
    headlineMinSize: 56,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 1260, w: 1000, h: 200 },
    benefitMaxSize: 48,
    benefitMinSize: 34,
    benefitMaxLines: 2,
    ctaBox: { x: 240, y: 1580, w: 720, h: 110 },
    ctaSize: 40,
    targetOccupancy: [0.30, 0.50],
  },
  // Seasonal editorial — softer palette, product bottom-centered.
  seasonal_editorial: {
    key: "seasonal_editorial",
    bg: "beige",
    productFit: { w: 840, h: 840 },
    productBox: { x: 180, y: 560, w: 840, h: 840 },
    headlineBox: { x: 100, y: 140, w: 1000, h: 200 },
    headlineMaxSize: 88,
    headlineMinSize: 58,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 390, w: 1000, h: 130 },
    benefitMaxSize: 44,
    benefitMinSize: 34,
    benefitMaxLines: 2,
    ctaBox: { x: 240, y: 1600, w: 720, h: 110 },
    ctaSize: 40,
    targetOccupancy: [0.25, 0.45],
  },
};

export function overlaps(a: Box, b: Box): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x ||
           a.y + a.h <= b.y || b.y + b.h <= a.y);
}

export function withinSafe(box: Box): boolean {
  return box.x >= SAFE.left && box.y >= SAFE.top &&
    box.x + box.w <= CANVAS.w - SAFE.right &&
    box.y + box.h <= CANVAS.h - SAFE.bottom;
}

export function occupancy(box: Box): number {
  return (box.w * box.h) / (CANVAS.w * CANVAS.h);
}

// Vertical distance between two non-overlapping stacked boxes (0 if they touch
// or overlap on the y-axis, positive otherwise). Used by the layout auditor
// to enforce MIN_GAP between text/CTA blocks.
export function verticalGap(a: Box, b: Box): number {
  const top = a.y < b.y ? a : b;
  const bot = a.y < b.y ? b : a;
  return bot.y - (top.y + top.h);
}