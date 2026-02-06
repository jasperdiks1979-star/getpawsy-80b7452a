/**
 * Single source of truth for product availability computation.
 * 
 * DROPSHIPPING MODEL RULES:
 * - Stock value of 0 does NOT mean out of stock (suppliers manage inventory)
 * - Only mark as out of stock when explicitly flagged
 * - Missing/undefined fields => treat as IN STOCK (never default to OOS)
 */

export interface AvailabilityProduct {
  stock?: number | null;
  is_active?: boolean | null;
  available?: boolean | null;
  inventory?: number | null;
  qty?: number | null;
  out_of_stock?: boolean | null;
}

export interface AvailabilityVariant {
  available?: boolean | null;
  inventory?: number | null;
  stock?: number | null;
  out_of_stock?: boolean | null;
}

export interface AvailabilityResult {
  isInStock: boolean;
  reason: string;
  debugInfo: {
    is_active: boolean | null | undefined;
    available: boolean | null | undefined;
    stock: number | null | undefined;
    hasVariant: boolean;
    variantAvailable?: boolean | null | undefined;
    variantInventory?: number | null | undefined;
  };
}

/**
 * Compute availability for a product, optionally with a selected variant.
 * 
 * Rules:
 * A) If selectedVariant exists:
 *    - isInStock = (variant.available !== false) AND (variant.inventory !== 0 if inventory field exists)
 *    - BUT if variant.out_of_stock === true => OUT OF STOCK
 * 
 * B) Else (no variant):
 *    - If product.is_active === false => OUT OF STOCK
 *    - Else if product.available === false => OUT OF STOCK
 *    - Else if product.out_of_stock === true => OUT OF STOCK
 *    - Else => IN STOCK (dropship model: stock=0 is OK, supplier has inventory)
 * 
 * C) If fields are missing/undefined => IN STOCK (never default to OOS)
 */
export function computeAvailability(
  product: AvailabilityProduct | null | undefined,
  selectedVariant?: AvailabilityVariant | null
): AvailabilityResult {
  // No product = treat as in stock (loading state, etc.)
  if (!product) {
    return {
      isInStock: true,
      reason: 'No product data (loading)',
      debugInfo: {
        is_active: undefined,
        available: undefined,
        stock: undefined,
        hasVariant: false,
      },
    };
  }

  // If a variant is selected, use variant availability
  if (selectedVariant) {
    const variantAvailable = selectedVariant.available;
    const variantInventory = selectedVariant.inventory ?? selectedVariant.stock;
    const variantOOS = selectedVariant.out_of_stock;

    // Explicit out_of_stock flag on variant
    if (variantOOS === true) {
      return {
        isInStock: false,
        reason: 'Variant explicitly marked out of stock',
        debugInfo: {
          is_active: product.is_active,
          available: product.available,
          stock: product.stock,
          hasVariant: true,
          variantAvailable,
          variantInventory,
        },
      };
    }

    // Variant available field explicitly false
    if (variantAvailable === false) {
      return {
        isInStock: false,
        reason: 'Variant available = false',
        debugInfo: {
          is_active: product.is_active,
          available: product.available,
          stock: product.stock,
          hasVariant: true,
          variantAvailable,
          variantInventory,
        },
      };
    }

    // DROPSHIPPING MODEL: Variant inventory = 0 does NOT mean out of stock.
    // Only explicit flags (is_active=false, available=false, out_of_stock=true) trigger OOS.
    // Stock is supplier-managed and 0 just means no local count, not unavailable.

    // Variant is available
    return {
      isInStock: true,
      reason: 'Variant available',
      debugInfo: {
        is_active: product.is_active,
        available: product.available,
        stock: product.stock,
        hasVariant: true,
        variantAvailable,
        variantInventory,
      },
    };
  }

  // No variant selected - check product-level availability

  // Explicit is_active = false => OUT OF STOCK
  if (product.is_active === false) {
    return {
      isInStock: false,
      reason: 'Product is_active = false (disabled)',
      debugInfo: {
        is_active: product.is_active,
        available: product.available,
        stock: product.stock,
        hasVariant: false,
      },
    };
  }

  // Explicit available = false => OUT OF STOCK
  if (product.available === false) {
    return {
      isInStock: false,
      reason: 'Product available = false',
      debugInfo: {
        is_active: product.is_active,
        available: product.available,
        stock: product.stock,
        hasVariant: false,
      },
    };
  }

  // Explicit out_of_stock flag => OUT OF STOCK
  if (product.out_of_stock === true) {
    return {
      isInStock: false,
      reason: 'Product out_of_stock = true',
      debugInfo: {
        is_active: product.is_active,
        available: product.available,
        stock: product.stock,
        hasVariant: false,
      },
    };
  }

  // DROPSHIP MODEL: stock = 0 does NOT mean out of stock
  // Suppliers manage their own inventory
  // Only explicit flags (is_active=false, available=false, out_of_stock=true) mark as OOS

  // All other cases => IN STOCK
  return {
    isInStock: true,
    reason: 'Dropship model: in stock (no explicit OOS flag)',
    debugInfo: {
      is_active: product.is_active,
      available: product.available,
      stock: product.stock,
      hasVariant: false,
    },
  };
}

/**
 * Get schema.org availability URL based on computed availability
 */
export function getSchemaAvailability(product: AvailabilityProduct | null | undefined): string {
  const result = computeAvailability(product);
  return result.isInStock 
    ? 'https://schema.org/InStock' 
    : 'https://schema.org/OutOfStock';
}

/**
 * Get Google Merchant availability string based on computed availability
 */
export function getMerchantAvailability(product: AvailabilityProduct | null | undefined): string {
  const result = computeAvailability(product);
  return result.isInStock ? 'in stock' : 'out of stock';
}
