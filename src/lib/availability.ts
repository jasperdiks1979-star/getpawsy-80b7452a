/**
 * Single source of truth for product availability computation.
 *
 * AVAILABILITY MODEL (updated 2026-06):
 * - !product or is_active === false → OUT OF STOCK
 * - explicit stock === 0           → OUT OF STOCK
 *                                   (admin-confirmed sold out; never lie on the PDP)
 * - stock > 0                       → IN STOCK
 * - stock null/undefined            → IN STOCK
 *                                   (dropship fulfillment model — partner manages
 *                                   inventory and never writes a real 0)
 *
 * The conversion-fix sprint flipped explicit 0 to OOS so trust signals stop
 * shipping the lie "In stock — ready to ship" on PDPs whose stock is 0.
 */

export interface AvailabilityProduct {
  stock?: number | null;
  is_active?: boolean | null;
}

export interface AvailabilityResult {
  isInStock: boolean;
  reason: string;
}

/**
 * Compute availability for a product.
 * 
 * Rules (priority order):
 * 1. No product → OUT OF STOCK
 * 2. is_active === false → OUT OF STOCK
 * 3. Everything else → IN STOCK (fulfillment model)
 */
export function computeAvailability(
  product: AvailabilityProduct | null | undefined,
  variantStock?: number | null,
): AvailabilityResult {
  if (!product) {
    return { isInStock: false, reason: 'No product data' };
  }

  if (product.is_active === false) {
    return { isInStock: false, reason: 'Product disabled (is_active=false)' };
  }

  // Variant stock overrides product stock when provided
  const effectiveStock = variantStock !== undefined ? variantStock : product.stock;

  // Explicit 0 = admin-confirmed sold out. PDP must not claim "In Stock".
  if (effectiveStock === 0) {
    return { isInStock: false, reason: 'Stock = 0 (admin-confirmed sold out)' };
  }

  if (typeof effectiveStock === 'number' && effectiveStock > 0) {
    return { isInStock: true, reason: `In stock (${effectiveStock} units)` };
  }

  // null/undefined = fulfillment model, treat as in stock
  return { isInStock: true, reason: 'In stock (fulfillment model: stock not tracked)' };
}

/**
 * Get schema.org availability URL based on computed availability
 */
export function getSchemaAvailability(product: AvailabilityProduct | null | undefined): string {
  return computeAvailability(product).isInStock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';
}

/**
 * Get Google Merchant availability string based on computed availability
 */
export function getMerchantAvailability(product: AvailabilityProduct | null | undefined): string {
  return computeAvailability(product).isInStock ? 'in stock' : 'out of stock';
}
