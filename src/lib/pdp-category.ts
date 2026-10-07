/**
 * Shared PDP category detection for the generic (non-evidence) PDP sections.
 *
 * Generic sections may use this ONLY to choose safe category-level context
 * (who a product type commonly suits, a neutral headline). They must never
 * turn the detected category into product attributes — concrete features
 * (materials, foam, BPA-free, washable, weight limits…) come only from
 * src/lib/product-evidence.ts or a verified per-product override.
 *
 * Matching is word-based and ordered so a product that merely MENTIONS
 * another category ("Dog Ramp for Bed", "Bed Stairs") is classified by what
 * it is, not by the word it contains.
 */
export type PdpCategory =
  | 'ramp' | 'litter box' | 'cat tree' | 'stroller' | 'carrier' | 'car seat'
  | 'harness' | 'bed' | 'bowl' | 'fountain' | 'toy' | 'grooming' | 'generic';

const RULES: Array<[PdpCategory, RegExp]> = [
  ['litter box', /\blitter\b/],
  ['cat tree', /\bcat\s*(?:trees?|condos?|towers?)\b|\bscratch(?:er|ing)\b/],
  ['ramp', /\b(?:ramps?|stairs?|steps?)\b/],
  ['stroller', /\bstrollers?\b/],
  ['carrier', /\b(?:carriers?|crates?|backpacks?)\b/],
  ['car seat', /\bcar\s*(?:seats?|covers?|booster)\b/],
  ['harness', /\b(?:harness(?:es)?|leash(?:es)?|collars?)\b/],
  ['bed', /\b(?:beds?|cushions?|mattress(?:es)?)\b/],
  ['fountain', /\b(?:fountains?|water\s*dispensers?)\b/],
  ['bowl', /\b(?:bowls?|feeders?|dish(?:es)?)\b/],
  ['toy', /\b(?:toys?|balls?|chews?|teasers?|wands?)\b/],
  ['grooming', /\b(?:brush(?:es)?|groom(?:ing|er)?|combs?|deshedd(?:ing|er))\b/],
];

export function detectPdpCategory(name: string, category = ''): PdpCategory {
  // The product NAME says what the item is; the category is only a fallback.
  for (const text of [name, `${name} ${category}`]) {
    const c = (text || '').toLowerCase();
    for (const [cat, re] of RULES) if (re.test(c)) return cat;
  }
  return 'generic';
}
