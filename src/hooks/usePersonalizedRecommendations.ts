import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dedupeProducts } from '@/lib/dedupe-products';
import { useRecentlyViewed } from './useRecentlyViewed';
import { useUserPurchaseHistory, getCategoryPreferences, getPurchasedProductIds } from './useUserPurchaseHistory';

interface ProductPublic {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  images: string[] | null;
  category: string | null;
  stock: number | null;
  is_active: boolean | null;
  slug?: string | null;
  variants: unknown;
}

interface PersonalizationContext {
  recentlyViewedIds: string[];
  recentlyViewedCategories: string[];
  purchasedCategories: Map<string, number>;
  purchasedProductIds: Set<string>;
}

interface UsePersonalizedRecommendationsOptions {
  currentProductId: string;
  currentCategory: string | null;
  currentProductName?: string;
  maxItems?: number;
  enabled?: boolean;
}

/**
 * Extracts keywords from product name for similarity matching
 */
const extractKeywords = (name: string): string[] => {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'as', 'is', 'was', 'are', 'were', 'been', 'be',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that',
    'set', 'pack', 'pcs', 'piece', 'pieces', 'size', 'color',
  ]);

  const petKeywords = new Set([
    'dog', 'cat', 'pet', 'puppy', 'kitten', 'bird', 'fish', 'rabbit',
    'hamster', 'guinea', 'pig', 'reptile', 'turtle', 'parrot',
  ]);

  const productTypeKeywords = new Set([
    'bed', 'toy', 'bowl', 'feeder', 'collar', 'leash', 'harness', 'carrier',
    'crate', 'kennel', 'brush', 'shampoo', 'treat', 'food', 'snack', 'ball',
    'rope', 'chew', 'scratcher', 'tree', 'litter', 'aquarium', 'cage', 'house',
  ]);

  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word =>
      word.length > 2 &&
      !stopWords.has(word) &&
      (petKeywords.has(word) || productTypeKeywords.has(word) || word.length > 4)
    );
};

/**
 * Scores a product based on personalization context
 */
const scoreProductPersonalized = (
  product: ProductPublic,
  keywords: string[],
  currentCategory: string | null,
  context: PersonalizationContext
): number => {
  let score = 0;
  const productName = product.name.toLowerCase();
  const productCategory = product.category?.toLowerCase() || '';

  // Skip already purchased products (they don't need to be recommended again)
  if (context.purchasedProductIds.has(product.id)) {
    return -1;
  }

  // 1. Category match with current product (base relevance)
  if (currentCategory && productCategory === currentCategory.toLowerCase()) {
    score += 40;
  }

  // 2. Keyword matches in product name
  keywords.forEach(keyword => {
    if (productName.includes(keyword)) {
      score += 8;
    }
  });

  // 3. PERSONALIZATION: Recently viewed category preference
  if (context.recentlyViewedCategories.includes(productCategory)) {
    score += 25;
  }

  // 4. PERSONALIZATION: Purchase history category preference
  const purchaseCategoryScore = context.purchasedCategories.get(productCategory);
  if (purchaseCategoryScore) {
    // Scale purchase preference (max +35 points)
    score += Math.min(35, purchaseCategoryScore * 20);
  }

  // 5. Pet type affinity (cross-category relevance)
  const petTypes = ['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster'];
  petTypes.forEach(pet => {
    // Check if user has shown preference for this pet type
    const hasRecentlyViewed = context.recentlyViewedCategories.some(c => c.includes(pet));
    const hasPurchased = Array.from(context.purchasedCategories.keys()).some(c => c.includes(pet));
    
    if ((hasRecentlyViewed || hasPurchased) && productCategory.includes(pet)) {
      score += 15;
    }
  });

  // 6. Complementary products boost (e.g., if viewing a bed, recommend toys)
  const complementaryPairs: Record<string, string[]> = {
    'bed': ['toy', 'blanket', 'pillow'],
    'toy': ['treat', 'ball', 'rope'],
    'food': ['bowl', 'feeder', 'treat'],
    'collar': ['leash', 'harness', 'tag'],
    'leash': ['collar', 'harness'],
    'grooming': ['brush', 'shampoo', 'nail'],
    'carrier': ['bed', 'blanket', 'travel'],
  };

  Object.entries(complementaryPairs).forEach(([mainType, complements]) => {
    if (currentCategory?.toLowerCase().includes(mainType)) {
      complements.forEach(complement => {
        if (productCategory.includes(complement) || productName.includes(complement)) {
          score += 12;
        }
      });
    }
  });

  return score;
};

/**
 * Hook for fetching personalized product recommendations
 */
export const usePersonalizedRecommendations = ({
  currentProductId,
  currentCategory,
  currentProductName = '',
  maxItems = 8,
  enabled = true,
}: UsePersonalizedRecommendationsOptions) => {
  const { getRecentlyViewedIds, recentlyViewed } = useRecentlyViewed();
  const { data: purchaseHistory = [] } = useUserPurchaseHistory();

  // Get recently viewed product IDs (excluding current)
  const recentlyViewedIds = getRecentlyViewedIds(currentProductId);

  return useQuery({
    queryKey: ['personalized-recommendations', currentProductId, currentCategory, maxItems, recentlyViewedIds.slice(0, 5).join(','), purchaseHistory.length],
    queryFn: async () => {
      const keywords = extractKeywords(currentProductName);

      // Build personalization context
      const purchasedCategories = getCategoryPreferences(purchaseHistory);
      const purchasedProductIds = getPurchasedProductIds(purchaseHistory);

      // Fetch recently viewed products to get their categories
      let recentlyViewedCategories: string[] = [];
      if (recentlyViewedIds.length > 0) {
        const { data: viewedProducts } = await supabase
          .from('products_public')
          .select('category')
          .in('id', recentlyViewedIds.slice(0, 10));

        if (viewedProducts) {
          recentlyViewedCategories = viewedProducts
            .map(p => p.category?.toLowerCase())
            .filter((c): c is string => !!c);
        }
      }

      const personalizationContext: PersonalizationContext = {
        recentlyViewedIds,
        recentlyViewedCategories,
        purchasedCategories,
        purchasedProductIds,
      };

      // Determine which categories to prioritize
      const priorityCategories = new Set<string>();
      if (currentCategory) priorityCategories.add(currentCategory.toLowerCase());
      recentlyViewedCategories.forEach(c => priorityCategories.add(c));
      purchasedCategories.forEach((_, category) => priorityCategories.add(category));

      // Fetch candidate products
      const { data: candidateProducts, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('is_active', true)
        .neq('id', currentProductId)
        .limit(100);

      if (error) throw error;
      if (!candidateProducts || candidateProducts.length === 0) return [];

      // Score and sort products
      const scoredProducts = candidateProducts
        .map(product => ({
          product,
          score: scoreProductPersonalized(product, keywords, currentCategory, personalizationContext),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxItems)
        .map(({ product }) => product);

      // If we don't have enough personalized results, fill with category matches
      if (scoredProducts.length < maxItems && currentCategory) {
        const existingIds = new Set(scoredProducts.map(p => p.id));

        const { data: fallbackProducts } = await supabase
          .from('products_public')
          .select('*')
          .eq('is_active', true)
          .eq('category', currentCategory)
          .neq('id', currentProductId)
          .limit(maxItems - scoredProducts.length + 5);

        if (fallbackProducts) {
          fallbackProducts.forEach(p => {
            if (!existingIds.has(p.id) && !purchasedProductIds.has(p.id) && scoredProducts.length < maxItems) {
              scoredProducts.push(p);
              existingIds.add(p.id);
            }
          });
        }
      }

      return dedupeProducts(scoredProducts);
    },
    enabled: enabled && !!currentProductId,
    staleTime: 3 * 60 * 1000, // 3 minutes (shorter for personalized content)
  });
};

/**
 * Get personalization stats for analytics
 */
export const usePersonalizationStats = () => {
  const { recentlyViewed } = useRecentlyViewed();
  const { data: purchaseHistory = [] } = useUserPurchaseHistory();

  const stats = {
    hasPersonalization: recentlyViewed.length > 0 || purchaseHistory.length > 0,
    recentlyViewedCount: recentlyViewed.length,
    purchaseHistoryCount: purchaseHistory.length,
    topCategories: Array.from(getCategoryPreferences(purchaseHistory).entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category]) => category),
  };

  return stats;
};
