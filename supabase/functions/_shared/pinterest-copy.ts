// ─────────────────────────────────────────────────────────────────────────────
// US-Only Pinterest copy + scoring helpers (Phase 1)
//
// Goal: shift Pinterest distribution toward United States users by enforcing
// US English, US buyer-intent keywords, and a per-pin "US audience score"
// the cron worker uses as an auto-publish threshold.
//
// This module is sync, dep-free, and safe to import from any edge function.
// ─────────────────────────────────────────────────────────────────────────────

/** Phrases that read as international / low-intent — we strip or rewrite them. */
const INTL_BANNED = [
  /\bcolour\b/gi,
  /\bfavourite\b/gi,
  /\bbehaviour\b/gi,
  /\borganis(e|ed|ing|ation)\b/gi,
  /\bworldwide\s+shipping\b/gi,
  /\bship\s+globally\b/gi,
  /\binternational\s+(buyers|shipping)\b/gi,
  /\beuro(s|pean)?\b/gi,
  /\bGBP\b/g,
  /\bAUD\b/g,
];
const INTL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcolour\b/gi, "color"],
  [/\bfavourite\b/gi, "favorite"],
  [/\bbehaviour\b/gi, "behavior"],
  [/\borganise\b/gi, "organize"],
  [/\borganised\b/gi, "organized"],
  [/\borganising\b/gi, "organizing"],
  [/\borganisation\b/gi, "organization"],
  [/\bworldwide\s+shipping\b/gi, "Free US Shipping"],
  [/\bship\s+globally\b/gi, "ships across the USA"],
  [/\binternational\s+(buyers|shipping)\b/gi, "US shipping"],
];

/** US buyer-intent keyword pools — at least one should appear per pin. */
export const US_INTENT_KEYWORDS = [
  "apartment cats",
  "indoor cats",
  "pet parents",
  "small apartments",
  "modern American homes",
  "NYC apartment",
  "California home",
  "Texas pet lifestyle",
  "US pet lifestyle",
];

const US_TRUST_TAGLINE = "Free US Shipping · Ships from New York, NY · 3–7 business days";

/** Convert any user-supplied string to US English + strip intl phrases. */
export function toUSEnglish(input: string): string {
  if (!input) return input;
  let out = input;
  for (const [re, rep] of INTL_REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

/** Detect leftover international wording (after toUSEnglish). */
export function hasInternationalWording(input: string): boolean {
  if (!input) return false;
  const cleaned = toUSEnglish(input);
  return INTL_BANNED.some((re) => re.test(cleaned));
}

/** Returns true if any US intent keyword appears in the corpus. */
export function hasUSIntentKeyword(corpus: string): boolean {
  if (!corpus) return false;
  const c = corpus.toLowerCase();
  return US_INTENT_KEYWORDS.some((k) => c.includes(k.toLowerCase()));
}

/** Append the US trust tagline to a description if not already present. */
export function withUSTrustTagline(description: string): string {
  const desc = toUSEnglish(description || "");
  if (/free us shipping/i.test(desc)) return desc;
  const sep = desc.endsWith(".") || desc.endsWith("!") ? " " : ". ";
  return `${desc}${sep}${US_TRUST_TAGLINE}.`;
}

// ─── US AUDIENCE SCORE ───────────────────────────────────────────────────────

export interface UsScoreInput {
  product_slug?: string | null;
  product_name?: string | null;
  pin_title?: string | null;
  pin_description?: string | null;
  category_key?: string | null;
  content_type?: string | null;
}

/**
 * Returns 0..1 — heuristic US-audience fit score.
 * The cron worker filters pins below `us_score_threshold` (default 0.55).
 */
export function computeUsAudienceScore(input: UsScoreInput): number {
  let score = 0.4; // baseline
  const corpus = `${input.pin_title || ""} ${input.pin_description || ""} ${input.product_name || ""}`.toLowerCase();
  const slug = (input.product_slug || "").toLowerCase();
  const cat = (input.category_key || "").toLowerCase();
  const ct = (input.content_type || "product").toLowerCase();

  // +0.20 if a US intent keyword appears
  if (hasUSIntentKeyword(corpus)) score += 0.2;

  // +0.10 for US trust tagline / shipping language
  if (/free us shipping|ships from .*?(NY|new york|usa)/i.test(corpus)) score += 0.1;

  // +0.10 for high-intent content types (guide / comparison / lifestyle outperform raw product pins)
  if (ct === "guide" || ct === "comparison" || ct === "lifestyle") score += 0.1;

  // Category weighting — cat trees + cat care = primary US niche per memory
  if (/cat[-_\s]?tree|cat-care|cat_care|cat_essentials/.test(cat)) score += 0.15;
  if (/litter|cat-tree|cat tree|condo|scratching/i.test(slug)) score += 0.05;

  // Penalize international phrasing
  if (hasInternationalWording(corpus)) score -= 0.25;

  // Clamp 0..1
  if (score < 0) score = 0;
  if (score > 1) score = 1;
  return Math.round(score * 1000) / 1000;
}

/** Convenience for callers that need both rewritten copy AND score in one go. */
export function buildUSPinCopy<T extends UsScoreInput & { pin_title?: string | null; pin_description?: string | null }>(
  input: T,
): T & { pin_title: string; pin_description: string; us_audience_score: number } {
  const pin_title = toUSEnglish(input.pin_title || "");
  const pin_description = withUSTrustTagline(input.pin_description || "");
  const us_audience_score = computeUsAudienceScore({ ...input, pin_title, pin_description });
  return { ...(input as object), pin_title, pin_description, us_audience_score } as T & {
    pin_title: string;
    pin_description: string;
    us_audience_score: number;
  };
}
