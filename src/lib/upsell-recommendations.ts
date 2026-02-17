/**
 * AI-Based Upsell Recommendation Engine
 * Deterministic logic based on:
 * - Product category
 * - Cart value
 * - Number of items
 * - Historical attach rate (simulated with category affinity)
 */

// Category affinity map - products that pair well together
const CATEGORY_AFFINITY: Record<string, string[]> = {
  // Travel & car products
  'car': ['harness', 'seat-cover', 'safety', 'travel', 'carrier'],
  'travel': ['carrier', 'harness', 'car', 'safety', 'bowl'],
  'carrier': ['travel', 'harness', 'safety', 'blanket'],
  
  // Walking & outdoor
  'leash': ['harness', 'collar', 'safety', 'poop-bag'],
  'harness': ['leash', 'collar', 'car', 'safety'],
  'collar': ['leash', 'harness', 'tag', 'safety'],
  
  // Home & comfort
  'bed': ['blanket', 'pillow', 'mat', 'toy'],
  'blanket': ['bed', 'mat', 'comfort', 'carrier'],
  'mat': ['blanket', 'bed', 'car', 'bowl'],
  
  // Feeding
  'bowl': ['mat', 'feeder', 'treat', 'travel'],
  'feeder': ['bowl', 'mat', 'treat'],
  
  // Grooming
  'brush': ['shampoo', 'grooming', 'nail', 'comb'],
  'grooming': ['brush', 'shampoo', 'nail', 'bath'],
  
  // Toys & entertainment
  'toy': ['treat', 'ball', 'chew', 'puzzle'],
  'chew': ['toy', 'treat', 'ball', 'dental'],
  
  // Safety & protection
  'safety': ['harness', 'collar', 'leash', 'car', 'reflective'],
  'seat-cover': ['car', 'mat', 'harness', 'safety'],
};

// Base attach rates by category (simulated historical data)
const CATEGORY_ATTACH_RATES: Record<string, number> = {
  'car': 0.35,
  'travel': 0.30,
  'harness': 0.40,
  'leash': 0.25,
  'collar': 0.20,
  'bed': 0.15,
  'bowl': 0.22,
  'toy': 0.18,
  'safety': 0.38,
  'seat-cover': 0.42,
  'default': 0.20,
};

// Price tiers for smart recommendations
const PRICE_TIERS = {
  low: { max: 25, recommendedUpsellRange: [10, 20] },
  medium: { max: 50, recommendedUpsellRange: [15, 35] },
  high: { max: 100, recommendedUpsellRange: [25, 50] },
  premium: { max: Infinity, recommendedUpsellRange: [30, 75] },
};

interface Product {
  id: string;
  name: string;
  price: number;
  category?: string | null;
  is_active?: boolean | null;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
}

interface RecommendationInput {
  currentProduct: Product;
  availableProducts: Product[];
  cartItems?: CartItem[];
  cartValue?: number;
}

interface ScoredProduct extends Product {
  score: number;
  reason: string;
}

/**
 * Extract category keywords from product name/category
 */
function extractCategoryKeywords(product: Product): string[] {
  const text = `${product.name} ${product.category || ''}`.toLowerCase();
  const keywords: string[] = [];
  
  for (const category of Object.keys(CATEGORY_AFFINITY)) {
    if (text.includes(category)) {
      keywords.push(category);
    }
  }
  
  // Common product type keywords
  const additionalKeywords = [
    'dog', 'pet', 'puppy', 'travel', 'car', 'seat', 'cover', 'harness',
    'leash', 'collar', 'bed', 'blanket', 'mat', 'bowl', 'feeder', 'brush',
    'toy', 'chew', 'treat', 'safety', 'grooming', 'carrier', 'crate',
  ];
  
  for (const keyword of additionalKeywords) {
    if (text.includes(keyword) && !keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  }
  
  return keywords.length > 0 ? keywords : ['default'];
}

/**
 * Get price tier for a product
 */
function getPriceTier(price: number): keyof typeof PRICE_TIERS {
  if (price <= PRICE_TIERS.low.max) return 'low';
  if (price <= PRICE_TIERS.medium.max) return 'medium';
  if (price <= PRICE_TIERS.high.max) return 'high';
  return 'premium';
}

/**
 * Calculate affinity score between two products
 */
function calculateAffinityScore(
  mainProduct: Product,
  candidateProduct: Product
): number {
  const mainKeywords = extractCategoryKeywords(mainProduct);
  const candidateKeywords = extractCategoryKeywords(candidateProduct);
  
  let score = 0;
  
  // Check if candidate matches any affinity category
  for (const keyword of mainKeywords) {
    const affinities = CATEGORY_AFFINITY[keyword] || [];
    for (const candidateKeyword of candidateKeywords) {
      if (affinities.includes(candidateKeyword)) {
        score += 0.3;
      }
      // Same category bonus
      if (keyword === candidateKeyword) {
        score += 0.1;
      }
    }
  }
  
  return Math.min(score, 1);
}

/**
 * Calculate price compatibility score
 */
function calculatePriceScore(
  mainProduct: Product,
  candidateProduct: Product
): number {
  const tier = getPriceTier(mainProduct.price);
  const [minRange, maxRange] = PRICE_TIERS[tier].recommendedUpsellRange;
  
  const candidatePrice = candidateProduct.price;
  
  // Within ideal range = full score
  if (candidatePrice >= minRange && candidatePrice <= maxRange) {
    return 1;
  }
  
  // Slightly outside range
  if (candidatePrice < minRange) {
    return Math.max(0.3, 1 - (minRange - candidatePrice) / minRange);
  }
  
  if (candidatePrice > maxRange) {
    return Math.max(0.2, 1 - (candidatePrice - maxRange) / maxRange);
  }
  
  return 0.5;
}

/**
 * Calculate historical attach rate score
 */
function calculateAttachRateScore(product: Product): number {
  const keywords = extractCategoryKeywords(product);
  
  let maxRate = CATEGORY_ATTACH_RATES.default;
  for (const keyword of keywords) {
    const rate = CATEGORY_ATTACH_RATES[keyword] || 0;
    maxRate = Math.max(maxRate, rate);
  }
  
  return maxRate;
}

/**
 * Calculate cart context score
 */
function calculateCartContextScore(
  candidateProduct: Product,
  cartItems: CartItem[],
  cartValue: number
): number {
  if (cartItems.length === 0) return 0.5;
  
  // Don't recommend items already in cart
  if (cartItems.some(item => item.id === candidateProduct.id)) {
    return 0;
  }
  
  // Higher value carts → higher value upsells acceptable
  const avgItemValue = cartValue / cartItems.length;
  const priceRatio = candidateProduct.price / avgItemValue;
  
  // Ideal: upsell is 50-100% of average cart item
  if (priceRatio >= 0.5 && priceRatio <= 1.0) {
    return 1;
  }
  
  if (priceRatio < 0.5) {
    return 0.7;
  }
  
  if (priceRatio > 1.5) {
    return 0.4;
  }
  
  return 0.6;
}

/**
 * Get top upsell recommendations based on multiple scoring factors
 */
export function getUpsellRecommendations(
  input: RecommendationInput,
  maxRecommendations: number = 3
): ScoredProduct[] {
  const { currentProduct, availableProducts, cartItems = [], cartValue = 0 } = input;
  
  // Filter out current product and inactive products
  const candidates = availableProducts.filter(p => 
    p.id !== currentProduct.id && 
    p.is_active !== false &&
    p.price > 0
  );
  
  // Score each candidate
  const scoredProducts: ScoredProduct[] = candidates.map(candidate => {
    const affinityScore = calculateAffinityScore(currentProduct, candidate);
    const priceScore = calculatePriceScore(currentProduct, candidate);
    const attachRateScore = calculateAttachRateScore(candidate);
    const cartScore = calculateCartContextScore(candidate, cartItems, cartValue);
    
    // Weighted composite score
    const score = (
      affinityScore * 0.35 +
      priceScore * 0.25 +
      attachRateScore * 0.25 +
      cartScore * 0.15
    );
    
    // Determine primary reason
    let reason = 'Popular add-on';
    if (affinityScore > 0.5) {
      reason = 'Frequently bought together';
    } else if (attachRateScore > 0.3) {
      reason = 'Most customers add this';
    } else if (priceScore > 0.8) {
      reason = 'Great value addition';
    }
    
    return {
      ...candidate,
      score,
      reason,
    };
  });
  
  // Sort by score descending
  scoredProducts.sort((a, b) => b.score - a.score);
  
  // Return top recommendations
  return scoredProducts.slice(0, maxRecommendations);
}

/**
 * Get volume bundle recommendation based on price point
 */
export function getVolumeBundleConfig(price: number): {
  showVolume: boolean;
  tiers: { quantity: number; discount: number }[];
} {
  const tier = getPriceTier(price);
  
  // Volume bundles work best for medium-priced items
  if (tier === 'low') {
    return {
      showVolume: true,
      tiers: [
        { quantity: 1, discount: 0 },
        { quantity: 2, discount: 15 },
        { quantity: 3, discount: 25 },
      ],
    };
  }
  
  if (tier === 'medium') {
    return {
      showVolume: true,
      tiers: [
        { quantity: 1, discount: 0 },
        { quantity: 2, discount: 15 },
        { quantity: 3, discount: 25 },
      ],
    };
  }
  
  // Premium items: slightly lower discounts
  return {
    showVolume: true,
    tiers: [
      { quantity: 1, discount: 0 },
      { quantity: 2, discount: 10 },
      { quantity: 3, discount: 20 },
    ],
  };
}

/**
 * Get order bump recommendation
 */
export function getOrderBumpRecommendation(
  currentProduct: Product,
  availableProducts: Product[]
): Product | null {
  const recommendations = getUpsellRecommendations({
    currentProduct,
    availableProducts,
    cartItems: [],
    cartValue: currentProduct.price,
  }, 1);
  
  if (recommendations.length === 0) return null;
  
  // Order bump should be lower priced than main product
  const bump = recommendations[0];
  if (bump.price > currentProduct.price * 0.7) {
    // Find a cheaper alternative
    const cheaper = availableProducts.find(p => 
      p.id !== currentProduct.id &&
      p.is_active !== false &&
      p.price > 0 &&
      p.price <= currentProduct.price * 0.5
    );
    return cheaper || bump;
  }
  
  return bump;
}
