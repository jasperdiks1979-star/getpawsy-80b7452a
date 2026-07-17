/**
 * Safe product name for Schema.org Product JSON-LD.
 *
 * Google Merchant Listings flags `name` values that exceed 150 characters
 * ("Invalid string length in field \"name\""). Supplier titles routinely run
 * 180–200 chars with keyword-stuffed feature dumps. This helper produces a
 * concise, factual, structured-data-safe name shared by every JSON-LD emitter
 * (PDP Product, CollectionPage ItemList, BreadcrumbList tail, category
 * ItemList, etc.). Storefront H1/card titles remain untouched.
 *
 * Rules enforced:
 *  - prefer AI-cleaned `name_clean` (see displayName contract) then raw `name`
 *  - strip HTML tags and control characters
 *  - normalize whitespace
 *  - hard cap 150 Unicode code points
 *  - never truncate mid-word (cut at last whitespace / punctuation boundary)
 *  - never end on a dangling separator ("," ";" "-" "&" "/" "|")
 *  - factual fallback when input is empty
 */

const HARD_MAX = 150;
const FALLBACK = "GetPawsy pet product";

export interface StructuredNameInput {
  name?: string | null;
  name_clean?: string | null;
}

/** Remove HTML tags, control chars, and collapse whitespace. */
function normalize(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    // strip ASCII control chars (keep normal printable + non-ASCII letters)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Length in Unicode code points (not UTF-16 units) so emoji/surrogates count as one. */
function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** Slice by code points, never splitting a surrogate pair. */
function sliceCodePoints(s: string, max: number): string {
  if (codePointLength(s) <= max) return s;
  let out = "";
  let n = 0;
  for (const ch of s) {
    if (n >= max) break;
    out += ch;
    n++;
  }
  return out;
}

function trimTrailingSeparators(s: string): string {
  return s.replace(/[\s,;:/|&\-–—•·]+$/u, "").trim();
}

/**
 * Build a Schema.org-safe product name (≤ 150 Unicode code points).
 * Never returns an empty string.
 */
export function buildStructuredProductName(
  product: StructuredNameInput,
  maxLength: number = HARD_MAX,
): string {
  const cap = Math.max(1, Math.min(HARD_MAX, Math.floor(maxLength)));
  const source = (product?.name_clean ?? "").trim() || (product?.name ?? "").trim();
  const cleaned = normalize(source);
  if (!cleaned) return FALLBACK;

  if (codePointLength(cleaned) <= cap) return cleaned;

  // Truncate at word boundary. Reserve 1 code point for the ellipsis so the
  // final string still fits inside the cap.
  const budget = cap - 1;
  const head = sliceCodePoints(cleaned, budget);
  // Cut back to last whitespace boundary so no word is split.
  const lastBoundary = Math.max(
    head.lastIndexOf(" "),
    head.lastIndexOf(","),
    head.lastIndexOf(";"),
    head.lastIndexOf(" – "),
  );
  const wordSafe = lastBoundary > 20 ? head.slice(0, lastBoundary) : head;
  const trimmed = trimTrailingSeparators(wordSafe);
  const finalText = trimmed.length > 0 ? `${trimmed}…` : sliceCodePoints(cleaned, cap);
  // Defensive final cap.
  return codePointLength(finalText) <= cap ? finalText : sliceCodePoints(finalText, cap);
}

/** Convenience: max length exposed for tests / audits. */
export const STRUCTURED_NAME_MAX = HARD_MAX;