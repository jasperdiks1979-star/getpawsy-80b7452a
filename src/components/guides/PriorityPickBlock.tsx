/**
 * PriorityPickBlock — answer-first commercial block for guide pages that
 * already receive genuine search/AI discovery traffic.
 *
 * Renders: a factual short answer, one live in-stock product (real price,
 * real availability, crawlable PDP link) and one contextual collection link.
 * Products resolve at runtime from products_public, so nothing here can go
 * stale relative to the storefront.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { Button } from '@/components/ui/button';
import { getPriorityPick } from '@/config/priority-landing-picks';

interface Props {
  slug?: string;
  /** When the guide already shows a quick answer, skip the duplicate sentence. */
  hideAnswer?: boolean;
}

export function PriorityPickBlock({ slug, hideAnswer }: Props) {

  const pick = getPriorityPick(slug);

  const { data: product } = useQuery({
    queryKey: ['priority-pick', slug],
    enabled: !!pick,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      if (!pick) return null;
      let q = supabase
        .from('products_public')
        .select('id,name,slug,image_url,price,category,stock')
        .eq('is_active', true)
        .gt('stock', 0)
        .not('slug', 'is', null)
        .or(pick.keywords.map(k => `name.ilike.%${k}%`).join(','));

      if (pick.categories?.length) q = q.in('category', pick.categories);
      if (pick.maxPrice) q = q.lte('price', pick.maxPrice);

      const { data, error } = await q.order('price', { ascending: true }).limit(12);
      if (error || !data?.length) return null;

      // Prefer the cheapest option with a real image (best entry-price impression).
      return data.find(p => !!p.image_url && !!p.slug && Number(p.price) > 0) ?? null;
    },
  });

  if (!pick) return null;

  return (
    <section className="mb-10 rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-5 md:p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-primary mb-2">
          Short answer
        </h2>
        <p className="text-base md:text-lg text-foreground leading-relaxed">{pick.answer}</p>
      </div>

      {product && (
        <div className="border-t border-border bg-muted/30 p-5 md:p-6 flex flex-col sm:flex-row gap-4">
          <Link
            to={`/products/${product.slug}`}
            className="sm:w-32 aspect-square rounded-xl overflow-hidden bg-background flex-shrink-0"
          >
            <OptimizedImage
              src={product.image_url as string}
              alt={product.name}
              aspectRatio="auto"
              containerClassName="w-full h-full"
            />
          </Link>

          <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Our pick from the GetPawsy store
              </p>
              <Link
                to={`/products/${product.slug}`}
                className="font-display font-bold text-foreground leading-snug hover:text-primary transition-colors line-clamp-2"
              >
                {product.name}
              </Link>
              <p className="text-lg font-bold text-foreground mt-1">
                ${Number(product.price).toFixed(2)}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <CheckCircle className="w-3.5 h-3.5 text-primary" />
                In stock — ships from our US-facing catalog
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link to={`/products/${product.slug}`}>
                <Button size="sm" className="gap-1.5 font-semibold">
                  {pick.ctaLabel || 'View product'} <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
              <Link
                to={`/collections/${pick.collection.slug}`}
                className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
              >
                <Package className="w-3.5 h-3.5" />
                {pick.collection.label}
              </Link>
            </div>
          </div>
        </div>
      )}

      {!product && (
        <div className="border-t border-border bg-muted/30 px-5 py-4">
          <Link
            to={`/collections/${pick.collection.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
          >
            <Package className="w-3.5 h-3.5" />
            {pick.collection.label}
          </Link>
        </div>
      )}
    </section>
  );
}
