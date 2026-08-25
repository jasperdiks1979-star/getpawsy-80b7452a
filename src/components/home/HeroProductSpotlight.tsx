import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import { buildOptimizedImageUrl, buildOptimizedSrcSet } from '@/lib/image-optimizer';

/**
 * First-Sale Strike — homepage hero product spotlight.
 *
 * The homepage previously led with a wall of mixed catalog rails whose
 * cheapest item was $250+, which gives a first-time US visitor no obvious,
 * affordable entry purchase. This block gives the store ONE clear, low-risk
 * first purchase with honest copy (no invented reviews, no fake urgency).
 *
 * Rollback: remove <HeroProductSpotlight /> from HomePage.tsx and delete
 * this file. No DB or analytics impact.
 */
const HERO_SLUG = 'wooden-door-mounted-cat-tree-wall-mounted-cat-tree';

const BULLETS = [
  'Solid wood wall shelf — frees up floor space in small apartments',
  'Gives indoor cats a safe high perch to climb and nap on',
  'Mounts to the wall or door frame; hardware included',
];

export function HeroProductSpotlight() {
  const { data: product } = useQuery({
    queryKey: ['hero-spotlight', HERO_SLUG],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('products_public')
        .select('name, slug, price, image_url, stock')
        .eq('slug', HERO_SLUG)
        .maybeSingle();
      return data;
    },
  });

  if (!product || !product.image_url || !product.stock) return null;
  const price = Number(product.price) || 0;
  const href = `/products/${product.slug}`;

  return (
    <section className="py-8 md:py-12 border-b border-border/40" aria-label="Featured product">
      <div className="container px-4 md:px-6">
        <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-center rounded-3xl border border-border/50 bg-card p-4 md:p-8">
          <Link to={href} className="block overflow-hidden rounded-2xl bg-muted/30">
            <img
              src={product.image_url}
              alt={product.name}
              width={800}
              height={800}
              loading="lazy"
              decoding="async"
              className="w-full h-auto aspect-square object-cover"
            />
          </Link>

          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Start here
            </p>
            <h2 className="mt-2 text-2xl md:text-3xl font-display font-bold text-foreground leading-tight">
              {product.name}
            </h2>
            <p className="mt-3 text-3xl font-semibold text-foreground">
              ${price.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Free US shipping on orders over $35 · 30-day returns
            </p>

            <ul className="mt-5 space-y-2">
              {BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" aria-hidden />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <Button asChild size="lg" className="mt-6 w-full sm:w-auto min-h-[52px] rounded-full px-8">
              <Link
                to={href}
                className="inline-flex items-center gap-2"
                onClick={() =>
                  trackEvent('hero_cta_click', {
                    cta_id: 'hero_product_spotlight',
                    destination: href,
                    location: 'homepage_spotlight',
                  })
                }
              >
                View product
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroProductSpotlight;
