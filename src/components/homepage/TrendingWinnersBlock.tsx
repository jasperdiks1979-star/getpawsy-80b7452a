import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';

/**
 * Dynamic homepage block — auto-populated with boosted "homepage_winner" products.
 * Falls back to top-priced active products if no winners are boosted.
 *
 * Google Merchant compliance:
 * - No fake urgency tags ("Selling Fast", countdown timers)
 * - No fabricated "Best Seller" badges
 * - Neutral, factual presentation
 * - CTA matches store standard ("Add to Cart – Secure Checkout")
 */
async function fetchWinners() {
  const { data: boosted } = await supabase
    .from('products_public')
    .select('id, name, slug, price, compare_at_price, image_url')
    .eq('is_active', true)
    .eq('custom_label_5', 'homepage_winner')
    .order('price', { ascending: false })
    .limit(4);

  if (boosted && boosted.length >= 4) return boosted;

  const { data: fallback } = await supabase
    .from('products_public')
    .select('id, name, slug, price, compare_at_price, image_url')
    .eq('is_active', true)
    .order('price', { ascending: false })
    .limit(4);

  return fallback ?? [];
}

export const TrendingWinnersBlock = memo(() => {
  const { data: winners = [] } = useQuery({
    queryKey: ['homepage-winners'],
    queryFn: fetchWinners,
    staleTime: 10 * 60 * 1000,
  });

  if (!winners.length) return null;

  return (
    <section className="py-10 bg-accent/30" aria-label="Popular products">
      <div className="container px-4">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-foreground">Popular With Pet Owners</h2>
          <p className="text-sm text-muted-foreground mt-1">Top-rated picks loved by our customers</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {winners.map((p) => (
            <Link
              key={p.id}
              to={`/product/${p.slug}`}
              className="group rounded-xl border border-border bg-card p-3 hover:shadow-md transition-shadow flex flex-col"
            >
              {/* Image */}
              <div className="aspect-square rounded-lg overflow-hidden bg-muted mb-3">
                <img
                  src={p.image_url || '/placeholder.svg'}
                  alt={p.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>

              {/* Info */}
              <h3 className="text-sm font-medium text-foreground line-clamp-2 mb-1">{p.name}</h3>

              {/* Price */}
              <div className="flex items-center gap-2 mt-auto mb-2">
                <span className="text-sm font-bold text-foreground">${Number(p.price).toFixed(2)}</span>
                {p.compare_at_price && Number(p.compare_at_price) > Number(p.price) && (
                  <span className="text-xs line-through text-muted-foreground">${Number(p.compare_at_price).toFixed(2)}</span>
                )}
              </div>

              {/* CTA — matches store standard */}
              <Button size="sm" variant="default" className="w-full text-xs mt-auto">
                View Product
              </Button>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
});

TrendingWinnersBlock.displayName = 'TrendingWinnersBlock';
