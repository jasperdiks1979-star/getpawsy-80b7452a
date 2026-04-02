import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dedupeProducts } from '@/lib/dedupe-products';
import { getCuratedCompanions } from '@/config/dog-bed-companions';

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

interface UseRelatedProductsOptions {
  productId: string;
  category: string | null;
  productName?: string;
  maxItems?: number;
  enabled?: boolean;
  /** Recently viewed IDs (required to ensure stable hook count) */
  recentlyViewedIds: string[];
}

interface BrowsingContext {
  recentlyViewedCategories: string[];
}

/**
 * Extracts potential tags/keywords from a product name
 * E.g., "Premium Orthopedic Dog Bed" -> ["premium", "orthopedic", "dog", "bed"]
 */
const extractKeywords = (name: string): string[] => {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'as', 'is', 'was', 'are', 'were', 'been', 'be',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
    'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'all',
    'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'set', 'pack', 'pcs', 'piece', 'pieces', 'size', 'color',
  ]);

  const petKeywords = new Set([
    'dog', 'cat', 'pet', 'puppy', 'kitten', 'bird', 'fish', 'rabbit',
    'hamster', 'guinea', 'pig', 'reptile', 'turtle', 'parrot', 'canine', 'feline',
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
 * Scores a product based on relevance to keywords and browsing context
 */
const scoreProduct = (
  product: ProductPublic,
  keywords: string[],
  category: string | null,
  browsingContext?: BrowsingContext
): number => {
  let score = 0;
  const productName = product.name.toLowerCase();
  const productCategory = product.category?.toLowerCase() || '';

  // Category match gives highest score
  if (category && productCategory === category.toLowerCase()) {
    score += 50;
  }

  // Check keyword matches in product name
  keywords.forEach(keyword => {
    if (productName.includes(keyword)) {
      score += 10;
    }
  });

  // Bonus for similar category type (e.g., both dog products)
  const petTypes = ['dog', 'cat', 'bird', 'fish', 'rabbit', 'hamster'];
  petTypes.forEach(pet => {
    if (category?.toLowerCase().includes(pet) && productCategory.includes(pet)) {
      score += 20;
    }
  });

  // PERSONALIZATION: Boost products from recently viewed categories
  if (browsingContext?.recentlyViewedCategories.includes(productCategory)) {
    score += 15;
  }

  return score;
};

/**
 * Hook to fetch related products with enhanced category and keyword matching
 * 
 * IMPORTANT: You must provide recentlyViewedIds from the parent component
 * using useRecentlyViewed().getRecentlyViewedIds() to ensure stable hook count
 */
export const useRelatedProducts = ({
  productId,
  category,
  productName = '',
  maxItems = 8,
  enabled = true,
  recentlyViewedIds,
}: UseRelatedProductsOptions) => {
  return useQuery({
    queryKey: ['related-products-enhanced', productId, category, maxItems, recentlyViewedIds.slice(0, 5).join(',')],
    queryFn: async () => {
      const keywords = extractKeywords(productName);

      // Build browsing context for personalization
      let browsingContext: BrowsingContext = { recentlyViewedCategories: [] };
      
      if (recentlyViewedIds.length > 0) {
        const { data: viewedProducts } = await supabase
          .from('products_public')
          .select('category')
          .in('id', recentlyViewedIds.slice(0, 10));

        if (viewedProducts) {
          browsingContext.recentlyViewedCategories = viewedProducts
            .map(p => p.category?.toLowerCase())
            .filter((c): c is string => !!c);
        }
      }
      
      // Fetch products from same category and potentially related categories
      const { data: categoryProducts, error: catError } = await supabase
        .from('products_public')
        .select('*')
        .eq('is_active', true)
        .neq('id', productId)
        .limit(60);
      
      if (catError) throw catError;
      if (!categoryProducts || categoryProducts.length === 0) return [];

      // Score and sort products by relevance with personalization
      const scoredProducts = categoryProducts
        .map(product => ({
          product,
          score: scoreProduct(product, keywords, category, browsingContext),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxItems)
        .map(({ product }) => product);

      // If we don't have enough related products, fill with category matches
      if (scoredProducts.length < maxItems && category) {
        const existingIds = new Set(scoredProducts.map(p => p.id));
        
        const { data: fallbackProducts } = await supabase
          .from('products_public')
          .select('*')
          .eq('is_active', true)
          .eq('category', category)
          .neq('id', productId)
          .limit(maxItems - scoredProducts.length + 5);
        
        if (fallbackProducts) {
          fallbackProducts.forEach(p => {
            if (!existingIds.has(p.id) && scoredProducts.length < maxItems) {
              scoredProducts.push(p);
              existingIds.add(p.id);
            }
          });
        }
      }

      return dedupeProducts(scoredProducts);
    },
    enabled: enabled && !!productId,
    staleTime: 10 * 60 * 1000, // 10 minutes - increased for better caching
    gcTime: 30 * 60 * 1000, // 30 minutes garbage collection time
  });
};
