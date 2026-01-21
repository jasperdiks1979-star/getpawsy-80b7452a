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

  // Fetch products for linking (products_public doesn't have slug, we generate from name)
  const { data: products = [] } = useQuery({
    queryKey: ['internal-linking-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, category')
        .eq('is_active', true)
        .limit(100);
      
      if (error) return [];
      // Generate slug from name if not available
      return (data || []).map(p => ({
        ...p,
        slug: p.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || null,
      })) as Product[];
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
