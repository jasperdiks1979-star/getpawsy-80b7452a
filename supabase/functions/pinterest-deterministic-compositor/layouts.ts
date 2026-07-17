// Deterministic 1200x1800 photo-lock-safe layouts.
// Pure geometry. No AI. No provider imports. No network I/O.

export const CANVAS = { w: 1200, h: 1800 } as const;
export const SAFE = { top: 80, bottom: 80, left: 80, right: 80 } as const;

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
  ctaFill: "1F1B16",
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
    productFit: { w: 1080, h: 1080 },
    productBox: { x: 60, y: 160, w: 1080, h: 1080 },
    headlineBox: { x: 100, y: 1280, w: 1000, h: 180 },
    headlineMaxSize: 96,
    headlineMinSize: 60,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 1480, w: 1000, h: 120 },
    benefitMaxSize: 52,
    benefitMinSize: 36,
    benefitMaxLines: 2,
    ctaBox: { x: 420, y: 1620, w: 360, h: 100 },
    ctaSize: 40,
    targetOccupancy: [0.45, 0.65],
  },
  // Product slightly smaller, dedicated headline zone above.
  feature_spotlight: {
    key: "feature_spotlight",
    bg: "oat",
    productFit: { w: 960, h: 960 },
    productBox: { x: 120, y: 500, w: 960, h: 960 },
    headlineBox: { x: 100, y: 140, w: 1000, h: 260 },
    headlineMaxSize: 104,
    headlineMinSize: 64,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 1500, w: 1000, h: 110 },
    benefitMaxSize: 48,
    benefitMinSize: 34,
    benefitMaxLines: 2,
    ctaBox: { x: 420, y: 1640, w: 360, h: 100 },
    ctaSize: 40,
    targetOccupancy: [0.40, 0.65],
  },
  // Compact — product mid-canvas, tight margins, minimalist copy.
  compact_space: {
    key: "compact_space",
    bg: "beige",
    productFit: { w: 1020, h: 1020 },
    productBox: { x: 90, y: 300, w: 1020, h: 1020 },
    headlineBox: { x: 100, y: 100, w: 1000, h: 180 },
    headlineMaxSize: 88,
    headlineMinSize: 56,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 1360, w: 1000, h: 110 },
    benefitMaxSize: 46,
    benefitMinSize: 32,
    benefitMaxLines: 2,
    ctaBox: { x: 420, y: 1500, w: 360, h: 100 },
    ctaSize: 40,
    targetOccupancy: [0.40, 0.62],
  },
  // Tall product — vertical bias, headline and benefit both above.
  tall_product_scale: {
    key: "tall_product_scale",
    bg: "cream",
    productFit: { w: 900, h: 1200 },
    productBox: { x: 150, y: 520, w: 900, h: 1200 },
    headlineBox: { x: 100, y: 120, w: 1000, h: 200 },
    headlineMaxSize: 92,
    headlineMinSize: 58,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 340, w: 1000, h: 120 },
    benefitMaxSize: 46,
    benefitMinSize: 32,
    benefitMaxLines: 2,
    ctaBox: { x: 420, y: 1660, w: 360, h: 100 },
    ctaSize: 40,
    targetOccupancy: [0.45, 0.75],
  },
  // Product-left visual, benefit right-hand column emphasis.
  product_plus_benefit: {
    key: "product_plus_benefit",
    bg: "oat",
    productFit: { w: 1000, h: 1000 },
    productBox: { x: 100, y: 280, w: 1000, h: 1000 },
    headlineBox: { x: 100, y: 100, w: 1000, h: 160 },
    headlineMaxSize: 84,
    headlineMinSize: 54,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 1320, w: 1000, h: 200 },
    benefitMaxSize: 56,
    benefitMinSize: 38,
    benefitMaxLines: 2,
    ctaBox: { x: 420, y: 1560, w: 360, h: 100 },
    ctaSize: 40,
    targetOccupancy: [0.40, 0.62],
  },
  // Seasonal editorial — softer palette, product bottom-centered.
  seasonal_editorial: {
    key: "seasonal_editorial",
    bg: "beige",
    productFit: { w: 980, h: 980 },
    productBox: { x: 110, y: 560, w: 980, h: 980 },
    headlineBox: { x: 100, y: 140, w: 1000, h: 220 },
    headlineMaxSize: 100,
    headlineMinSize: 60,
    headlineMaxLines: 2,
    benefitBox: { x: 100, y: 380, w: 1000, h: 140 },
    benefitMaxSize: 50,
    benefitMinSize: 36,
    benefitMaxLines: 2,
    ctaBox: { x: 420, y: 1620, w: 360, h: 100 },
    ctaSize: 40,
    targetOccupancy: [0.40, 0.62],
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