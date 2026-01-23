import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addInternalLinks } from '@/lib/internal-linking';

interface Product {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface UseInternalLinkingOptions {
  maxLinksPerKeyword?: number;
  maxTotalLinks?: number;
  minWordsBetweenLinks?: number;
  enabled?: boolean;
}

export const useInternalLinking = (
  content: string,
  options: UseInternalLinkingOptions = {}
) => {
  const {
    maxLinksPerKeyword = 1,
    maxTotalLinks = 8,
    minWordsBetweenLinks = 40,
    enabled = true,
  } = options;

  // Fetch products for linking - use products table which has actual slugs
  const { data: products = [] } = useQuery({
    queryKey: ['internal-linking-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, slug, category')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .limit(100);
      
      if (error) return [];
      return (data || []) as Product[];
    },
    enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch categories for linking
  const { data: categories = [] } = useQuery({
    queryKey: ['internal-linking-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug')
        .order('display_order', { ascending: true });
      
      if (error) return [];
      return (data || []) as Category[];
    },
    enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Process content with internal links
  const processedContent = useMemo(() => {
    if (!content || !enabled || (products.length === 0 && categories.length === 0)) {
      return content;
    }

    return addInternalLinks(content, products, categories, {
      maxLinksPerKeyword,
      maxTotalLinks,
      minWordsBetweenLinks,
    });
  }, [content, products, categories, maxLinksPerKeyword, maxTotalLinks, minWordsBetweenLinks, enabled]);

  return {
    processedContent,
    hasLinks: processedContent !== content,
    productsCount: products.length,
    categoriesCount: categories.length,
  };
};
