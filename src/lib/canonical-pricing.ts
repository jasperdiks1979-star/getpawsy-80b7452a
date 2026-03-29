/**
 * Canonical pricing utilities — single source of truth for how prices
 * are displayed across the storefront.
 *
 * POLICY (updated):
 * - If a product has variants, the storefront price is the FIRST variant's
 *   variantSellPrice. This matches the PDP default (auto-selects first variant).
 * - If a product has NO variants, the base product.price is used.
 * - This applies to PDP, sticky CTA, cards, grids, sliders, bestseller cards.
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
 * Extract the deterministic default variant price from a product's variants JSON.
 * Returns null if no valid variant price is found.
 */
function getFirstVariantPrice(variants: unknown): number | null {
  if (!variants || !Array.isArray(variants) || variants.length === 0) return null;
  const first = variants[0];
  if (!first || typeof first !== 'object') return null;
  const price = Number((first as Record<string, unknown>).variantSellPrice);
  return price > 0 ? price : null;
}

/**
 * Get the canonical storefront price for any product display.
 * Uses first variant price when available (matches PDP default),
 * falls back to base product price.
 */
export function getCanonicalCardPrice(product: {
  price?: number | null;
  compare_at_price?: number | null;
  variants?: unknown;
}): CardPriceResult {
  const basePrice = Number(product.price) || 0;
  const variantPrice = getFirstVariantPrice(product.variants);
  const price = variantPrice ?? basePrice;
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
  const variantPrice = getFirstVariantPrice(product.variants);
  return variantPrice ?? (Number(product.price) || 0);
}
