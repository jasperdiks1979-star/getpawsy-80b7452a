import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PrefetchOptions {
  productId: string;
  productSlug?: string | null;
  category?: string | null;
}

export const useProductPrefetch = () => {
  const queryClient = useQueryClient();

  const prefetchProduct = useCallback(({ productId, productSlug, category }: PrefetchOptions) => {
    const productIdentifier = productSlug || productId;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productIdentifier);
    
    // Prefetch product detail data using 'products' table (same as ProductDetail page)
    void queryClient.prefetchQuery({
      queryKey: ['product', productIdentifier],
      queryFn: async () => {
        if (isUUID) {
          const { data } = await supabase
            .from('products')
            .select('*')
            .eq('id', productIdentifier)
            .maybeSingle();
          return data;
        }
        
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('slug', productIdentifier)
          .maybeSingle();
        return data;
      },
      staleTime: 5 * 60 * 1000,
    });

    // Prefetch related products if category available
    if (category) {
      void queryClient.prefetchQuery({
        queryKey: ['related-products', productId, category],
        queryFn: async () => {
          const { data } = await supabase
            .from('products')
            .select('*')
            .eq('category', category)
            .neq('id', productId)
            .eq('is_active', true)
            .limit(8);
          
          return data || [];
        },
        staleTime: 10 * 60 * 1000,
      });
    }
  }, [queryClient]);

  return { prefetchProduct };
};




