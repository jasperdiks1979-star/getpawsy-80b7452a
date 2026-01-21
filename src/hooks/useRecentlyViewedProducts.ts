import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRecentlyViewed } from './useRecentlyViewed';

interface RecentlyViewedProduct {
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
  created_at: string | null;
  updated_at: string | null;
}

interface UseRecentlyViewedProductsOptions {
  excludeProductId?: string;
  maxItems?: number;
}

/**
 * Hook to fetch recently viewed products with React Query caching
 * Combines localStorage IDs with database product data
 */
export const useRecentlyViewedProducts = ({
  excludeProductId,
  maxItems = 8,
}: UseRecentlyViewedProductsOptions = {}) => {
  const { getRecentlyViewedIds } = useRecentlyViewed();
  const recentlyViewedIds = getRecentlyViewedIds(excludeProductId);

  return useQuery({
    queryKey: ['recently-viewed-products', recentlyViewedIds.join(','), maxItems],
    queryFn: async (): Promise<RecentlyViewedProduct[]> => {
      if (recentlyViewedIds.length === 0) return [];

      const idsToFetch = recentlyViewedIds.slice(0, maxItems);

      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('is_active', true)
        .in('id', idsToFetch);

      if (error) throw error;
      if (!data) return [];

      // Sort by the order in recentlyViewedIds to maintain viewing order
      const sortedProducts = data.sort((a, b) => 
        idsToFetch.indexOf(a.id) - idsToFetch.indexOf(b.id)
      );

      return sortedProducts as RecentlyViewedProduct[];
    },
    enabled: recentlyViewedIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes - balance freshness with performance
    gcTime: 15 * 60 * 1000, // 15 minutes garbage collection
  });
};
