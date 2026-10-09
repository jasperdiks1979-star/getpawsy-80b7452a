/**
 * PDP price before the shopper picks an option. Inputs are prices already
 * resolved by customerUnitPrice (the checkout authority), so the shown price
 * is always one the shopper can actually buy.
 * - no variants → base price
 * - all variants equal → that price (may differ from products.price)
 * - mixed → lowest purchasable price, flagged as a range ("From")
 */
export function initialDisplayPrice(
  basePrice: number,
  resolvedVariantPrices: Array<number | null | undefined>,
): { price: number; isRange: boolean } {
  const prices = resolvedVariantPrices
    .map(Number)
    .filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length === 0) return { price: Number(basePrice), isRange: false };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { price: min, isRange: max - min >= 0.005 };
}
