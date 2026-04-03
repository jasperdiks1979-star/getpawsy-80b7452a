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
    maxLinksPerKeyword = 2,
    maxTotalLinks = 20,
    minWordsBetweenLinks = 25,
    enabled = true,
  } = options;

  // Fetch products for linking - use products_public view which is publicly accessible
  const { data: products = [] } = useQuery({
    queryKey: ['internal-linking-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, category')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .limit(100);
      
      if (error) {
        console.error('Error fetching products for internal linking:', error);
        return [];
      }
      return (data || []) as Product[];
    },
    enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch categories for linking — only cats & dogs (our active verticals)
  const { data: categories = [] } = useQuery({
    queryKey: ['internal-linking-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug')
        .or('name.ilike.%dog%,name.ilike.%cat%,name.ilike.%pet%')
        .order('display_order', { ascending: true });
      
      if (error) return [];
      // Further filter: exclude non-pet verticals
      return ((data || []) as Category[]).filter(c => 
        !/(bird|reptile|fish|hamster|guinea|rabbit|chicken|small pet)/i.test(c.name)
      );
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  // Process content with internal links
  const processedContent = useMemo(() => {
    // Safety checks
    if (!content || typeof content !== 'string' || !enabled) {
      return content || '';
    }
    
    if (products.length === 0 && categories.length === 0) {
      return content;
    }

    try {
      return addInternalLinks(content, products, categories, {
        maxLinksPerKeyword,
        maxTotalLinks,
        minWordsBetweenLinks,
      });
    } catch (error) {
      console.error('Error processing internal links:', error);
      return content;
    }
  }, [content, products, categories, maxLinksPerKeyword, maxTotalLinks, minWordsBetweenLinks, enabled]);

  return {
    processedContent,
    hasLinks: processedContent !== content,
    productsCount: products.length,
    categoriesCount: categories.length,
  };
};
