/**
 * Canonical discount calculation — delegates to merchant-safe product layer.
 *
 * This file is a thin backward-compatible wrapper.
 * New code should use getDisplayDiscount from merchant-safe-product.ts.
 */

import { getDisplayDiscount, type MerchantProduct } from '@/lib/merchant-safe-product';

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
  // Merchant-safe: every compare_at_price in this catalog is a script-generated
  // multiplier on the live price, never a documented former selling price, so no
  // discount percentage or "you save" figure may be displayed. Delegates the
  // decision to the single guard in merchant-safe-product.ts via getDisplayDiscount.
  return getDisplayDiscount({
    id: '',
    name: '',
    price: Number(price) || 0,
    compare_at_price: compareAt ?? null,
  } as MerchantProduct);
}
