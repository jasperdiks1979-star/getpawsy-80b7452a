/**
 * Canonical pricing utilities — single source of truth for how prices
 * are displayed across the storefront.
 *
 * RULES:
 * - PDP: shows the active selected variant price (or base if no variant)
 * - Sticky CTA: mirrors the exact PDP active price
 * - Product cards / grids / sliders: always show base product price
 *   (the price column from products_public)
 *
 * Cards do NOT show variant prices. If variant pricing differs significantly,
 * the PDP handles that with its own variant selector.
 */

export interface CardPriceResult {
  /** The price to display on the card */
  price: number;
  /** Compare-at / was-price, or null */
  compareAtPrice: number | null;
  /** Formatted display string */
  displayPrice: string;
  /** Formatted compare-at string, or null */
  displayCompareAt: string | null;
}

/**
 * Get the canonical price for a product card (grid, slider, bestseller card, etc.)
 * Always uses the base product price — never variant price.
 */
export function getCanonicalCardPrice(product: {
  price?: number | null;
  compare_at_price?: number | null;
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
