/**
 * RecommendedProductsBlock — contextual product recommendations for guide/blog pages.
 * 
 * Renders 4–8 related products as crawlable <a> links within the same silo.
 * Used on guide pages, collection pages, and blog posts to strengthen internal linking.
 */

import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeProduct, SafeProduct } from '@/lib/safe-render';

const ProductCard = lazy(() =>
  import('@/components/products/ProductCard').then(m => ({ default: m.ProductCard }))
);

interface RecommendedProductsBlockProps {
  /** Category names to filter by */
  categories: string[];
  /** Heading text */
  title?: string;
  /** Max products to show */
  limit?: number;
  /** Optional className */
  className?: string;
}

export function RecommendedProductsBlock({
  categories,
  title = 'Recommended Products',
  limit = 8,
  className = '',
}: RecommendedProductsBlockProps) {
  const { data: products } = useQuery({
    queryKey: ['recommended-products', categories.join(','), limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id,name,slug,image_url,price,compare_at_price,category,stock,is_active,created_at,updated_at')
        .eq('is_active', true)
        .gt('stock', 0)
        .in('category', categories)
        .order('price', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || [])
        .map(p => safeProduct(p))
        .filter((p): p is SafeProduct => p !== null && !!p.image_url && !!p.name && p.price > 0);
    },
    staleTime: 10 * 60 * 1000,
  });

  if (!products || products.length < 2) return null;

  return (
    <section className={`py-10 ${className}`}>
      <h2 className="text-2xl font-display font-bold mb-6">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Suspense fallback={null}>
          {products.map(product => (
            <ProductCard key={product.id} product={product as any} />
          ))}
        </Suspense>
      </div>
    </section>
  );
}
