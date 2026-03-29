import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { HomeProductGridSection } from './HomeProductGridSection';

const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

/**
 * New Arrivals — fetches the 12 newest active products.
 * Renders real <a href> links for crawl discovery.
 */
export function NewArrivalsSection() {
  const { data: products, isLoading } = useQuery({
    queryKey: ['homepage-new-arrivals'],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, image_url, price, compare_at_price, variants, category, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(16);
      if (error) throw error;
      return (data || []).filter(p => !!p.slug && !!p.name);
    },
    staleTime: 10 * 60 * 1000,
  });

  const items = useMemo(() => (products || []).slice(0, 12), [products]);

  if (!isLoading && products && products.length < 8) {
    console.error(`NewArrivalsSection: only ${products.length} products (minimum 8 for SEO)`);
  }

  if (isLoading) {
    return (
      <section className="py-14 md:py-16">
        <div className="container px-4 md:px-6">
          <div className="h-8 w-48 bg-muted rounded mb-8 animate-pulse" />
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
      title="New Arrivals"
      subtitle="Just landed — the latest picks for your pet"
      products={items}
      trackingKey="new-arrivals"
      seeAllHref="/products?sort=newest"
      seeAllLabel="Shop All New"
    />
  );
}

export default NewArrivalsSection;
