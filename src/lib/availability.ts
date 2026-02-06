/**
 * Single source of truth for product availability computation.
 * 
 * REAL SUPPLIER STOCK MODEL:
 * - stock > 0 → IN STOCK (purchasable)
 * - stock <= 0 or null → OUT OF STOCK (not purchasable)
 * - is_active === false → OUT OF STOCK (disabled by admin)
 * 
 * This ensures Google Merchant Center compliance:
 * availability in feed, schema, and UI all derive from the same logic.
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
 * Rules (priority order):
 * 1. is_active === false → OUT OF STOCK
 * 2. available === false → OUT OF STOCK
 * 3. out_of_stock === true → OUT OF STOCK
 * 4. stock > 0 → IN STOCK
 * 5. stock <= 0 or null → OUT OF STOCK
 * 
 * For variants:
 * - variant.out_of_stock === true → OUT OF STOCK
 * - variant.available === false → OUT OF STOCK
 * - variant.inventory/stock checked if present, falls back to product stock
 */
export function computeAvailability(
  product: AvailabilityProduct | null | undefined,
  selectedVariant?: AvailabilityVariant | null
): AvailabilityResult {
  // No product = treat as out of stock (safe default for Google compliance)
  if (!product) {
    return {
      isInStock: false,
      reason: 'No product data',
      debugInfo: {
        is_active: undefined,
        available: undefined,
        stock: undefined,
        hasVariant: false,
      },
    };
  }

  // Product-level disqualifiers (always checked, even with variant)
  if (product.is_active === false) {
    return {
      isInStock: false,
      reason: 'Product is_active = false (disabled)',
      debugInfo: {
        is_active: product.is_active,
        available: product.available,
        stock: product.stock,
        hasVariant: !!selectedVariant,
      },
    };
  }

  if (product.available === false) {
    return {
      isInStock: false,
      reason: 'Product available = false',
      debugInfo: {
        is_active: product.is_active,
        available: product.available,
        stock: product.stock,
        hasVariant: !!selectedVariant,
      },
    };
  }

  if (product.out_of_stock === true) {
    return {
      isInStock: false,
      reason: 'Product out_of_stock = true',
      debugInfo: {
        is_active: product.is_active,
        available: product.available,
        stock: product.stock,
        hasVariant: !!selectedVariant,
      },
    };
  }

  // If a variant is selected, check variant-level availability
  if (selectedVariant) {
    const variantAvailable = selectedVariant.available;
    const variantInventory = selectedVariant.inventory ?? selectedVariant.stock;
    const variantOOS = selectedVariant.out_of_stock;

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

    // If variant has its own inventory field, use it
    if (variantInventory !== null && variantInventory !== undefined) {
      const inStock = variantInventory > 0;
      return {
        isInStock: inStock,
        reason: inStock 
          ? `Variant in stock (inventory: ${variantInventory})`
          : `Variant out of stock (inventory: ${variantInventory})`,
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

    // Variant has no inventory field → fall through to product-level stock
  }

  // Product-level stock check (real supplier stock)
  const stockValue = product.stock ?? product.inventory ?? product.qty;
  const hasStock = stockValue !== null && stockValue !== undefined && stockValue > 0;

  return {
    isInStock: hasStock,
    reason: hasStock
      ? `In stock (supplier stock: ${stockValue})`
      : `Out of stock (stock: ${stockValue ?? 'unknown'})`,
    debugInfo: {
      is_active: product.is_active,
      available: product.available,
      stock: product.stock,
      hasVariant: !!selectedVariant,
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
