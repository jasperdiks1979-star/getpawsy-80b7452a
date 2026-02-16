/**
 * Fast category-specific product query.
 * 
 * On /products?category=<slug>, this hook runs a targeted DB query
 * that fetches ONLY products matching the category or its subcategories.
 * Returns results much faster than loading the full catalog and filtering in JS.
 * 
 * Used as the primary data source on category routes so the grid
 * can paint within ~1-1.5s instead of waiting ~3-4s for the full catalog.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { dedupeProducts } from '@/lib/dedupe-products';
import { getCachedCategoryProducts, setCachedCategoryProducts } from '@/lib/category-cache-idb';
import { markProductsLoadEnd, markProductsLoadStart, markProductsFetchInitiated } from '@/lib/grid-timing';

/**
 * Resolves a category slug to matching category names (including subcategories).
 * Example: "small-pets" → ["Hamster Cages", "Hamster Wheels", "Rabbit Cages"]
 * Example: "dog-beds" → ["Dog Beds"]
 */
async function resolveCategoryNames(slug: string): Promise<string[]> {
  // Fetch category tree
  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id');
  
  if (error || !categories) return [];

  // Find direct match by slug
  const direct = categories.find(c => c.slug === slug);
  if (!direct) {
    // Try fuzzy: slug "small-pets" → name contains each word
    const words = slug.split('-').filter(w => w.length > 1);
    const fuzzy = categories.find(c => 
      words.every(w => c.name.toLowerCase().includes(w)) ||
      words.every(w => c.slug.includes(w))
    );
    if (!fuzzy) return [];
    return collectCategoryNames(fuzzy, categories);
  }

  return collectCategoryNames(direct, categories);
}

function collectCategoryNames(
  category: { id: string; name: string; slug: string; parent_id: string | null },
  allCategories: Array<{ id: string; name: string; slug: string; parent_id: string | null }>
): string[] {
  const names: string[] = [category.name];
  
  // Collect all descendant category names (subcategories)
  const collectChildren = (parentId: string) => {
    const children = allCategories.filter(c => c.parent_id === parentId);
    for (const child of children) {
      names.push(child.name);
      collectChildren(child.id);
    }
  };
  
  collectChildren(category.id);
  return names;
}

export function useCategoryProducts(categorySlug: string | null) {
  const queryClient = useQueryClient();
  const idbChecked = useRef(false);

  // Seed React Query cache from IDB on mount (instant first paint)
  useEffect(() => {
    if (!categorySlug || idbChecked.current) return;
    idbChecked.current = true;
    getCachedCategoryProducts(categorySlug).then(cached => {
      if (cached && cached.products.length > 0) {
        // Only seed if React Query doesn't already have data
        const existing = queryClient.getQueryData(['category-products-fast', categorySlug]);
        if (!existing) {
          queryClient.setQueryData(['category-products-fast', categorySlug], cached.products);
          markProductsLoadEnd('idb-cache');
        }
      }
    });
  }, [categorySlug, queryClient]);

  return useQuery({
    queryKey: ['category-products-fast', categorySlug],
    queryFn: async () => {
      if (!categorySlug) return null;
      markProductsFetchInitiated();
      markProductsLoadStart();

      // Step 1: Resolve slug to actual category names (including children)
      const categoryNames = await resolveCategoryNames(categorySlug);
      
      if (categoryNames.length === 0) return [];

      // Step 2: Query products matching any of these category names
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('is_active', true)
        .in('category', categoryNames)
        .order('created_at', { ascending: false })
        .limit(24);

      if (error) throw error;
      const products = dedupeProducts(data || []);
      markProductsLoadEnd('category-fast');

      // Persist to IDB for instant paint on next visit
      void setCachedCategoryProducts(categorySlug, products, products.length);

      return products;
    },
    enabled: !!categorySlug,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
