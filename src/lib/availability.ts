/**
 * Single source of truth for product availability computation.
 * 
 * DROPSHIPPING MODEL (CJ Dropshipping):
 * - is_active === false → OUT OF STOCK (disabled by admin)
 * - ANY stock value (0, null, positive) with is_active=true → IN STOCK
 * 
 * Stock numbers are informational only. The supplier manages real inventory.
 * Only is_active=false marks a product as unavailable.
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
 * Compute availability for a product (with optional variant stock override).
 * 
 * Rules (priority order):
 * 1. No product → OUT OF STOCK
 * 2. is_active === false → OUT OF STOCK
 * 3. Use effectiveStock (variantStock if provided, else product.stock)
 * 4. effectiveStock === 0 → OUT OF STOCK (explicitly zero)
 * 5. effectiveStock > 0 → IN STOCK
 * 6. effectiveStock is null/undefined → IN STOCK (dropship default)
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

  // Dropship model: stock=0 is NOT out of stock (supplier manages inventory)
  // Only is_active=false triggers OOS

  // Positive stock = in stock
  if (effectiveStock !== null && effectiveStock !== undefined && effectiveStock > 0) {
    return { isInStock: true, reason: `In stock (${effectiveStock} units)` };
  }

  // null/undefined = dropship model, treat as in stock
  return { isInStock: true, reason: 'In stock (dropship model: stock not tracked)' };
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
