import { useQuery } from '@tanstack/react-query';
import { getTopMoneyProducts, MONEY_PRODUCTS_QUERY_KEY } from '@/utils/moneyProductSelector';
import { Flame } from 'lucide-react';
import { getCanonicalCardPrice } from '@/lib/canonical-pricing';

export default function MostPopularMonthly() {
  const { data: products, isLoading, error } = useQuery({
    queryKey: MONEY_PRODUCTS_QUERY_KEY,
    queryFn: () => getTopMoneyProducts(12, 8),
    staleTime: 1000 * 60 * 30,
  });

  if (isLoading) {
    return (
      <section className="py-16 container px-4 md:px-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || !products || products.length < 8) {
    if (!import.meta.env.PROD) {
      console.error('[MostPopularMonthly] insufficient products for SEO block', error);
    }
    return null;
  }

  return (
    <section className="py-16 container px-4 md:px-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2.5 rounded-full bg-primary/10 border border-primary/20">
          <Flame className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Most Popular This Month
          </h2>
          <p className="text-sm text-muted-foreground">
            Top-rated products chosen by pet parents
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product, idx) => (
          <a
            key={product.id}
            href={`/product/${product.slug}`}
            className="group block bg-card rounded-xl border border-border/60 overflow-hidden hover:shadow-lg transition-shadow"
            data-seo-slot={`most-popular-${idx}`}
          >
            <div className="aspect-[4/5] overflow-hidden bg-muted">
              <img
                src={product.image_url || '/placeholder.svg'}
                alt={product.name}
                loading={idx < 4 ? 'eager' : 'lazy'}
                decoding="async"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <div className="p-3 space-y-1">
              <h3 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                {product.name}
              </h3>
              <p className="text-base font-bold text-primary">
                ${product.price.toFixed(2)}
              </p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
