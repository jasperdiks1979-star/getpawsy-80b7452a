// ─────────────────────────────────────────────────────────────────────────────
// Pinterest premium layout engine
//
// Provides:
//   • SAFE_AREA — strict mobile-safe zones for 1080×1920 canvases.
//   • autoFitHeadline — responsive font sizing + word-aware wrap that prevents
//     overflow, orphan words, and unreadable shrink.
//   • Zone geometry helpers + validateLayout for collision detection between
//     headline / product / CTA / badge / brand bounding boxes.
//   • LAYOUT_PRESETS — 8 distinct zone arrangements (left-text, right-text,
//     bottom-CTA, floating glass, minimal luxury, center focus, split-screen,
//     editorial magazine) used as templates for per-style rendering.
//   • pickLayoutNonConsecutive — deterministic preset rotation that never
//     repeats the previous pin's layout in a batch.
//
// All zones are expressed in canvas pixels (origin top-left). Templates pass
// these zones into Cloudinary `g_*` + `x_/y_` offsets via the helpers below.
// ─────────────────────────────────────────────────────────────────────────────

export const CANVAS = { w: 1080, h: 1920 } as const;

/** Strict Pinterest mobile-safe zones — nothing renders outside these. */
export const SAFE_AREA = {
  top: 120,
  bottom: 140,
  left: 80,
  right: 80,
} as const;

export const SAFE_BOX = {
  x: SAFE_AREA.left,
  y: SAFE_AREA.top,
  w: CANVAS.w - SAFE_AREA.left - SAFE_AREA.right,   // 920
  h: CANVAS.h - SAFE_AREA.top - SAFE_AREA.bottom,   // 1660
} as const;

export interface Box { x: number; y: number; w: number; h: number; role?: string }

export interface FittedHeadline {
  /** Wrapped text using "%0A" line breaks (Cloudinary newline marker). */
  wrapped: string;
  /** Final per-line length cap. */
  charsPerLine: number;
  /** Final font size in px — auto-shrunk to fit width budget. */
  fontSize: number;
  /** Number of lines after wrapping. */
  lines: number;
  /** Approximate rendered height in px (fontSize * lineHeight * lines). */
  height: number;
}

/**
 * Word-aware responsive headline fitter.
 *
 * Picks the largest font size from `sizes` (descending) such that the headline
 * wraps inside `widthPx` with no more than `maxLines` lines and no orphan
 * single-word last line when avoidable. Returns the final wrapped string.
 */
export function autoFitHeadline(
  text: string,
  opts: {
    widthPx: number;
    maxLines?: number;
    sizes?: number[];
    /** Approx px per character at 1px font — Georgia/Arial bold ≈ 0.55. */
    avgCharWidth?: number;
    /** Line-height multiplier. */
    lineHeight?: number;
    /** Hard floor — never shrink below this even if it would still overflow. */
    minFontSize?: number;
  },
): FittedHeadline {
  const raw = (text || "").trim().replace(/\s+/g, " ");
  const widthPx = Math.max(120, opts.widthPx);
  const maxLines = opts.maxLines ?? 3;
  const sizes = opts.sizes ?? [104, 92, 84, 76, 68, 60, 54, 48];
  const avgCharW = opts.avgCharWidth ?? 0.55;
  const lh = opts.lineHeight ?? 1.12;
  const minFs = opts.minFontSize ?? 44;

  const words = raw.split(" ").filter(Boolean);
  if (words.length === 0) {
    return { wrapped: "", charsPerLine: 0, fontSize: sizes[sizes.length - 1] || minFs, lines: 0, height: 0 };
  }

  for (const fs of sizes) {
    if (fs < minFs) break;
    const charsPerLine = Math.max(6, Math.floor(widthPx / (fs * avgCharW)));
    const lines: string[] = [];
    let cur = "";
    let overflow = false;
    for (const w of words) {
      // A single word longer than the budget — only acceptable at the smaller
      // sizes. Skip this size to keep typography readable.
      if (w.length > charsPerLine) { overflow = true; break; }
      if (!cur) { cur = w; continue; }
      if ((cur + " " + w).length <= charsPerLine) cur += " " + w;
      else { lines.push(cur); cur = w; }
      if (lines.length >= maxLines) { overflow = true; break; }
    }
    if (overflow) continue;
    if (cur) lines.push(cur);
    if (lines.length > maxLines) continue;
    // Orphan-word guard: if last line is a single short word and we have room
    // to rebalance by shrinking, prefer a smaller size that wraps cleaner.
    if (lines.length >= 2 && lines[lines.length - 1].split(" ").length === 1
        && lines[lines.length - 1].length <= 4 && fs > minFs + 8) {
      continue;
    }
    return {
      wrapped: lines.join("%0A"),
      charsPerLine,
      fontSize: fs,
      lines: lines.length,
      height: Math.round(fs * lh * lines.length),
    };
  }

  // Last resort: hard truncate at min font size.
  const fs = minFs;
  const charsPerLine = Math.max(6, Math.floor(widthPx / (fs * avgCharW)));
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + " " + w).length <= charsPerLine) cur += " " + w;
    else {
      lines.push(cur); cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return {
    wrapped: lines.slice(0, maxLines).join("%0A"),
    charsPerLine,
    fontSize: fs,
    lines: Math.min(lines.length, maxLines),
    height: Math.round(fs * lh * Math.min(lines.length, maxLines)),
  };
}

// ── Collision + safe-area validation ──────────────────────────────────────

function intersects(a: Box, b: Box): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function insideSafe(b: Box): boolean {
  return b.x >= SAFE_AREA.left
    && b.y >= SAFE_AREA.top
    && b.x + b.w <= CANVAS.w - SAFE_AREA.right
    && b.y + b.h <= CANVAS.h - SAFE_AREA.bottom;
}

export interface LayoutValidation {
  ok: boolean;
  /** Human-readable issues — surfaced into QA logs. */
  issues: string[];
  /** Pairs that overlap, e.g. ["headline", "product"]. */
  collisions: Array<[string, string]>;
  /** Roles that exceed the safe area. */
  unsafe: string[];
}

/**
 * Validate that a set of named zones fit the safe area and don't collide.
 * Pairs that may legitimately overlap (e.g. product image inside its own
 * plate) can be passed via `allowOverlap`.
 */
export function validateLayout(
  zones: Box[],
  allowOverlap: Array<[string, string]> = [],
): LayoutValidation {
  const issues: string[] = [];
  const collisions: Array<[string, string]> = [];
  const unsafe: string[] = [];

  const allow = new Set(allowOverlap.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

  for (const z of zones) {
    if (!insideSafe(z)) {
      unsafe.push(z.role || "?");
      issues.push(`${z.role || "zone"} exceeds safe area`);
    }
  }
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i]; const b = zones[j];
      const ra = a.role || `z${i}`; const rb = b.role || `z${j}`;
      if (allow.has(`${ra}|${rb}`)) continue;
      if (intersects(a, b)) {
        collisions.push([ra, rb]);
        issues.push(`collision: ${ra} ↔ ${rb}`);
      }
    }
  }
  return { ok: issues.length === 0, issues, collisions, unsafe };
}

// ── Layout presets ────────────────────────────────────────────────────────

export type LayoutKey =
  | "left_text_right_product"
  | "right_text_left_product"
  | "bottom_cta_strip"
  | "floating_glass_card"
  | "minimal_luxury"
  | "center_focus"
  | "split_screen"
  | "editorial_magazine";

export interface LayoutPreset {
  key: LayoutKey;
  /** Suggested headline width budget in px (≤ 55% canvas where possible). */
  headlineWidth: number;
  /** Approximate zones for collision validation. */
  zones: { headline: Box; product: Box; cta: Box; badge?: Box; brand?: Box };
}

/** All eight presets are sized to live entirely inside the SAFE_BOX. */
export const LAYOUT_PRESETS: Record<LayoutKey, LayoutPreset> = {
  left_text_right_product: {
    key: "left_text_right_product",
    headlineWidth: 520,
    zones: {
      headline: { role: "headline", x: 80, y: 200, w: 520, h: 360 },
      product:  { role: "product",  x: 600, y: 600, w: 400, h: 720 },
      cta:      { role: "cta",      x: 80,  y: 1620, w: 540, h: 120 },
      brand:    { role: "brand",    x: 760, y: 1660, w: 240, h: 60 },
    },
  },
  right_text_left_product: {
    key: "right_text_left_product",
    headlineWidth: 520,
    zones: {
      headline: { role: "headline", x: 480, y: 200, w: 520, h: 360 },
      product:  { role: "product",  x: 80,  y: 600, w: 400, h: 720 },
      cta:      { role: "cta",      x: 460, y: 1620, w: 540, h: 120 },
      brand:    { role: "brand",    x: 80,  y: 1660, w: 240, h: 60 },
    },
  },
  bottom_cta_strip: {
    key: "bottom_cta_strip",
    headlineWidth: 920,
    zones: {
      headline: { role: "headline", x: 80, y: 180, w: 920, h: 320 },
      product:  { role: "product",  x: 160, y: 540, w: 760, h: 880 },
      cta:      { role: "cta",      x: 220, y: 1600, w: 640, h: 140 },
    },
  },
  floating_glass_card: {
    key: "floating_glass_card",
    headlineWidth: 800,
    zones: {
      headline: { role: "headline", x: 140, y: 1100, w: 800, h: 280 },
      product:  { role: "product",  x: 240, y: 200,  w: 600, h: 760 },
      cta:      { role: "cta",      x: 220, y: 1600, w: 640, h: 130 },
      badge:    { role: "badge",    x: 80,  y: 140,  w: 280, h: 70 },
    },
  },
  minimal_luxury: {
    key: "minimal_luxury",
    headlineWidth: 600,
    zones: {
      headline: { role: "headline", x: 240, y: 220, w: 600, h: 240 },
      product:  { role: "product",  x: 240, y: 540, w: 600, h: 880 },
      cta:      { role: "cta",      x: 280, y: 1600, w: 520, h: 130 },
    },
  },
  center_focus: {
    key: "center_focus",
    headlineWidth: 880,
    zones: {
      headline: { role: "headline", x: 100, y: 200, w: 880, h: 240 },
      product:  { role: "product",  x: 180, y: 520, w: 720, h: 880 },
      cta:      { role: "cta",      x: 240, y: 1600, w: 600, h: 140 },
      badge:    { role: "badge",    x: 720, y: 140, w: 280, h: 70 },
    },
  },
  split_screen: {
    key: "split_screen",
    headlineWidth: 880,
    // Headline lives in a thin center band; product anchors lower half.
    zones: {
      headline: { role: "headline", x: 100, y: 820, w: 880, h: 280 },
      product:  { role: "product",  x: 180, y: 1140, w: 720, h: 280 },
      cta:      { role: "cta",      x: 240, y: 1600, w: 600, h: 130 },
    },
  },
  editorial_magazine: {
    key: "editorial_magazine",
    headlineWidth: 600,
    zones: {
      headline: { role: "headline", x: 80, y: 180, w: 600, h: 360 },
      product:  { role: "product",  x: 80, y: 600, w: 920, h: 880 },
      cta:      { role: "cta",      x: 80, y: 1620, w: 540, h: 120 },
      brand:    { role: "brand",    x: 760, y: 1660, w: 240, h: 60 },
    },
  },
};

export const LAYOUT_KEYS: LayoutKey[] = Object.keys(LAYOUT_PRESETS) as LayoutKey[];

/**
 * Deterministic non-consecutive layout picker.
 * Given a seed and the previous layout key, returns a different one.
 */
export function pickLayoutNonConsecutive(seed: number, previous?: LayoutKey | null): LayoutKey {
  const idx = Math.abs(seed) % LAYOUT_KEYS.length;
  let chosen = LAYOUT_KEYS[idx];
  if (previous && chosen === previous) {
    chosen = LAYOUT_KEYS[(idx + 1) % LAYOUT_KEYS.length];
  }
  return chosen;
}

/**
 * Convenience: validate a preset's zones (after the headline has been
 * auto-fit and we know the headline's actual rendered height). Returns the
 * validation report so the caller can fall back to `minimal_luxury` if the
 * collision is unrecoverable.
 */
export function validatePreset(
  preset: LayoutPreset,
  fitted: FittedHeadline,
): LayoutValidation {
  const headline = { ...preset.zones.headline, h: Math.max(fitted.height, 80) };
  const zones: Box[] = [headline, preset.zones.product, preset.zones.cta];
  if (preset.zones.badge) zones.push(preset.zones.badge);
  if (preset.zones.brand) zones.push(preset.zones.brand);
  return validateLayout(zones, [
    // Brand mark may sit visually adjacent to CTA without collision concern.
    ["brand", "cta"],
    // Badge may sit near headline on certain layouts.
    ["badge", "headline"],
  ]);
}
