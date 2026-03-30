/**
 * Canonical pricing utilities — delegates to the merchant-safe product layer.
 *
 * IMPORTANT: This file is a thin wrapper that ensures backward compatibility.
 * All pricing logic is centralised in src/lib/merchant-safe-product.ts.
 * New code should import from merchant-safe-product.ts directly.
 */

import { getDisplayPrice, type MerchantProduct } from '@/lib/merchant-safe-product';

export interface CardPriceResult {
  price: number;
  compareAtPrice: number | null;
  displayPrice: string;
  displayCompareAt: string | null;
}

/**
 * Get the canonical storefront price for any product display.
 * Delegates to the merchant-safe canonical layer.
 */
export function getCanonicalCardPrice(product: {
  price?: number | null;
  compare_at_price?: number | null;
  variants?: unknown;
}): CardPriceResult {
  const result = getDisplayPrice(product as MerchantProduct);
  return {
    price: result.price,
    compareAtPrice: result.compareAtPrice,
    displayPrice: result.displayPrice,
    displayCompareAt: result.displayCompareAt,
  };
}

/**
 * Convenience: get just the numeric canonical price for a product.
 */
export function getCanonicalPrice(product: {
  price?: number | null;
  variants?: unknown;
}): number {
  return getDisplayPrice(product as MerchantProduct).price;
}
