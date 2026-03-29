/**
 * Canonical pricing utilities — single source of truth for how prices
 * are displayed across the storefront.
 *
 * POLICY (updated):
 * - The storefront price is always the BASE product.price.
 * - Variant prices are only shown after explicit user selection on PDP.
 * - This applies to PDP default, sticky CTA, cards, grids, sliders, bestseller cards.
 * - compare_at_price always comes from the base product.
 */

export interface CardPriceResult {
  /** The price to display */
  price: number;
  /** Compare-at / was-price, or null */
  compareAtPrice: number | null;
  /** Formatted display string */
  displayPrice: string;
  /** Formatted compare-at string, or null */
  displayCompareAt: string | null;
}

/**
 * Get the canonical storefront price for any product display.
 * Always uses the base product price.
 */
export function getCanonicalCardPrice(product: {
  price?: number | null;
  compare_at_price?: number | null;
  variants?: unknown;
}): CardPriceResult {
  const price = Number(product.price) || 0;
  const compareAt = Number(product.compare_at_price) || 0;
  const validCompareAt = compareAt > price ? compareAt : null;

  return {
    price,
    compareAtPrice: validCompareAt,
    displayPrice: `$${price.toFixed(2)}`,
    displayCompareAt: validCompareAt ? `$${validCompareAt.toFixed(2)}` : null,
  };
}

/**
 * Convenience: get just the numeric canonical price for a product.
 */
export function getCanonicalPrice(product: {
  price?: number | null;
  variants?: unknown;
}): number {
  return Number(product.price) || 0;
}
