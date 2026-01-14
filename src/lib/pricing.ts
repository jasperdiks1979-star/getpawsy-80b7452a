/**
 * Pricing utilities for psychological pricing and dynamic markup calculation
 * Designed for the US market with "Free Shipping" pricing strategy
 */

/**
 * Calculate dynamic markup multiplier based on cost price
 * Lower cost items get higher markups, higher cost items get lower markups
 * This creates better profit margins on cheap items while staying competitive on expensive ones
 */
export function calculateDynamicMultiplier(costPrice: number): number {
  if (costPrice <= 2) {
    // Very cheap items (≤$2): 4x markup
    return 4.0;
  } else if (costPrice <= 5) {
    // Cheap items ($2-$5): 3.5x markup
    return 3.5;
  } else if (costPrice <= 10) {
    // Low-mid items ($5-$10): 3x markup
    return 3.0;
  } else if (costPrice <= 20) {
    // Mid-range items ($10-$20): 2.5x markup
    return 2.5;
  } else if (costPrice <= 50) {
    // Higher-mid items ($20-$50): 2x markup
    return 2.0;
  } else if (costPrice <= 100) {
    // Expensive items ($50-$100): 1.75x markup
    return 1.75;
  } else {
    // Very expensive items (>$100): 1.5x markup
    return 1.5;
  }
}

/**
 * Estimate shipping cost based on product weight (in grams)
 * Uses approximate US domestic shipping rates
 */
export function estimateShippingCost(weight: number): number {
  // Weight in grams, convert to rough shipping cost
  if (weight <= 100) {
    return 3.99;
  } else if (weight <= 250) {
    return 4.99;
  } else if (weight <= 500) {
    return 5.99;
  } else if (weight <= 1000) {
    return 7.99;
  } else if (weight <= 2000) {
    return 9.99;
  } else {
    // Heavy items: base + per kg
    return 9.99 + Math.ceil((weight - 2000) / 1000) * 3;
  }
}

/**
 * Round price to psychological ending (.99, .98, .95)
 * Uses smart rounding based on price range
 */
export function roundToPsychologicalPrice(price: number): number {
  const wholePart = Math.floor(price);
  const decimalPart = price - wholePart;
  
  // For very low prices (under $5), be more precise
  if (price < 5) {
    if (decimalPart < 0.25) {
      return wholePart - 0.01; // e.g., 3.15 → 2.99
    } else if (decimalPart < 0.50) {
      return wholePart + 0.49; // e.g., 3.35 → 3.49
    } else if (decimalPart < 0.75) {
      return wholePart + 0.49; // e.g., 3.60 → 3.49
    } else {
      return wholePart + 0.99; // e.g., 3.85 → 3.99
    }
  }
  
  // For prices $5-$20
  if (price < 20) {
    if (decimalPart < 0.30) {
      return wholePart - 0.01; // Round down to .99
    } else if (decimalPart < 0.60) {
      return wholePart + 0.49; // Round to .49
    } else {
      return wholePart + 0.99; // Round up to .99
    }
  }
  
  // For prices $20-$100: use .99 or .95
  if (price < 100) {
    if (decimalPart < 0.475) {
      return wholePart - 0.01; // e.g., 24.30 → 23.99
    } else if (decimalPart < 0.725) {
      return wholePart + 0.49; // e.g., 24.55 → 24.49
    } else {
      return wholePart + 0.95; // e.g., 24.80 → 24.95
    }
  }
  
  // For prices $100+: round to nearest .99 or .00
  if (decimalPart < 0.50) {
    return wholePart - 0.01; // e.g., 124.30 → 123.99
  } else {
    return wholePart + 0.99; // e.g., 124.70 → 124.99
  }
}

/**
 * Calculate the final selling price including:
 * - Shipping cost added to cost price
 * - Dynamic markup based on total cost
 * - Psychological price rounding
 */
export function calculateSellingPrice(
  costPrice: number,
  weight: number = 200 // default weight in grams
): { 
  sellingPrice: number; 
  compareAtPrice: number;
  totalCost: number;
  multiplier: number;
  shippingCost: number;
} {
  // Add estimated shipping to cost
  const shippingCost = estimateShippingCost(weight);
  const totalCost = costPrice + shippingCost;
  
  // Calculate dynamic multiplier based on total cost
  const multiplier = calculateDynamicMultiplier(totalCost);
  
  // Calculate raw price
  const rawPrice = totalCost * multiplier;
  
  // Apply psychological rounding
  const sellingPrice = roundToPsychologicalPrice(rawPrice);
  
  // Calculate compare-at price (for strikethrough) - 20-30% higher
  const compareAtMultiplier = 1.2 + (Math.random() * 0.1); // 1.2-1.3x
  const rawCompareAt = sellingPrice * compareAtMultiplier;
  
  // Round compare-at to .00 or .99 for cleaner display
  const compareAtPrice = Math.ceil(rawCompareAt) - 0.01;
  
  return {
    sellingPrice,
    compareAtPrice,
    totalCost,
    multiplier,
    shippingCost,
  };
}

/**
 * Format price for display in USD
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price);
}
