/**
 * Single source of truth for product availability computation.
 * 
 * REAL SUPPLIER STOCK MODEL (CJ Dropshipping):
 * - stock > 0 AND is_active = true → IN STOCK (purchasable)
 * - stock <= 0 OR stock is null → OUT OF STOCK (not purchasable)
 * - is_active === false → OUT OF STOCK (disabled by admin)
 * 
 * `stock` is the ONLY inventory field used. Legacy fields like
 * `available`, `inventory`, `qty`, `out_of_stock` are ignored.
 * 
 * This ensures Google Merchant Center compliance:
 * availability in feed, schema, and UI all derive from the same logic.
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
 * 3. stock > 0 → IN STOCK
 * 4. stock <= 0 or null → OUT OF STOCK
 */
export function computeAvailability(
  product: AvailabilityProduct | null | undefined,
): AvailabilityResult {
  if (!product) {
    return { isInStock: false, reason: 'No product data' };
  }

  if (product.is_active === false) {
    return { isInStock: false, reason: 'Product disabled (is_active=false)' };
  }

  const stock = product.stock;
  if (stock !== null && stock !== undefined && stock > 0) {
    return { isInStock: true, reason: `In stock (${stock} units)` };
  }

  return { isInStock: false, reason: `Out of stock (stock: ${stock ?? 'null'})` };
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
