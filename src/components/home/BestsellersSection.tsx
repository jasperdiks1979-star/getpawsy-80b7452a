import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { BestsellersGridSkeleton } from './BestsellersSkeleton';

/**
 * Bestsellers Section — clean grid of top-ranked products.
 * No fake badges, no 3D effects, no fabricated ratings.
 * Mobile-first: stable 2-col grid, no layout shifts.
 */
export const BestsellersSection = () => {
  const { data: bestsellers, isLoading } = useQuery({
    queryKey: ['homepage-bestsellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bestsellers')
        .select(`
          *,
          products:product_id (
            id,
            name,
            price,
            compare_at_price,
            image_url,
            category,
            stock
          )
        `)
        .eq('is_active', true)
        .order('rank', { ascending: true })
        .limit(8);

      if (error) throw error;

      // Filter: must have product, valid image, in stock, reasonable price
      return (data || []).filter(b => {
        const p = b.products;
        if (!p) return false;
        if (!p.image_url || p.image_url === '/placeholder.svg') return false;
        if (typeof p.stock === 'number' && p.stock <= 0) return false;
        if (typeof p.price !== 'number' || p.price <= 5 || p.price > 1500) return false;
        return true;
      });
    },
  });

  if (!isLoading && (!bestsellers || bestsellers.length === 0)) {
    return null;
  }

  return (
    <section className="pt-10 pb-12 md:pt-14 md:pb-16">
      <div className="container px-4 md:px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Bestsellers
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-lg mx-auto">
            Our most popular products — trusted by pet owners across the US.
          </p>
        </div>

        {/* Loading State */}
        {isLoading && <BestsellersGridSkeleton count={4} />}

        {/* Product Grid */}
        {!isLoading && bestsellers && bestsellers.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 max-w-6xl mx-auto">
            {bestsellers.slice(0, 8).map((bestseller, idx) => {
              const product = bestseller.products;
              if (!product) return null;

              const price = typeof product.price === 'number' ? product.price : 0;
              const comparePrice = typeof product.compare_at_price === 'number' ? product.compare_at_price : 0;
              const hasDiscount = comparePrice > price && comparePrice > 0;
              const discount = hasDiscount ? Math.round((1 - price / comparePrice) * 100) : 0;
              const imageUrl = product.image_url || '/placeholder.svg';
              const productName = product.name || 'Product';
              const slug = bestseller.slug || product.id;

              return (
                <Link
                  key={bestseller.id}
                  to={`/bestseller/${slug}`}
                  className="group flex flex-col rounded-xl border border-border/50 bg-card overflow-hidden hover:shadow-md transition-shadow duration-300"
                >
                  {/* Image */}
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    <img
                      src={imageUrl}
                      alt={productName}
                      width={400}
                      height={400}
                      loading={idx < 4 ? 'eager' : 'lazy'}
                      decoding="async"
                      fetchPriority={idx === 0 ? 'high' : 'auto'}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                    />
                    {discount > 0 && (
                      <span className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded">
                        -{discount}%
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-3 flex flex-col flex-1">
                    {product.category && (
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                        {product.category}
                      </span>
                    )}
                    <h3 className="font-semibold text-xs md:text-sm text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                      {bestseller.hero_headline || productName}
                    </h3>
                    <div className="flex items-baseline gap-1.5 mt-auto pt-2">
                      <span className="text-sm font-bold text-primary">
                        ${price.toFixed(2)}
                      </span>
                      {hasDiscount && (
                        <span className="text-[10px] text-muted-foreground line-through">
                          ${comparePrice.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* CTA */}
        {!isLoading && bestsellers && bestsellers.length > 0 && (
          <div className="text-center mt-8">
            <Button asChild variant="outline" className="gap-2 rounded-full">
              <Link to="/products">
                View All Products
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};

export default BestsellersSection;
