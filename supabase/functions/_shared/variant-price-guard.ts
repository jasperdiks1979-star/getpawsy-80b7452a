/**
 * Supplier-sync price guard.
 *
 * CJ's `variantSellPrice` is the SUPPLIER cost. A product's stored variant
 * only carries a customer sell price when `variantCostPrice` (the processed
 * marker) is set — see canonicalUnitPrice in ./order-state.ts.
 *
 * When a sync rebuilds `products.variants` from a fresh CJ payload it must:
 *  - keep the existing processed sell price + marker for the same option,
 *  - never invent a marker from the CJ payload,
 *  - record the fresh supplier cost in `supplierCostPrice` (a cost-only field).
 */
type Rec = Record<string, unknown>;

const keyOf = (v: Rec): string =>
  String(v.vid ?? v.cj_vid ?? v.variantSku ?? v.sku ?? v.variantKey ?? "");

const positive = (x: unknown): number | null => {
  const n = Number(x);
  return x != null && Number.isFinite(n) && n > 0 ? n : null;
};

export function guardVariantPricing(
  existingVariants: unknown,
  fresh: Rec,
): { variantSellPrice: number | null; variantCostPrice: number | null; supplierCostPrice: number | null } {
  const supplierCostPrice = positive(fresh.variantSellPrice ?? fresh.price);
  const list = Array.isArray(existingVariants) ? (existingVariants as Rec[]) : [];
  const k = keyOf(fresh);
  const prev = k ? list.find((v) => v && keyOf(v) === k) : undefined;
  if (prev && positive(prev.variantCostPrice) != null && positive(prev.variantSellPrice) != null) {
    return {
      variantSellPrice: positive(prev.variantSellPrice),
      variantCostPrice: positive(prev.variantCostPrice),
      supplierCostPrice,
    };
  }
  // Unprocessed option: value stays the raw supplier cost and is NOT marked,
  // so checkout/storefront keep charging products.price.
  return { variantSellPrice: supplierCostPrice, variantCostPrice: null, supplierCostPrice };
}
