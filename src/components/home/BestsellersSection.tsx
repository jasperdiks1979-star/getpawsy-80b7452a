import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { BestsellersGridSkeleton } from './BestsellersSkeleton';
import { getCanonicalCardPrice } from '@/lib/canonical-pricing';

/**
 * Bestsellers Right Now — conversion-optimized product grid + scroll.
 */
export const BestsellersSection = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { addItem } = useCart();

  const { data: bestsellers, isLoading } = useQuery({
    queryKey: ['homepage-bestsellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bestsellers')
        .select(`
          *,
          products_public:product_id (
            id,
            name,
            price,
            compare_at_price,
            image_url,
            category,
            stock,
            variants
          )
        `)
        .eq('is_active', true)
        .order('rank', { ascending: true })
        .limit(8);

      if (error) throw error;

      return (data || []).filter(b => {
        const p = b.products_public;
        if (!p) return false;
        if (!p.image_url || p.image_url === '/placeholder.svg') return false;
        if (typeof p.stock === 'number' && p.stock <= 0) return false;
        if (typeof p.price !== 'number' || p.price <= 5 || p.price > 1500) return false;
        return true;
      });
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
              Bestsellers Right Now
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Popular items customers are currently ordering
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
            {bestsellers.slice(0, 8).map((bestseller) => {
              const product = bestseller.products_public;
              if (!product) return null;

              const canonical = getCanonicalCardPrice(product);
              const price = canonical.price;
              const imageUrl = product.image_url || '/placeholder.svg';
              const productName = bestseller.hero_headline || product.name || 'Product';
              const slug = bestseller.slug || product.id;

              return (
                <div
                  key={bestseller.id}
                  className="flex-shrink-0 w-[160px] md:w-[220px] snap-start flex flex-col"
                >
                  <Link
                    to={`/bestseller/${slug}`}
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
                      <p className="text-sm font-bold text-primary mt-1">
                        ${price.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">Estimated delivery: 5–10 business days</p>
                    </div>
                  </Link>
                  <button
                    onClick={() => {
                      addItem({
                        id: product.id,
                        name: product.name || 'Product',
                        price,
                        image: imageUrl,
                      });
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
              <Link to="/bestsellers">View All Bestsellers</Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};

export default BestsellersSection;
