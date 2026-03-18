import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Flame, Star, TrendingUp } from 'lucide-react';

/**
 * Dynamic homepage block — auto-populated with boosted "homepage_winner" products.
 * Falls back to top-viewed products if no winners are boosted.
 */
async function fetchWinners() {
  // First try boosted winners
  const { data: boosted } = await supabase
    .from('products')
    .select('id, name, slug, price, compare_at_price, image_url, view_count, average_rating')
    .eq('is_active', true)
    .eq('custom_label_5', 'homepage_winner')
    .order('view_count', { ascending: false })
    .limit(4);

  if (boosted && boosted.length >= 4) return boosted;

  // Fallback: top viewed products
  const { data: fallback } = await supabase
    .from('products')
    .select('id, name, slug, price, compare_at_price, image_url, view_count, average_rating')
    .eq('is_active', true)
    .order('view_count', { ascending: false })
    .limit(4);

  return fallback ?? [];
}

const urgencyTags = ['Selling Fast', 'Popular Pick', 'Top Rated', 'Trending'];

export const TrendingWinnersBlock = memo(() => {
  const { data: winners = [] } = useQuery({
    queryKey: ['homepage-winners'],
    queryFn: fetchWinners,
    staleTime: 10 * 60 * 1000,
  });

  if (!winners.length) return null;

  return (
    <section className="py-10 bg-accent/30">
      <div className="container px-4">
        <div className="flex items-center gap-2 mb-6">
          <Flame className="h-5 w-5 text-destructive" />
          <h2 className="text-xl font-bold">Trending Right Now</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {winners.map((p: any, i: number) => (
            <Link
              key={p.id}
              to={`/product/${p.slug}`}
              className="group rounded-xl border bg-card p-3 hover:shadow-md transition-shadow flex flex-col"
            >
              {/* Urgency tag */}
              <div className="flex justify-between items-start mb-2">
                <Badge variant="secondary" className="text-[10px] gap-1 bg-destructive/10 text-destructive border-destructive/20">
                  <TrendingUp className="h-3 w-3" />
                  {urgencyTags[i % urgencyTags.length]}
                </Badge>
                {i === 0 && (
                  <Badge className="text-[10px] bg-primary text-primary-foreground">🔥 Best Seller</Badge>
                )}
              </div>

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
              <h3 className="text-sm font-medium line-clamp-2 mb-1">{p.name}</h3>

              {/* Rating */}
              {(p.average_rating ?? 0) > 0 && (
                <div className="flex items-center gap-1 mb-2">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-xs text-muted-foreground">{Number(p.average_rating).toFixed(1)}</span>
                </div>
              )}

              {/* Price */}
              <div className="flex items-center gap-2 mt-auto mb-2">
                <span className="text-sm font-bold text-foreground">${Number(p.price).toFixed(2)}</span>
                {p.compare_at_price && Number(p.compare_at_price) > Number(p.price) && (
                  <span className="text-xs line-through text-muted-foreground">${Number(p.compare_at_price).toFixed(2)}</span>
                )}
              </div>

              {/* CTA */}
              <Button size="sm" variant="default" className="w-full text-xs mt-auto">
                View Deal
              </Button>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
});

TrendingWinnersBlock.displayName = 'TrendingWinnersBlock';
