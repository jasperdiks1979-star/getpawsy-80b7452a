// Pure deterministic compositor logic.
//
// STATIC INVARIANT: this file MUST NOT import from any AI provider, image
// generation module, or Pinterest API client. The compositor.test.ts file
// asserts the absence of banned identifiers at test time.
//
// Cloudinary transformations are built ONLY from an allowlisted, typed set
// of parameters. No user-supplied string is ever spliced directly into the
// transformation URL.

import {
  BG,
  CANVAS,
  INK,
  LAYOUTS,
  LINE_HEIGHT,
  MIN_GAP,
  MOBILE_MIN,
  CTA_BUTTON,
  type LayoutSpec,
  type LayoutVariant,
  overlaps,
  withinSafe,
  occupancy,
  verticalGap,
  type Box,
} from "./layouts.ts";

export const CLOUDINARY_CLOUD = "dlkqycfzn";
const BASE_CANVAS_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/deterministic%2Fsystem%2Fbase-canvas-1x1.png";

// ─── Text validation ─────────────────────────────────────────────────────

const APPROVED_CTAS = new Set([
  "View Product",
  "Shop Now",
  "See Details",
  "Learn More",
  "Save This",
  "Explore Product",
  "Discover More",
]);

const BANNED_CLAIMS = [
  /\b(cure|cures|heal|heals|treat|treats)\b/i,
  /\bfda\b/i,
  /\bvet[-\s]?approved\b/i,
  /\bguarantee(d|s)?\b/i,
  /\b\d{1,2}%\s*off\b/i,
  /\bfree\s+shipping\b/i,
  /\b(4|5)\.?\d?\s*stars?\b/i,
  /\bbest[-\s]?seller\b/i,
];

export interface TextValidation {
  ok: boolean;
  reason?: string;
}

export function validateHeadline(text: string): TextValidation {
  const t = (text || "").trim();
  if (!t) return { ok: false, reason: "empty_headline" };
  if (t.length > 80) return { ok: false, reason: "headline_too_long" };
  const words = t.split(/\s+/);
  if (words.length > 6) return { ok: false, reason: "headline_over_6_words" };
  for (const rx of BANNED_CLAIMS) {
    if (rx.test(t)) return { ok: false, reason: `banned_claim:${rx.source}` };
  }
  return { ok: true };
}

export function validateBenefit(text: string): TextValidation {
  const t = (text || "").trim();
  if (!t) return { ok: false, reason: "empty_benefit" };
  if (t.length > 120) return { ok: false, reason: "benefit_too_long" };
  const words = t.split(/\s+/);
  if (words.length > 9) return { ok: false, reason: "benefit_over_9_words" };
  for (const rx of BANNED_CLAIMS) {
    if (rx.test(t)) return { ok: false, reason: `banned_claim:${rx.source}` };
  }
  return { ok: true };
}

export function validateCta(text: string): TextValidation {
  const t = (text || "").trim();
  if (!APPROVED_CTAS.has(t)) return { ok: false, reason: "cta_not_approved" };
  return { ok: true };
}

// ─── Text fit (word-aware wrap + font shrink to fit width & lines) ───────

// Average glyph width per pixel of font size for our chosen fonts. Bold/serif
// like Georgia Bold ≈ 0.58; sans regular Arial ≈ 0.50; Arial Bold ≈ 0.55.
const CHAR_W: Record<string, number> = {
  georgia_bold: 0.58,
  arial: 0.50,
  arial_bold: 0.55,
};

// ─── CTA button geometry (v6) ────────────────────────────────────────────
//
// Computes the effective pill geometry inside a layout's ctaBox reservation.
// The pill is horizontally centered inside the reservation and its width is
// derived from the rendered text width plus symmetric padding, clamped to
// [minWidth, min(reservation.w, canvas * maxWidthFrac)].
//
// The pill font size is shrunk (in steps of 2) until the label fits within
// the max width at the required padding. Never falls below MOBILE_MIN.cta.

export interface CtaPill {
  box: Box;         // effective pill rectangle
  fontSize: number; // final rendered CTA text size
  textWidth: number;
  textY: number;    // optically-centered text y (top-left origin)
}

export function computeCtaPill(layout: LayoutSpec, text: string): CtaPill {
  const reservation = layout.ctaBox;
  const hardMaxW = Math.min(
    reservation.w,
    Math.floor(CANVAS.w * CTA_BUTTON.maxWidthFrac),
  );
  let size = layout.ctaSize;
  const minSize = MOBILE_MIN.cta;
  let textW = 0;
  let pillW = 0;
  // Shrink font size until pill fits inside hardMaxW at required padding.
  while (size >= minSize) {
    textW = Math.ceil(text.length * size * CHAR_W.arial_bold);
    pillW = Math.max(CTA_BUTTON.minWidth, textW + CTA_BUTTON.hPad * 2);
    if (pillW <= hardMaxW) break;
    size -= 2;
  }
  // If even minSize still overflows, clamp pillW to hardMaxW (label may
  // visually crowd, but audit will flag it).
  if (pillW > hardMaxW) pillW = hardMaxW;

  const pillH = Math.max(CTA_BUTTON.minHeight, reservation.h);
  const pillX = reservation.x + Math.floor((reservation.w - pillW) / 2);
  const pillY = reservation.y;
  const textY = pillY
    + Math.round((pillH - size) / 2)
    - Math.round(size * CTA_BUTTON.opticalLiftPct);
  return {
    box: { x: pillX, y: pillY, w: pillW, h: pillH },
    fontSize: size,
    textWidth: textW,
    textY,
  };
}

export interface TextFit {
  ok: boolean;
  lines: string[];
  fontSize: number;
  reason?: string;
}

export function fitText(
  text: string,
  font: keyof typeof CHAR_W,
  widthPx: number,
  heightPx: number,
  maxLines: 1 | 2,
  maxSize: number,
  minSize: number,
): TextFit {
  const words = text.trim().split(/\s+/);
  const cw = CHAR_W[font];
  for (let size = maxSize; size >= minSize; size -= 2) {
    const perLine = Math.floor(widthPx / (size * cw));
    if (perLine < 4) continue;
    // Height check: rendered lines must vertically fit in the target box.
    const maxRenderedLines = Math.max(1, Math.floor(heightPx / (size * LINE_HEIGHT)));
    const effectiveMax = Math.min(maxLines, maxRenderedLines);
    if (effectiveMax < 1) continue;
    const lines: string[] = [];
    let cur = "";
    let ok = true;
    for (const w of words) {
      if (w.length > perLine) { ok = false; break; }
      const next = cur ? cur + " " + w : w;
      if (next.length <= perLine) cur = next;
      else { lines.push(cur); cur = w; if (lines.length >= effectiveMax) { ok = false; break; } }
    }
    if (!ok) continue;
    if (cur) lines.push(cur);
    if (lines.length <= effectiveMax) return { ok: true, lines, fontSize: size };
  }
  return { ok: false, lines: [], fontSize: minSize, reason: "text_overflow" };
}

// ─── Cloudinary URL builder (allowlisted parameters only) ────────────────

// Cloudinary l_text uses `%20` for spaces in the encoded text? No: it needs
// a URL-safe base64 wrapper: `l_text:<font>:<b64_text>` when using
// `text_style` parameter names; but the classical form is
// `l_text:<font_family>_<size>_<style>:<encoded_text>` where <encoded_text>
// is the text URL-encoded (spaces → %20). Special chars like ',', '/', ':'
// must be percent-encoded twice because Cloudinary interprets them.
// We use the safer explicit percent-encoding of every non-alnum char.
function cloudinaryTextEscape(s: string): string {
  // Percent-encode everything that is not [A-Za-z0-9]. Space encodes to %2520
  // (double-encoded) because Cloudinary URL-decodes the path segment once
  // before consuming the layer text.
  const single = Array.from(s).map((ch) => {
    if (/[A-Za-z0-9]/.test(ch)) return ch;
    const bytes = new TextEncoder().encode(ch);
    return Array.from(bytes).map((b) => "%" + b.toString(16).toUpperCase().padStart(2, "0")).join("");
  }).join("");
  // Second-pass encode of percent so Cloudinary sees the original after
  // one decode.
  return single.replace(/%/g, "%25");
}

// Base64url encode for l_fetch source URL.
export function b64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Small integer validator — refuses NaN/Infinity/negatives/out-of-range.
function n(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v) || !Number.isInteger(v) || v < lo || v > hi) {
    throw new Error(`param_out_of_range:${v}`);
  }
  return v;
}

// Hex color allowlist check.
function hex(v: string): string {
  if (!/^[0-9A-Fa-f]{6}$/.test(v)) throw new Error("bad_color");
  return v.toUpperCase();
}

// Font allowlist.
const FONT_MAP: Record<string, string> = {
  georgia_bold: "Georgia_%%SIZE%%_bold",
  arial: "Arial_%%SIZE%%",
  arial_bold: "Arial_%%SIZE%%_bold",
};

export interface BuildUrlInput {
  sourceUrl: string;
  layout: LayoutSpec;
  headlineLines: string[];
  headlineSize: number;
  benefitLines: string[];
  benefitSize: number;
  ctaText: string;
  ctaSize: number;
  ctaPill?: CtaPill;
}

export function buildCloudinaryUrl(inp: BuildUrlInput): string {
  // Only https sources allowed (Pinterest requirement + prevents ssrf-y schemes).
  if (!/^https:\/\//.test(inp.sourceUrl)) throw new Error("source_not_https");

  const L = inp.layout;
  const bgHex = hex(BG[L.bg]);
  const inkH = hex(INK.headline);
  const inkB = hex(INK.benefit);
  const ctaFill = hex(INK.ctaFill);
  const ctaText = hex(INK.ctaText);

  // --- Base canvas: start from a neutral 1x1 asset, then pad to 1200x1800.
  // This avoids Cloudinary centering the product as the primary fetched image.
  const baseCanvas = [
    "w_" + n(CANVAS.w, 1, 4000),
    "h_" + n(CANVAS.h, 1, 4000),
    "c_pad",
    "b_rgb:" + bgHex,
    "f_png",
  ].join(",");

  // --- Product layer: geometry-preserving fit inside layout.productFit box,
  // applied as an explicitly positioned overlay. c_fit ONLY. Never c_fill.
  const productLayer = [
    "l_fetch:" + b64UrlEncode(inp.sourceUrl),
    "w_" + n(L.productFit.w, 100, 2000),
    "h_" + n(L.productFit.h, 100, 2000),
    "c_fit",
    "f_png",
  ].join(",") + "/" + [
    "fl_layer_apply",
    "g_north_west",
    "x_" + n(L.productBox.x + Math.floor((L.productBox.w - L.productFit.w) / 2), -2000, 4000),
    "y_" + n(L.productBox.y + Math.floor((L.productBox.h - L.productFit.h) / 2), -2000, 4000),
  ].join(",");

  // --- Headline text layer.
  const headlineFont = FONT_MAP.georgia_bold.replace("%%SIZE%%", String(n(inp.headlineSize, 20, 200)));
  const headline = [
    "l_text:" + headlineFont + ":" + cloudinaryTextEscape(inp.headlineLines.join("\n")),
    "co_rgb:" + inkH,
    "w_" + n(L.headlineBox.w, 50, CANVAS.w),
    "c_fit",
  ].join(",") + "/" + [
    "fl_layer_apply",
    "g_north_west",
    "x_" + n(L.headlineBox.x, 0, CANVAS.w),
    "y_" + n(L.headlineBox.y, 0, CANVAS.h),
  ].join(",");

  const benefitFont = FONT_MAP.arial.replace("%%SIZE%%", String(n(inp.benefitSize, 20, 120)));
  const benefit = [
    "l_text:" + benefitFont + ":" + cloudinaryTextEscape(inp.benefitLines.join("\n")),
    "co_rgb:" + inkB,
    "w_" + n(L.benefitBox.w, 50, CANVAS.w),
    "c_fit",
  ].join(",") + "/" + [
    "fl_layer_apply",
    "g_north_west",
    "x_" + n(L.benefitBox.x, 0, CANVAS.w),
    "y_" + n(L.benefitBox.y, 0, CANVAS.h),
  ].join(",");

  // ── CTA button v6: shadow → rounded pill → text (optically centered) ──
  const pill = inp.ctaPill ?? computeCtaPill(L, inp.ctaText);
  const ctaFont = FONT_MAP.arial_bold.replace("%%SIZE%%", String(n(pill.fontSize, 20, 100)));
  const shadowGrow = CTA_BUTTON.shadowGrow;
  const shadowRadius = CTA_BUTTON.radius + Math.floor(shadowGrow / 2);

  // Shadow layer: slightly larger, offset down, low opacity.
  const ctaShadow = [
    "l_text:" + FONT_MAP.arial.replace("%%SIZE%%", "10") + ":%2520",
    "b_rgb:" + hex(INK.ctaShadow),
    "co_rgb:" + hex(INK.ctaShadow),
    "w_" + n(pill.box.w + shadowGrow * 2, 50, CANVAS.w),
    "h_" + n(pill.box.h + shadowGrow, 20, CANVAS.h),
    "c_pad",
    "r_" + n(shadowRadius, 0, 200),
    "o_" + n(CTA_BUTTON.shadowOpacity, 1, 100),
  ].join(",") + "/" + [
    "fl_layer_apply",
    "g_north_west",
    "x_" + n(pill.box.x - shadowGrow, 0, CANVAS.w),
    "y_" + n(pill.box.y + CTA_BUTTON.shadowOffsetY, 0, CANVAS.h),
  ].join(",");

  // Main pill: solid near-black, rounded corners.
  const ctaBg = [
    "l_text:" + FONT_MAP.arial.replace("%%SIZE%%", "10") + ":%2520",
    "b_rgb:" + ctaFill,
    "co_rgb:" + ctaFill,
    "w_" + n(pill.box.w, 50, CANVAS.w),
    "h_" + n(pill.box.h, 20, CANVAS.h),
    "c_pad",
    "r_" + n(CTA_BUTTON.radius, 0, 200),
  ].join(",") + "/" + [
    "fl_layer_apply",
    "g_north_west",
    "x_" + n(pill.box.x, 0, CANVAS.w),
    "y_" + n(pill.box.y, 0, CANVAS.h),
  ].join(",");

  // Label — optically centered.
  // Text layer width is the pill width minus horizontal padding; we then
  // shift the layer's x by half of the leftover slack so the rendered text
  // is horizontally centered inside the pill (Cloudinary's l_text with
  // c_fit renders left-aligned within the given width).
  const labelLayerW = pill.box.w - CTA_BUTTON.hPad;
  const labelX = pill.box.x + Math.round((pill.box.w - labelLayerW) / 2);
  const ctaLayer = [
    "l_text:" + ctaFont + ":" + cloudinaryTextEscape(inp.ctaText),
    "co_rgb:" + ctaText,
    "w_" + n(labelLayerW, 50, CANVAS.w),
    "c_fit",
    "co_rgb:" + ctaText,
    "g_center",
  ].join(",") + "/" + [
    "fl_layer_apply",
    "g_north_west",
    "x_" + n(labelX, 0, CANVAS.w),
    "y_" + n(pill.textY, 0, CANVAS.h),
  ].join(",");

  const segs = [baseCanvas, productLayer, headline, benefit, ctaShadow, ctaBg, ctaLayer, "f_png"].join("/");
  // Cloudinary /image/fetch/ terminates with a neutral base canvas. The product
  // source is an explicit l_fetch overlay so all geometry is auditable.
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${segs}/${BASE_CANVAS_URL}`;
}

// ─── Transformation allowlist self-audit ─────────────────────────────────
//
// Called AFTER buildCloudinaryUrl(). Ensures the URL contains no banned
// transformation tokens that would alter product pixels.

// Product-layer bans: these tokens must never appear inside a product image
// segment (l_fetch:...). They MAY appear inside CTA / text overlay segments
// (rounded pill uses r_, drop shadow uses o_, etc.), which is why the
// auditor scopes the check to product segments only.
const BANNED_TRANSFORMS = [
  /(^|[/,])e_[a-z_]+/,     // any effect (blur, sharpen, art, colorize, etc.)
  /(^|[/,])o_\d+/,          // opacity manipulation on product layer
  /(^|[/,])c_fill(\b|,)/,   // fill crops
  /(^|[/,])c_crop(\b|,)/,
  /(^|[/,])c_thumb(\b|,)/,
  /(^|[/,])c_scale(\b|,)/,  // non-fit scale
  /(^|[/,])c_lfill(\b|,)/,
  /(^|[/,])a_[-0-9]+/,      // rotation
  /(^|[/,])r_\d+/,           // radius on product
];

export function auditUrl(url: string): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  // Segment-scoped audit: bans apply only to product image overlays
  // (segments containing l_fetch:). Text/CTA overlays (l_text:) may legally
  // use r_ (rounded pill) and o_ (shadow opacity).
  const segments = url.split("/");
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg.includes("l_fetch:")) continue;
    // Product param segment; the next segment is its fl_layer_apply (safe to skip).
    for (const rx of BANNED_TRANSFORMS) {
      if (rx.test(seg)) violations.push(rx.source);
    }
  }
  return { ok: violations.length === 0, violations };
}

// ─── Layout audit ────────────────────────────────────────────────────────

export function auditLayout(L: LayoutSpec): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  // Product may extend to canvas edges (text-safe margins do not apply to it),
  // but must stay inside the canvas.
  const P = L.productBox;
  if (P.x < 0 || P.y < 0 || P.x + P.w > CANVAS.w || P.y + P.h > CANVAS.h) {
    issues.push("product_outside_canvas");
  }
  // Text/CTA must respect safe margins.
  const textBoxes: [string, Box][] = [
    ["headline", L.headlineBox], ["benefit", L.benefitBox], ["cta", L.ctaBox],
  ];
  for (const [name, b] of textBoxes) {
    if (!withinSafe(b)) issues.push(`${name}_outside_safe`);
    if (overlaps(b, P)) issues.push(`${name}_overlaps_product`);
  }
  // Text/text and text/CTA collision — NO block may overlap another block.
  for (let i = 0; i < textBoxes.length; i++) {
    for (let j = i + 1; j < textBoxes.length; j++) {
      const [na, a] = textBoxes[i]; const [nb, b] = textBoxes[j];
      if (overlaps(a, b)) issues.push(`${na}_overlaps_${nb}`);
      const g = verticalGap(a, b);
      if (g >= 0 && g < MIN_GAP) issues.push(`${na}_${nb}_gap_${g}<${MIN_GAP}`);
    }
  }
  // Mobile-readability floors — min font sizes must be at or above thresholds.
  if (L.headlineMinSize < MOBILE_MIN.headline) issues.push(`headline_min_${L.headlineMinSize}<${MOBILE_MIN.headline}`);
  if (L.benefitMinSize < MOBILE_MIN.benefit) issues.push(`benefit_min_${L.benefitMinSize}<${MOBILE_MIN.benefit}`);
  if (L.ctaSize < MOBILE_MIN.cta) issues.push(`cta_size_${L.ctaSize}<${MOBILE_MIN.cta}`);
  // CTA reservation must be tall enough for the v6 pill (with padding).
  if (L.ctaBox.h < CTA_BUTTON.minHeight) {
    issues.push(`cta_box_h_${L.ctaBox.h}<${CTA_BUTTON.minHeight}`);
  }
  // Reservation must be wide enough for the widest approved CTA at min size.
  const widestPill = Math.ceil(
    "Explore Product".length * MOBILE_MIN.cta * CHAR_W.arial_bold,
  ) + CTA_BUTTON.hPad * 2;
  if (L.ctaBox.w < Math.min(widestPill, Math.floor(CANVAS.w * CTA_BUTTON.maxWidthFrac))) {
    issues.push(`cta_box_w_${L.ctaBox.w}<${widestPill}`);
  }
  // Headline box must fit 2 lines at min size (otherwise long headlines truncate).
  const needH = Math.ceil(L.headlineMinSize * LINE_HEIGHT * L.headlineMaxLines);
  if (L.headlineBox.h < needH) issues.push(`headline_box_h_${L.headlineBox.h}<${needH}`);
  const needB = Math.ceil(L.benefitMinSize * LINE_HEIGHT * L.benefitMaxLines);
  if (L.benefitBox.h < needB) issues.push(`benefit_box_h_${L.benefitBox.h}<${needB}`);
  const occ = occupancy(L.productBox);
  if (occ < L.targetOccupancy[0] || occ > L.targetOccupancy[1]) {
    issues.push(`product_occupancy_${occ.toFixed(3)}_outside_${L.targetOccupancy.join("-")}`);
  }
  return { ok: issues.length === 0, issues };
}

// ─── Hashing ─────────────────────────────────────────────────────────────

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── PNG dimension parse (bytes 16..24 big-endian) ───────────────────────

export function parsePngDimensions(bytes: Uint8Array): { w: number; h: number } {
  if (bytes.length < 24) throw new Error("png_too_short");
  // Signature
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error("not_png");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

// ─── Deterministic storage key ───────────────────────────────────────────

export function storageKey(runId: string, productId: string, layout: LayoutVariant, sourceHash: string): string {
  const rid = /^[0-9a-f-]{36}$/i.test(runId) ? runId : "invalid";
  const pid = /^[0-9a-f-]{36}$/i.test(productId) ? productId : "invalid";
  const prefix = sourceHash.slice(0, 12);
  return `deterministic/${rid}/${pid}/${layout}-${prefix}.png`;
}

// ─── Full composition entry point (pure — no I/O) ────────────────────────

export interface ComposeRequest {
  runId: string;
  productId: string;
  sourceUrl: string;
  expectedSourceHash: string;
  actualSourceHash: string;
  headline: string;
  benefit: string;
  cta: string;
  layout: LayoutVariant;
}

export interface ComposePlan {
  ok: boolean;
  reason?: string;
  cloudinaryUrl?: string;
  storagePath?: string;
  layoutAudit?: ReturnType<typeof auditLayout>;
  urlAudit?: ReturnType<typeof auditUrl>;
  textFits?: { headline: TextFit; benefit: TextFit };
  integrity?: {
    source_hash: string;
    source_url: string;
    layout: LayoutVariant;
    product_box: Box;
    product_fit: { w: number; h: number };
    occupancy: number;
    text_boxes: { headline: Box; benefit: Box; cta: Box };
    overlap_ok: boolean;
    provider_calls: 0;
    paid_image_calls: 0;
    paid_vision_calls: 0;
    credits_spent: 0;
  };
}

export function plan(req: ComposeRequest): ComposePlan {
  if (req.expectedSourceHash && req.actualSourceHash !== req.expectedSourceHash) {
    return { ok: false, reason: "source_hash_mismatch" };
  }
  const L = LAYOUTS[req.layout];
  if (!L) return { ok: false, reason: "unknown_layout" };

  const layoutAudit = auditLayout(L);
  if (!layoutAudit.ok) return { ok: false, reason: "layout_audit_failed", layoutAudit };

  const vh = validateHeadline(req.headline);
  if (!vh.ok) return { ok: false, reason: `headline:${vh.reason}` };
  const vb = validateBenefit(req.benefit);
  if (!vb.ok) return { ok: false, reason: `benefit:${vb.reason}` };
  const vc = validateCta(req.cta);
  if (!vc.ok) return { ok: false, reason: `cta:${vc.reason}` };

  const hf = fitText(req.headline, "georgia_bold", L.headlineBox.w, L.headlineBox.h, L.headlineMaxLines, L.headlineMaxSize, L.headlineMinSize);
  if (!hf.ok) return { ok: false, reason: "headline_text_overflow" };
  const bf = fitText(req.benefit, "arial", L.benefitBox.w, L.benefitBox.h, L.benefitMaxLines, L.benefitMaxSize, L.benefitMinSize);
  if (!bf.ok) return { ok: false, reason: "benefit_text_overflow" };

  const pill = computeCtaPill(L, req.cta);

  let cloudinaryUrl: string;
  try {
    cloudinaryUrl = buildCloudinaryUrl({
    sourceUrl: req.sourceUrl,
    layout: L,
    headlineLines: hf.lines,
    headlineSize: hf.fontSize,
    benefitLines: bf.lines,
    benefitSize: bf.fontSize,
    ctaText: req.cta,
    ctaSize: pill.fontSize,
    ctaPill: pill,
  });
  } catch (e) {
    return { ok: false, reason: `build_url_failed:${String((e as Error).message)}` };
  }

  const urlAudit = auditUrl(cloudinaryUrl);
  if (!urlAudit.ok) return { ok: false, reason: "url_audit_failed", urlAudit };

  const storagePath = storageKey(req.runId, req.productId, req.layout, req.actualSourceHash);

  return {
    ok: true,
    cloudinaryUrl,
    storagePath,
    layoutAudit,
    urlAudit,
    textFits: { headline: hf, benefit: bf },
    integrity: {
      source_hash: req.actualSourceHash,
      source_url: req.sourceUrl,
      layout: req.layout,
      product_box: L.productBox,
      product_fit: L.productFit,
      occupancy: occupancy(L.productBox),
      text_boxes: { headline: L.headlineBox, benefit: L.benefitBox, cta: L.ctaBox },
      overlap_ok: !overlaps(L.headlineBox, L.productBox) &&
                  !overlaps(L.benefitBox, L.productBox) &&
                  !overlaps(L.ctaBox, L.productBox),
      provider_calls: 0,
      paid_image_calls: 0,
      paid_vision_calls: 0,
      credits_spent: 0,
    },
  };
}