import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuickAdd } from '@/hooks/useQuickAdd';
import { BestsellersGridSkeleton } from './BestsellersSkeleton';
import { getCanonicalCardPrice } from '@/lib/canonical-pricing';
import { getTrustLabel } from '@/lib/trust-labels';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping-constants';

/**
 * Our Cat Essentials — curated hero/core range grid + scroll.
 * Source of truth: products_shop merch_role hero|core, ordered by merch_rank.
 * No sales-rank, popularity or review claim is rendered without real data.
 */
export const BestsellersSection = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const quickAdd = useQuickAdd();

  const { data: bestsellers, isLoading } = useQuery({
    queryKey: ['homepage-core-range'],
    queryFn: async () => {
      // Curated range only — hero + core roles from products_shop, ordered by the
      // merchandising rank we set. No sales-volume or popularity claim is made.
      const { data, error } = await supabase
        .from('products_shop')
        .select('id, name, slug, price, compare_at_price, image_url, category, stock, variants, merch_role, merch_rank')
        .in('merch_role', ['hero', 'core'])
        .order('merch_rank', { ascending: true })
        .limit(24);

      if (error) throw error;

      const rows = (data || []).filter((p) => {
        if (!p) return false;
        if (!p.image_url || p.image_url === '/placeholder.svg') return false;
        if (typeof p.price !== 'number' || p.price <= 5 || p.price > 1500) return false;
        return true;
      });

      // Only render a rating when real reviews exist (no fabricated stars).
      const ids = rows.map((p) => p.id).filter(Boolean);
      const ratingByProduct: Record<string, { avg: number; count: number }> = {};
      if (ids.length) {
        const { data: revs } = await supabase
          .from('product_reviews')
          .select('product_id, rating')
          .in('product_id', ids);
        (revs || []).forEach((r: any) => {
          const k = r.product_id as string;
          if (!ratingByProduct[k]) ratingByProduct[k] = { avg: 0, count: 0 };
          ratingByProduct[k].avg += Number(r.rating) || 0;
          ratingByProduct[k].count += 1;
        });
        Object.keys(ratingByProduct).forEach((k) => {
          const r = ratingByProduct[k];
          r.avg = r.count > 0 ? r.avg / r.count : 0;
        });
      }
      return rows.slice(0, 8).map((p) => ({
        id: p.id,
        products_public: p,
        hero_headline: null as string | null,
        slug: p.slug,
        _rating: ratingByProduct[p.id] || null,
      }));
    },
  });

  if (!isLoading && (!bestsellers || bestsellers.length === 0)) return null;

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.7;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <section className="py-8 md:py-12">
      <div className="container px-4 md:px-6">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
              Our Cat Essentials
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              The core indoor-cat range we stock and ship from our US warehouse
            </p>
          </div>
          <div className="hidden md:flex gap-2">
            <button
              onClick={() => scroll('left')}
              className="w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center hover:bg-accent transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center hover:bg-accent transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isLoading && <BestsellersGridSkeleton count={4} />}

        {!isLoading && bestsellers && bestsellers.length > 0 && (
          <div
            ref={scrollRef}
            className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 -mx-4 px-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {bestsellers.slice(0, 8).map((bestseller, idx) => {
              const product = bestseller.products_public;
              if (!product) return null;

              const canonical = getCanonicalCardPrice(product);
              const price = canonical.price;
              const imageUrl = product.image_url || '/placeholder.svg';
              const productName = bestseller.hero_headline || product.name || 'Product';
              const slug = (product as any).slug || bestseller.slug || product.id;
              const rating: { avg: number; count: number } | null = (bestseller as any)._rating;

              return (
                <div
                  key={bestseller.id}
                  className="flex-shrink-0 w-[160px] md:w-[220px] snap-start flex flex-col"
                >
                  <Link
                    to={`/products/${slug}`}
                    className="group flex flex-col rounded-2xl border border-border/40 bg-card overflow-hidden hover:shadow-md transition-shadow flex-1"
                  >
                    <div className="aspect-square overflow-hidden bg-muted">
                      <img
                        src={imageUrl}
                        alt={productName}
                        width={220}
                        height={220}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                      />
                    </div>
                    <div className="p-3 flex flex-col flex-1">
                      <h3 className="font-semibold text-xs md:text-sm text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                        {productName}
                      </h3>
                      {rating && rating.count > 0 ? (
                        <p
                          className="text-[11px] font-medium text-amber-600 mt-1 inline-flex items-center gap-1"
                          aria-label={`Rated ${rating.avg.toFixed(1)} out of 5 from ${rating.count} verified reviews`}
                        >
                          <span aria-hidden="true">★</span>
                          <span>{rating.avg.toFixed(1)}</span>
                          <span className="text-muted-foreground font-normal">
                            ({rating.count} verified)
                          </span>
                        </p>
                      ) : (
                        getTrustLabel(product.id, idx) ? <p className="text-[10px] text-primary/80 font-medium mt-1">{getTrustLabel(product.id, idx)}</p> : null
                      )}
                      <p className="text-sm font-bold text-primary mt-1">
                        ${price.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">Free shipping over ${FREE_SHIPPING_THRESHOLD}</p>
                    </div>
                  </Link>
                  <button
                    onClick={() => {
                      quickAdd(
                        {
                          id: product.id,
                          slug: (product as any).slug ?? undefined,
                          name: product.name || 'Product',
                          price,
                          image_url: imageUrl,
                          variants: (product as { variants?: unknown }).variants ?? [],
                        },
                        { displayPrice: price },
                      );
                    }}
                    className="w-full mt-2 py-2.5 text-xs font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Add to Cart
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && bestsellers && bestsellers.length > 0 && (
          <div className="text-center mt-6">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/bestsellers">View all our picks</Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};

export default BestsellersSection;
