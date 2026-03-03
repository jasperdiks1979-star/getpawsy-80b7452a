/**
 * Google Merchant Compliance Sanitizer
 * 
 * Strips ALL promotional, marketing, shipping, trust, and exaggerated claims
 * from product titles and descriptions before export to Google Shopping.
 * 
 * Reference: Google Shopping "Misrepresentation" + "Additional Text" policies.
 */

// ── Banned phrase patterns (case-insensitive) ──────────────────────
const BANNED_PHRASES: RegExp[] = [
  // Shipping language
  /free\s*shipping/gi,
  /ships?\s*from/gi,
  /\d+[-–]\d+\s*business\s*days?/gi,
  /fast\s*delivery/gi,
  /express\s*shipping/gi,
  /us\s*warehouse/gi,
  /worldwide\s*shipping/gi,
  /delivery\s*time/gi,
  /ships?\s*quickly/gi,
  /same\s*day\s*shipping/gi,
  /next\s*day\s*delivery/gi,
  /domestic\s*shipping/gi,
  /international\s*shipping/gi,
  /flat\s*rate\s*shipping/gi,
  /free\s*us\s*shipping/gi,
  /ships?\s*from\s*us\s*fulfillment/gi,
  /us\s*fulfillment/gi,

  // Return language
  /\d+[-–]?\s*day\s*returns?/gi,
  /hassle[-\s]*free\s*returns?/gi,
  /money\s*back/gi,
  /satisfaction\s*guarantee[d]?/gi,
  /happiness\s*guarantee[d]?/gi,
  /full\s*refund/gi,
  /risk[-\s]*free/gi,
  /no\s*questions?\s*asked/gi,
  /easy\s*returns?/gi,

  // Marketing claims
  /trusted\s*by/gi,
  /best\s*seller/gi,
  /bestseller/gi,
  /top[-\s]*rated/gi,
  /premium\s*quality/gi,
  /unbeatable/gi,
  /limited\s*(time\s*)?offer/gi,
  /shop\s*now/gi,
  /order\s*today/gi,
  /best\s*price/gi,
  /exclusive\s*(deal|offer|price)?/gi,
  /must[-\s]*have/gi,
  /your\s*pet\s*deserves/gi,
  /perfect\s*for/gi,
  /amazing/gi,
  /high[-\s]*quality\s*guarantee/gi,
  /incredible/gi,
  /unbelievable/gi,
  /guaranteed/gi,
  /act\s*now/gi,
  /don'?t\s*miss/gi,
  /hurry/gi,
  /while\s*supplies?\s*last/gi,
  /limited\s*stock/gi,
  /only\s*\d+\s*left/gi,
  /sale\s*ends?/gi,
  /save\s*\d+%/gi,
  /\d+%\s*off/gi,
  /buy\s*now/gi,
  /add\s*to\s*cart/gi,
  /\bnew\s*style\b/gi,

  // Trust badges in text
  /✔/g,
  /✓/g,
  /★+/g,
  /⭐+/g,
  /🏆/g,
  /🥇/g,
  /💯/g,
  /🔥/g,
  /✅/g,
  /🎉/g,
  /🚚/g,
  /📦/g,

  // Branding slogans / emotional
  /we\s*love\s*pets?/gi,
  /pawsy\s*promise/gi,
  /join\s*\d+\s*happy/gi,
  /customers?\s*love/gi,
  /pet\s*parents?\s*agree/gi,
  /vet[-\s]*recommended/gi,
  /vet[-\s]*approved/gi,
];

// ── Banned title adjectives ────────────────────────────────────────
const BANNED_TITLE_WORDS: RegExp[] = [
  /\bbest\b/gi,
  /\bpremium\b/gi,
  /\btop\b(?!\s*(load|mount|entry|zip|lid))/gi, // allow "top-loading" etc
  /\b(amazing|incredible|unbelievable|fantastic|awesome|superb)\b/gi,
  /\bexclusive\b/gi,
  /\bluxury\b/gi,
  /\bultimate\b/gi,
  /\bprofessional\s*grade\b/gi,
  /\bmust[-\s]*have\b/gi,
  /\bnew\s*style\b/gi,
  /\bhot\s*sale\b/gi,
  /\b(free|gratis)\b/gi,
];

// ── Emoji detection ────────────────────────────────────────────────
const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{200D}\u{20E3}\u{FE0F}\u{E0020}-\u{E007F}]/gu;

// ── HTML tag detection ─────────────────────────────────────────────
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;

// ── ALL CAPS marketing detection (3+ consecutive uppercase words) ─
const ALL_CAPS_MARKETING_RE = /\b[A-Z]{2,}(?:\s+[A-Z]{2,}){2,}\b/g;

// ── Google Product Category mapping ────────────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  "dog toys": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys",
  "cat toys": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys",
  "dog beds": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds",
  "cat beds": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Beds & Mats",
  "dog collars": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Harnesses",
  "cat collars": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Collars & Harnesses",
  "dog leashes": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Leashes",
  "dog food": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Food",
  "cat food": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Food",
  "dog grooming": "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Grooming Supplies",
  "cat grooming": "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Grooming Supplies",
  "pet carriers": "Animals & Pet Supplies > Pet Supplies > Pet Carriers & Crates",
  "pet bowls": "Animals & Pet Supplies > Pet Bowls & Feeding Accessories",
  "aquarium": "Animals & Pet Supplies > Pet Supplies > Fish Supplies > Aquariums",
  "bird": "Animals & Pet Supplies > Pet Supplies > Bird Supplies",
  "small animal": "Animals & Pet Supplies > Pet Supplies > Small Animal Supplies",
  "reptile": "Animals & Pet Supplies > Pet Supplies > Reptile & Amphibian Supplies",
  // Fallback
  "pet supplies": "Animals & Pet Supplies > Pet Supplies",
  "pet": "Animals & Pet Supplies > Pet Supplies",
};

export interface ComplianceSanitizeResult {
  originalTitle: string;
  sanitizedTitle: string;
  originalDescription: string;
  sanitizedDescription: string;
  titleChanged: boolean;
  descriptionChanged: boolean;
  removedPhrases: string[];
  blocked: boolean;
  blockReason: string | null;
  googleProductCategory: string | null;
}

export interface ComplianceSummary {
  total_products_processed: number;
  sanitized_titles_count: number;
  sanitized_descriptions_count: number;
  removed_promotional_phrases_count: number;
  products_blocked_for_compliance: number;
  blocked_reasons: Record<string, number>;
  final_export_count: number;
}

/**
 * Sanitize a single product title for Google Merchant compliance.
 */
export function sanitizeTitle(title: string): { sanitized: string; removed: string[] } {
  let result = title;
  const removed: string[] = [];

  // Remove emojis
  const emojiMatches = result.match(EMOJI_RE);
  if (emojiMatches) {
    removed.push(...emojiMatches.map(e => `emoji:${e}`));
    result = result.replace(EMOJI_RE, "");
  }

  // Remove banned title words
  for (const re of BANNED_TITLE_WORDS) {
    const matches = result.match(re);
    if (matches) {
      removed.push(...matches.map(m => `title_word:${m.trim()}`));
      result = result.replace(re, "");
    }
  }

  // Remove banned phrases
  for (const re of BANNED_PHRASES) {
    const matches = result.match(re);
    if (matches) {
      removed.push(...matches.map(m => `phrase:${m.trim()}`));
      result = result.replace(re, "");
    }
  }

  // Fix ALL CAPS words (more than 4 chars, not acronyms like "PVC", "LED", "USB", "XL")
  result = result.replace(/\b([A-Z]{5,})\b/g, (match) => {
    return match.charAt(0) + match.slice(1).toLowerCase();
  });

  // Clean up whitespace
  result = result.replace(/\s{2,}/g, " ").trim();
  // Remove leading/trailing punctuation artifacts
  result = result.replace(/^[,.\-–—:;|]+\s*/, "").replace(/\s*[,.\-–—:;|]+$/, "");

  return { sanitized: result, removed };
}

/**
 * Sanitize a product description for Google Merchant compliance.
 */
export function sanitizeDescription(description: string): { sanitized: string; removed: string[] } {
  let result = description;
  const removed: string[] = [];

  // Strip HTML tags
  const htmlMatches = result.match(HTML_TAG_RE);
  if (htmlMatches) {
    removed.push(`html_tags:${htmlMatches.length}`);
    result = result.replace(HTML_TAG_RE, " ");
  }

  // Remove emojis
  const emojiMatches = result.match(EMOJI_RE);
  if (emojiMatches) {
    removed.push(...emojiMatches.map(e => `emoji:${e}`));
    result = result.replace(EMOJI_RE, "");
  }

  // Remove ALL CAPS marketing blocks
  const capsMatches = result.match(ALL_CAPS_MARKETING_RE);
  if (capsMatches) {
    for (const m of capsMatches) {
      removed.push(`all_caps:${m.substring(0, 40)}`);
    }
    result = result.replace(ALL_CAPS_MARKETING_RE, (match) => {
      return match.charAt(0) + match.slice(1).toLowerCase();
    });
  }

  // Remove banned phrases
  for (const re of BANNED_PHRASES) {
    const matches = result.match(re);
    if (matches) {
      removed.push(...matches.map(m => `phrase:${m.trim()}`));
      result = result.replace(re, "");
    }
  }

  // Remove bullet symbols (keep content)
  result = result.replace(/[•●◦▪▸►➤➜→←↓↑⇒⇨※☆♦♥♠♣]/g, "");
  // Remove checkmarks/ticks
  result = result.replace(/[✔✓✅☑]/g, "");

  // Clean up
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/\s{2,}/g, " ");
  result = result.replace(/^\s+|\s+$/gm, "");
  result = result.trim();

  // Truncate to 5000 chars (Google limit)
  if (result.length > 5000) {
    result = result.substring(0, 4997) + "...";
  }

  return { sanitized: result, removed };
}

/**
 * Check if a product should be BLOCKED from export entirely.
 */
export function checkComplianceBlock(
  title: string,
  description: string
): { blocked: boolean; reason: string | null } {
  // After sanitization, re-check for remaining violations
  for (const re of BANNED_PHRASES) {
    if (re.test(title) || re.test(description)) {
      return { blocked: true, reason: `residual_banned_phrase` };
    }
  }

  if (EMOJI_RE.test(title) || EMOJI_RE.test(description)) {
    return { blocked: true, reason: "residual_emoji" };
  }

  if (HTML_TAG_RE.test(description)) {
    return { blocked: true, reason: "residual_html" };
  }

  if (!title || title.trim().length < 3) {
    return { blocked: true, reason: "title_too_short_after_sanitize" };
  }

  if (!description || description.trim().length < 10) {
    return { blocked: true, reason: "description_too_short_after_sanitize" };
  }

  return { blocked: false, reason: null };
}

/**
 * Map internal category to Google Product Category.
 * Returns null if no valid mapping found (leave empty per spec).
 */
export function mapGoogleCategory(internalCategory: string | null): string | null {
  if (!internalCategory) return null;
  const lower = internalCategory.toLowerCase().trim();

  // Direct match
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];

  // Partial match
  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return value;
  }

  return null;
}

/**
 * Full compliance sanitization for a single product.
 */
export function sanitizeProduct(product: {
  title: string;
  description: string;
  category?: string | null;
}): ComplianceSanitizeResult {
  const titleResult = sanitizeTitle(product.title);
  const descResult = sanitizeDescription(product.description);

  const allRemoved = [...titleResult.removed, ...descResult.removed];

  // Post-sanitize compliance check
  const blockCheck = checkComplianceBlock(titleResult.sanitized, descResult.sanitized);

  return {
    originalTitle: product.title,
    sanitizedTitle: titleResult.sanitized,
    originalDescription: product.description,
    sanitizedDescription: descResult.sanitized,
    titleChanged: titleResult.sanitized !== product.title,
    descriptionChanged: descResult.sanitized !== product.description,
    removedPhrases: allRemoved,
    blocked: blockCheck.blocked,
    blockReason: blockCheck.reason,
    googleProductCategory: mapGoogleCategory(product.category || null),
  };
}
