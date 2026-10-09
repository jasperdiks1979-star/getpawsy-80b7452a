/**
 * Advertised (listing) price of a product — one rule for PDP initial price,
 * prerendered Product/Offer schema and the Merchant feeds. Dependency-free so
 * build plugins can import it.
 *
 * Each option's charge comes from customerUnitPrice (same as create-checkout),
 * so a variantSellPrice only counts when it carries the variantCostPrice
 * marker. Options with a known US stock <= 0 are not purchasable and never set
 * the advertised minimum. With no purchasable option data → products.price.
 */
import { customerUnitPrice, type PricedVariant } from './customerUnitPrice';
import { variantStockOf } from './variantStock';

export interface ListingPrice {
  /** Lowest purchasable price (the advertised price). */
  price: number;
  min: number;
  max: number;
  isRange: boolean;
  /** True when the advertised price differs from products.price. */
  differsFromBase: boolean;
}

export function listingPrice(basePrice: number, variants: unknown): ListingPrice {
  const base = Math.round(Number(basePrice) * 100) / 100;
  const list = Array.isArray(variants) ? variants : [];
  const prices: number[] = [];
  for (const v of list) {
    if (!v || typeof v !== 'object') continue;
    const stock = variantStockOf(v);
    if (stock !== null && stock <= 0) continue;
    const p = customerUnitPrice(base, v as PricedVariant, list.length);
    if (Number.isFinite(p) && p > 0) prices.push(p);
  }
  if (prices.length === 0) {
    return { price: base, min: base, max: base, isRange: false, differsFromBase: false };
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { price: min, min, max, isRange: max - min >= 0.005, differsFromBase: Math.abs(min - base) >= 0.005 };
}
