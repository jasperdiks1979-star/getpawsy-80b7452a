import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ProductRating {
  productId: string;
  averageRating: number;
  reviewCount: number;
}

interface RatingsMap {
  [productId: string]: ProductRating;
}

export const useProductRatings = (productIds: string[]) => {
  return useQuery({
    queryKey: ['product-ratings', productIds.sort().join(',')],
    queryFn: async (): Promise<RatingsMap> => {
      if (productIds.length === 0) return {};

      const { data, error } = await supabase
        .from('product_reviews')
        .select('product_id, rating')
        .in('product_id', productIds);

      if (error) throw error;

      const ratingsMap: RatingsMap = {};

      // Group reviews by product_id
      const groupedReviews: { [key: string]: number[] } = {};
      data?.forEach((review) => {
        if (!groupedReviews[review.product_id]) {
          groupedReviews[review.product_id] = [];
        }
        groupedReviews[review.product_id].push(review.rating);
      });

      // Calculate averages
      Object.entries(groupedReviews).forEach(([productId, ratings]) => {
        const sum = ratings.reduce((a, b) => a + b, 0);
        ratingsMap[productId] = {
          productId,
          averageRating: sum / ratings.length,
          reviewCount: ratings.length,
        };
      });

      return ratingsMap;
    },
    enabled: productIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useSingleProductRating = (productId: string) => {
  return useQuery({
    queryKey: ['product-rating', productId],
    queryFn: async (): Promise<ProductRating | null> => {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('rating')
        .eq('product_id', productId);

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const sum = data.reduce((a, b) => a + b.rating, 0);
      return {
        productId,
        averageRating: sum / data.length,
        reviewCount: data.length,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
};
