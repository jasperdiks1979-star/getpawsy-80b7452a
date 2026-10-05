/**
 * Customer sell-price authority — mirrors `canonicalUnitPrice` in
 * supabase/functions/_shared/order-state.ts exactly. Keep them identical.
 *
 * `products.price` is the customer sell price (listing, PDP, Merchant feed).
 * A variant's `variantSellPrice` only overrides it when BOTH:
 *  - the product has more than one option (single-option products always show
 *    and charge the base price), and
 *  - the variant carries `variantCostPrice`, the marker written when an import
 *    or repair converted the supplier cost into a selling price.
 * Without that marker `variantSellPrice` is the raw supplier (CJ) cost.
 */
export interface PricedVariant {
  variantSellPrice?: number | string | null;
  variantCostPrice?: number | string | null;
}

export function customerUnitPrice(
  basePrice: number,
  variant: PricedVariant | null | undefined,
  variantCount: number,
): number {
  const base = Math.round(Number(basePrice) * 100) / 100;
  if (!variant || variantCount <= 1) return base;
  const sell = Number(variant.variantSellPrice);
  const cost = Number(variant.variantCostPrice);
  if (variant.variantCostPrice == null || !Number.isFinite(cost) || cost <= 0) return base;
  if (!Number.isFinite(sell) || sell <= 0) return base;
  return Math.round(sell * 100) / 100;
}
