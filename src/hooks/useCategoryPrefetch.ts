/**
 * Hook to prefetch category product data on hover/tap of category elements.
 * Uses AbortController to cancel in-flight requests on fast navigation.
 * Stores results in both memory (React Query) and IDB (persistent).
 */

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dedupeProducts } from '@/lib/dedupe-products';
import { prefetchCategoryToIDB } from '@/lib/category-cache-idb';

export function useCategoryPrefetch() {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const prefetchCategory = useCallback((categorySlug: string) => {
    // Cancel previous in-flight prefetch
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchFn = async () => {
      // Fetch categories to resolve slug → names
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id');

      if (controller.signal.aborted) return { products: [], total: 0 };

      const direct = categories?.find(c => c.slug === categorySlug);
      if (!direct) return { products: [], total: 0 };

      // Collect category names (including subcategories)
      const names: string[] = [direct.name];
      const collectChildren = (parentId: string) => {
        const children = categories?.filter(c => c.parent_id === parentId) || [];
        for (const child of children) {
          names.push(child.name);
          collectChildren(child.id);
        }
      };
      collectChildren(direct.id);

      if (controller.signal.aborted) return { products: [], total: 0 };

      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('is_active', true)
        .in('category', names)
        .order('created_at', { ascending: false })
        .limit(12);

      if (error) return { products: [], total: 0 };
      const products = dedupeProducts(data || []);
      return { products, total: products.length };
    };

    // Prefetch into React Query cache
    void queryClient.prefetchQuery({
      queryKey: ['category-products-fast', categorySlug],
      queryFn: async () => {
        const result = await fetchFn();
        return result.products;
      },
      staleTime: 2 * 60 * 1000,
    });

    // Also persist to IDB for instant paint on next visit
    void prefetchCategoryToIDB(categorySlug, fetchFn, controller.signal);
  }, [queryClient]);

  return { prefetchCategory };
}
