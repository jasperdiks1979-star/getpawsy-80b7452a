/**
 * Canonical discount calculation — delegates to merchant-safe product layer.
 *
 * This file is a thin backward-compatible wrapper.
 * New code should use getDisplayDiscount from merchant-safe-product.ts.
 */

export interface DiscountResult {
  percent: number | null;
  savings: number | null;
}

/**
 * Compute the canonical discount for a product.
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
