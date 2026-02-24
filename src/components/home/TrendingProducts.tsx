import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { HomeProductGridSection } from './HomeProductGridSection';

const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

/**
 * TrendingProducts — crawl-optimized "Best Sellers" product grid.
 * Uses real <a href="/product/..."> links for SEO crawl depth.
 */
export function TrendingProducts() {
  const { data: products, isLoading } = useQuery({
    queryKey: ['trending-products-seo'],
    queryFn: async () => {
      const supabase = await getSupabase();
      // Only show products from focused niches (Cat Trees & Small Animal Cages)
      const FOCUS_CATEGORIES = ['Cat Trees & Condos', 'Cat Furniture', 'Hamster Cages', 'Rabbit Cages'];

      // Prefer bestsellers table for true best-seller ordering
      const { data: bestsellers } = await supabase
        .from('bestsellers')
        .select('product_id, rank, products:product_id (id, name, slug, image_url, price, category)')
        .eq('is_active', true)
        .order('rank', { ascending: true })
        .limit(30);

      if (bestsellers && bestsellers.length > 0) {
        const focused = bestsellers
          .map((b: any) => b.products)
          .filter((p: any) => p && p.slug && p.name && FOCUS_CATEGORIES.includes(p.category));
        if (focused.length >= 4) return focused.slice(0, 12);
      }

      // Fallback: focused niche products
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, image_url, price, category')
        .eq('is_active', true)
        .in('category', FOCUS_CATEGORIES)
        .order('price', { ascending: false })
        .limit(16);
      if (error) throw error;
      return (data || []).filter(p => !!p.slug && !!p.name);
    },
    staleTime: 10 * 60 * 1000,
  });

  const items = useMemo(() => (products || []).slice(0, 12), [products]);

  if (!isLoading && products && products.length < 8) {
    console.error(`TrendingProducts: only ${products.length} products (minimum 8 for SEO crawl depth)`);
  }

  if (isLoading) {
    return (
      <section className="py-14 md:py-16">
        <div className="container px-4 md:px-6">
          <div className="h-8 w-56 bg-muted rounded mb-8 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-muted animate-pulse" style={{ aspectRatio: '3/4' }} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <HomeProductGridSection
      title="Best Sellers"
      subtitle="Our most popular products — loved by pet owners across the US"
      products={items}
      trackingKey="best-sellers"
      seeAllHref="/bestsellers"
      seeAllLabel="Shop All Best Sellers"
    />
  );
}

export default TrendingProducts;
