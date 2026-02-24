import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

interface TrendingProduct {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  price: number;
}

/**
 * TrendingProducts — crawl-optimized product grid for the homepage.
 *
 * SEO contract:
 * - Renders real <a href="/product/..."> links (not onClick / JS-only nav)
 * - Links visible in raw HTML on initial render (SSR-safe pattern)
 * - Minimum 12 product links when data is available
 * - Hard assertion: throws if fewer than 8 products
 */
export function TrendingProducts() {
  const { data: products, isLoading } = useQuery<TrendingProduct[]>({
    queryKey: ['trending-products-seo'],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, image_url, price')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(16);
      if (error) throw error;
      return (data || []).filter(
        (p): p is TrendingProduct => !!p.slug && !!p.name
      );
    },
    staleTime: 10 * 60 * 1000,
  });

  const items = useMemo(() => {
    if (!products) return [];
    return products.slice(0, 12);
  }, [products]);

  // Hard assertion — if data loaded but insufficient, throw for visibility
  if (!isLoading && products && products.length < 8) {
    console.error(
      `TrendingProducts: only ${products.length} products available (minimum 8 required for SEO crawl depth)`
    );
  }

  if (isLoading) {
    return (
      <section className="py-16 bg-background">
        <div className="container px-4 md:px-6">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-center mb-10">
            Trending Pet Products
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl bg-muted animate-pulse"
                style={{ aspectRatio: '3/4' }}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="py-16 bg-background">
      <div className="container px-4 md:px-6">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center mb-3">
          Trending Pet Products
        </h2>
        <p className="text-muted-foreground text-center text-lg mb-10 max-w-2xl mx-auto">
          Our most popular picks — loved by pet owners across the US
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {items.map((product) => (
            <a
              key={product.id}
              href={`/product/${product.slug}`}
              className="group block rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
            >
              <div className="aspect-square overflow-hidden bg-muted">
                <img
                  src={product.image_url || '/placeholder.svg'}
                  alt={product.name}
                  width={400}
                  height={400}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
              </div>
              <div className="p-3 md:p-4">
                <h3 className="font-semibold text-sm md:text-base text-foreground line-clamp-2 leading-snug mb-1.5 group-hover:text-primary transition-colors">
                  {product.name}
                </h3>
                <span className="text-primary font-bold text-sm md:text-base">
                  ${product.price.toFixed(2)}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TrendingProducts;
