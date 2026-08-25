import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, ShoppingCart, Truck, RotateCcw, ShieldCheck } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import { useCart } from '@/contexts/CartContext';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping-constants';



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

/**
 * The catalog's primary image for this product is a 365x365 text-heavy promo
 * graphic (supplier "Pinterest card"), which looked blurry and cheap when
 * scaled into the spotlight container. This is the sharpest clean lifestyle
 * photo in the same media set (582x481, no text overlay).
 */
const PREFERRED_IMAGE =
  'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/product-images/rehosted/0b041496-f7a3-480c-83bb-fdba8ae840f3/e81f19da761d852f.jpg';


export function HeroProductSpotlight() {
  const { addItem } = useCart();
  const { data: product } = useQuery({
    queryKey: ['hero-spotlight', HERO_SLUG],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('products_public')
        .select('id, name, slug, price, image_url, images, stock, category')
        .eq('slug', HERO_SLUG)
        .maybeSingle();
      return data;
    },
  });

  if (!product || !product.image_url || !product.stock) return null;
  const price = Number(product.price) || 0;
  const href = `/products/${product.slug}`;
  const shipsFree = price >= FREE_SHIPPING_THRESHOLD;


  const gallery = Array.isArray(product.images) ? (product.images as string[]) : [];
  const heroImage =
    gallery.find((u) => u === PREFERRED_IMAGE) || PREFERRED_IMAGE || product.image_url;

  return (
    <section className="py-8 md:py-12 border-b border-border/40" aria-label="Featured product">
      <div className="container px-4 md:px-6">
        <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-center rounded-3xl border border-border/50 bg-card p-4 md:p-8">
          <Link
            to={href}
            className="block overflow-hidden rounded-2xl bg-muted/20 mx-auto w-full max-w-[582px]"
          >
            {/* Served at native resolution (582x481) — no CDN downscale, no upscaling. */}
            <img
              src={heroImage}
              alt="Wooden wall-mounted cat perch with two cats resting on its shelves"
              width={582}
              height={481}
              loading="lazy"
              decoding="async"
              className="w-full h-auto aspect-[582/481] object-contain"
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
              {shipsFree
                ? 'This order ships free in the US · 30-day returns'
                : `Free US shipping on orders over $${FREE_SHIPPING_THRESHOLD} · 30-day returns`}
            </p>

            <ul className="mt-5 space-y-2">
              {BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" aria-hidden />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="w-full sm:w-auto min-h-[52px] rounded-full px-8 gap-2"
                onClick={() => {
                  addItem({
                    id: String(product.id),
                    slug: product.slug ?? undefined,
                    name: product.name,
                    price,
                    image: heroImage,
                    category: (product as { category?: string }).category,
                  });
                  trackEvent('hero_cta_click', {
                    cta_id: 'hero_product_spotlight_atc',
                    destination: '/cart',
                    location: 'homepage_spotlight',
                  });
                }}
              >
                <ShoppingCart className="w-4 h-4" aria-hidden />
                Add to cart — ${price.toFixed(2)}
              </Button>

              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto min-h-[52px] rounded-full px-8">
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
                  View details
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </Link>
              </Button>
            </div>

            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <li className="inline-flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-primary" aria-hidden /> Ships from our US-facing fulfilment network
              </li>
              <li className="inline-flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-primary" aria-hidden /> 30-day returns
              </li>
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" aria-hidden /> Secure Stripe checkout
              </li>
            </ul>
          </div>

        </div>
      </div>
    </section>
  );
}

export default HeroProductSpotlight;
