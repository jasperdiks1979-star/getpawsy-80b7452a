/**
 * Canonical discount calculation — single source of truth for all PDPs,
 * product cards, gallery badges, and sticky CTAs.
 *
 * RULE: The discount badge always reflects the BASE product price vs compare-at.
 * Variant pricing may show inline savings but must never override the badge.
 */

export interface DiscountResult {
  /** Whole-number percentage (e.g. 44), or null when no valid discount */
  percent: number | null;
  /** Absolute dollar savings, or null */
  savings: number | null;
}

/**
 * Compute the canonical discount for a product.
 *
 * @param price        The base (or selling) price — NOT variant price
 * @param compareAt    The compare-at / was-price (may be null/undefined/0)
 */
export function getProductDiscount(
  price: number | null | undefined,
  compareAt: number | null | undefined,
): DiscountResult {
  const p = Number(price);
  const c = Number(compareAt);

  if (!price || !compareAt || isNaN(p) || isNaN(c) || c <= p || p <= 0) {
    return { percent: null, savings: null };
  }

  return {
    percent: Math.round((1 - p / c) * 100),
    savings: Math.round((c - p) * 100) / 100,
  };
}
