// Deterministic creative-quality scoring for the Pinterest premium pivot.
// Pure functions — no AI calls. Used by autopublish, viral-batch, and cleanup-audit.

/** Hamming distance over equal-length hex strings. */
export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    d += (x.toString(2).match(/1/g) ?? []).length;
  }
  return d;
}

/** Shannon entropy over hex nibbles, normalised to 0-100. */
export function computeEntropyScore(phashHex: string | null | undefined): number {
  if (!phashHex || phashHex.length < 8) return 0;
  const counts = new Array(16).fill(0);
  for (const c of phashHex) {
    const n = parseInt(c, 16);
    if (!Number.isNaN(n)) counts[n]++;
  }
  const total = phashHex.length;
  let h = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / total;
    h += -p * Math.log2(p);
  }
  // Max entropy for 16 symbols = 4 bits → normalise to 0..100
  return Math.round((h / 4) * 100);
}

/** 0..100 — higher = more visually unique vs the recent corpus. */
export function scoreVisualUniqueness(phash: string | null | undefined, recent: string[]): number {
  if (!phash) return 0;
  if (!recent.length) return 100;
  let minDist = 64;
  for (const r of recent) {
    const d = hammingHex(phash, r);
    if (d < minDist) minDist = d;
  }
  return Math.round((minDist / 64) * 100);
}

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** 0..100 — higher = less overlap with recent hooks. */
export function scoreHookUniqueness(hook: string | null | undefined, recent: string[]): number {
  if (!hook) return 0;
  if (!recent.length) return 100;
  const a = tokenize(hook);
  let maxSim = 0;
  for (const r of recent) {
    const s = jaccard(a, tokenize(r));
    if (s > maxSim) maxSim = s;
  }
  return Math.round((1 - maxSim) * 100);
}

/** Banned aggressive-CTA patterns. */
const AGGRESSIVE_CTA_PATTERNS: RegExp[] = [
  /\b(buy|shop|order)\s+now\b/i,
  /\bclick\s+(here|now)\b/i,
  /\b(limited\s+time|act\s+fast|hurry)\b/i,
  /🔥\s*sale|sale\s*🔥/i,
  /[!]{2,}/,
  /\b(don'?t\s+miss|last\s+chance)\b/i,
  /[➡→👉]+/,
];

export function detectAggressiveCta(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  // ALL CAPS run of 4+ words
  const caps = t.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,}){3,}/);
  if (caps) return "all_caps_shouting";
  for (const p of AGGRESSIVE_CTA_PATTERNS) {
    if (p.test(t)) return `aggressive_cta:${p.source.slice(0, 24)}`;
  }
  return null;
}

/** Catalog white-bg / orange-title-bar heuristics from a sampled image.
 *  Caller fetches and decodes the image once and provides pixel summaries. */
export interface ImageCornerSummary {
  /** average luminance (0-255) of the four corner 16x16 patches */
  cornerLuminance: number;
  /** fraction of pixels in the top 18% band that are saturated orange (#ff5a1f ± 30 hue) */
  topOrangeFraction: number;
}

export function detectWhiteBackground(s: ImageCornerSummary): boolean {
  return s.cornerLuminance >= 240;
}
export function detectOrangeTitleBar(s: ImageCornerSummary): boolean {
  return s.topOrangeFraction >= 0.35;
}

export const ALLOWED_CREATIVE_CATEGORIES = [
  "cat_parent_struggles",
  "odor_free_home",
  "clean_lifestyle",
  "cozy_pet_living",
  "emotional_relief",
  "funny_cat_moments",
  "before_after",
  "aesthetic_home",
  "ugc_vertical",
] as const;
export type CreativeCategory = (typeof ALLOWED_CREATIVE_CATEGORIES)[number];

/** Composite quality score used by cleanup audit (0..100). */
export function compositeCleanupScore(input: {
  visualUniqueness: number; // 0..100
  engagementRate: number;   // 0..1 (e.g. 0.012 = 1.2%)
  daysSincePublish: number; // newer = better, capped at 90
  styleQuality: number;     // 0..100 (deterministic style flags)
}): number {
  const eng = Math.min(100, input.engagementRate * 1000); // 1% engagement → 10 pts → scaled below
  const recency = Math.max(0, 100 - Math.min(90, input.daysSincePublish));
  const score =
    input.visualUniqueness * 0.35 +
    eng * 0.35 +
    recency * 0.10 +
    input.styleQuality * 0.20;
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Heuristic recommendation. */
export function recommendAction(opts: {
  composite: number;
  slugRepeat: number;
  engagementRate: number;
  isSlideshow: boolean;
  daysSincePublish: number;
}): "KEEP" | "ARCHIVE" | "DELETE" {
  // Hard floors — never delete
  if (opts.engagementRate >= 0.015) return "KEEP";       // ≥1.5% engagement
  if (opts.daysSincePublish < 7) return "KEEP";           // cold-start protection
  if (opts.composite < 35) return "DELETE";
  if (opts.slugRepeat >= 4 && opts.engagementRate < 0.003) return "DELETE";
  if (opts.composite < 60 || opts.isSlideshow) return "ARCHIVE";
  return "KEEP";
}