/**
 * BlogProductInjector — Auto blog↔product linking.
 * Renders a block of 2 cluster-matched products inside blog content.
 * Lazy-loaded, max 2 per article, no duplicate products per page.
 */

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { getCluster } from '@/lib/cluster-config';
import { calculateSellingPrice } from '@/lib/pricing';

interface BlogProductInjectorProps {
  clusterId: string | null | undefined;
  excludeProductIds?: string[];
  /** Unique key for dedup across multiple injectors on same page */
  injectorIndex?: number;
}

export const BlogProductInjector = memo(function BlogProductInjector({
  clusterId,
  excludeProductIds = [],
  injectorIndex = 0,
}: BlogProductInjectorProps) {
  const cluster = getCluster(clusterId);

  const { data: products } = useQuery({
    queryKey: ['blog-product-inject', clusterId, injectorIndex],
    queryFn: async () => {
      if (!clusterId) return [];
      const { data } = await supabase
        .from('products_public')
        .select('id, name, slug, image_url, price, compare_at_price, category')
        .eq('cluster_primary', clusterId)
        .eq('is_active', true)
        .eq('is_duplicate', false)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (!data) return [];

      // Filter out excluded IDs and pick 2 with offset for dedup
      const filtered = data.filter(p => !excludeProductIds.includes(p.id));
      const offset = injectorIndex * 2;
      return filtered.slice(offset, offset + 2);
    },
    enabled: !!clusterId,
    staleTime: 10 * 60 * 1000,
  });

  if (!cluster || !products || products.length === 0) return null;

  return (
    <aside
      className="my-8 p-4 rounded-2xl border border-border bg-card/50 not-prose"
      aria-label={`Recommended ${cluster.shortLabel} products`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{cluster.icon}</span>
        <h4 className="text-sm font-semibold text-foreground">
          Top Picks: {cluster.shortLabel}
        </h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {products.map((product) => {
          const priceData = calculateSellingPrice(Number(product.price));
          const price = priceData.sellingPrice;
          const comparePrice = product.compare_at_price ? Number(product.compare_at_price) : null;
          const slug = product.slug || product.id;

          return (
            <Link
              key={product.id}
              to={`/products/${slug}`}
              className="group flex gap-3 p-2 rounded-xl hover:bg-accent/50 transition-colors"
            >
              {product.image_url && (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                  loading="lazy"
                  width={56}
                  height={56}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                  {product.name}
                </p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-sm font-bold text-primary">
                    ${price.toFixed(2)}
                  </span>
                  {comparePrice && comparePrice > price && (
                    <span className="text-xs text-muted-foreground line-through">
                      ${comparePrice.toFixed(2)}
                    </span>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-primary font-medium mt-1">
                  View Product <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
});
