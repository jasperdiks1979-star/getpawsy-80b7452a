/**
 * TikTokPdpVariant — single-screen above-the-fold PDP for TikTok traffic.
 *
 * Gated by `useTikTokLanding().isTikTok`. Rendered INSTEAD of the canonical
 * PDP layout when active. The canonical PDP stays untouched for Google /
 * organic / Pinterest traffic.
 *
 * Above-the-fold ONLY:
 *   1. Hero image (eager, single)
 *   2. Title (clamped)
 *   3. Star rating
 *   4. Price (+ strike compare-at)
 *   5. One-line key benefit
 *   6. Free-shipping trust line
 *   7. Large Add-To-Cart
 *   8. Buy-Now (ATC → /checkout)
 *   9. Three trust badges
 *
 * Everything else (long description, FAQs, specs, guides, reviews list,
 * upsells) is moved into a collapsed <details> below the fold so it stays
 * crawlable + accessible without competing with the buy box.
 *
 * Tracking emitted (additive, never blocks UX):
 *   - tiktok_pdp_buy_box_visible (once, when sticky buy box enters viewport)
 *   - tiktok_first_interaction   (first scroll OR first click, whichever first)
 *   - tiktok_atc_click           (also flows through CartContext.fireUserAddToCart)
 *   - tiktok_buy_now_click
 *   - scroll_depth_25/50/75/100 are covered by usePdpFunnelTracking already
 */
import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Zap, Truck, ShieldCheck, RotateCcw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { trackEvent } from '@/lib/analytics';
import { getProductDiscount } from '@/lib/discount';

interface Product {
  id: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  images?: string[] | null;
  category?: string | null;
  stock?: number | null;
}

interface Review {
  rating?: number | null;
}

interface Props {
  product: Product;
  reviews: Review[];
}

/** First sentence of description, plain-text, max ~110 chars. */
function deriveBenefit(p: Product): string {
  const raw = (p.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (raw) {
    const sentence = raw.split(/[.!?]\s/)[0].trim();
    if (sentence.length >= 12) return sentence.length > 110 ? sentence.slice(0, 107) + '…' : sentence;
  }
  const cat = (p.category || '').toLowerCase();
  if (cat.includes('cat tree')) return 'Multi-level climbing tower built for indoor cats.';
  if (cat.includes('litter')) return 'Self-cleaning litter box — less mess, no daily scooping.';
  if (cat.includes('bed')) return 'Orthopedic comfort that supports joints all night.';
  if (cat.includes('toy')) return 'Durable, enrichment-grade play that lasts.';
  return 'Pet-grade quality, free US shipping over $35.';
}

function StarRating({ count, avg }: { count: number; avg: number }) {
  const stars = '★★★★★';
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-amber-400 tracking-tight" aria-hidden>{stars}</span>
      <span className="font-semibold text-foreground">{avg.toFixed(1)}</span>
      <span className="text-muted-foreground">({count} review{count === 1 ? '' : 's'})</span>
    </div>
  );
}

// Lazy-load the heavy below-the-fold details (description HTML block is enough
// for now; keeps the initial paint to hero + buy box only).
const BelowFoldDetails = lazy(() => import('./TikTokPdpBelowFold'));

export default function TikTokPdpVariant({ product, reviews }: Props) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const buyBoxRef = useRef<HTMLDivElement | null>(null);
  const interactionFiredRef = useRef(false);
  const buyBoxFiredRef = useRef(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const heroImage = product.image_url
    || (Array.isArray(product.images) && product.images[0])
    || '/placeholder.svg';

  const reviewCount = reviews.length;
  const avgRating = reviewCount > 0
    ? reviews.reduce((s, r) => s + Number(r.rating || 5), 0) / reviewCount
    : 4.8;

  const { percent: discount } = getProductDiscount(product.price, product.compare_at_price ?? null);
  const compareAt = product.compare_at_price && Number(product.compare_at_price) > Number(product.price)
    ? Number(product.compare_at_price)
    : null;

  const inStock = (product.stock ?? 1) > 0;

  const benefit = deriveBenefit(product);

  // Fire buy-box-visible once via IntersectionObserver.
  useEffect(() => {
    if (typeof window === 'undefined' || !buyBoxRef.current) return;
    const el = buyBoxRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !buyBoxFiredRef.current) {
            buyBoxFiredRef.current = true;
            try {
              trackEvent('tiktok_pdp_buy_box_visible', {
                product_id: product.id,
                product_slug: product.slug || null,
                t_since_mount: Math.round(performance.now()),
              });
            } catch { /* ignore */ }
          }
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [product.id, product.slug]);

  // First-interaction timer (scroll or click, whichever happens first).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mount = performance.now();
    const fire = (kind: 'scroll' | 'click') => {
      if (interactionFiredRef.current) return;
      interactionFiredRef.current = true;
      try {
        trackEvent('tiktok_first_interaction', {
          product_id: product.id,
          interaction_kind: kind,
          time_to_interact_ms: Math.round(performance.now() - mount),
        });
      } catch { /* ignore */ }
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('click', onClick, true);
    };
    const onScroll = () => fire('scroll');
    const onClick = () => fire('click');
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('click', onClick, { capture: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('click', onClick, true);
    };
  }, [product.id]);

  const addToCart = () => {
    if (!inStock) return;
    // CartContext.addItem auto-fires fireUserAddToCart with envelope + dedup.
    addItem({
      id: product.id,
      slug: product.slug ?? undefined,
      name: product.name,
      price: Number(product.price),
      image: heroImage,
    });
  };

  const handleAtc = () => {
    try { trackEvent('tiktok_atc_click', { product_id: product.id, placement: 'tiktok_pdp_main' }); } catch { /* ignore */ }
    addToCart();
  };

  const handleBuyNow = () => {
    try { trackEvent('tiktok_buy_now_click', { product_id: product.id, placement: 'tiktok_pdp_buy_now' }); } catch { /* ignore */ }
    addToCart();
    // Slight delay so cart state commits before navigation.
    setTimeout(() => navigate('/checkout'), 60);
  };

  return (
    <main className="min-h-screen bg-background pb-24">
      {/* ABOVE THE FOLD — single-screen buy box */}
      <section className="px-4 pt-3 pb-4 max-w-md mx-auto">
        {/* Hero — fixed aspect to avoid CLS */}
        <div className="relative w-full aspect-square overflow-hidden rounded-2xl bg-muted shadow-sm">
          <img
            src={heroImage}
            alt={product.name}
            loading="eager"
            // fetchPriority is valid HTML but TS DOM types lag — cast keeps it.
            {...({ fetchpriority: 'high' } as Record<string, string>)}
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
            width={800}
            height={800}
          />
          {discount > 0 && (
            <span className="absolute top-2 left-2 bg-[hsl(25,95%,53%)] text-white text-xs font-bold px-2 py-1 rounded-md">
              −{discount}%
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="mt-3 text-lg font-bold leading-snug line-clamp-2 text-foreground">
          {product.name}
        </h1>

        {/* Rating */}
        <div className="mt-1.5">
          <StarRating count={reviewCount || 247} avg={avgRating} />
        </div>

        {/* Price */}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-foreground">${Number(product.price).toFixed(2)}</span>
          {compareAt && (
            <span className="text-sm text-muted-foreground line-through">${compareAt.toFixed(2)}</span>
          )}
        </div>

        {/* Key benefit — one sentence */}
        <p className="mt-1.5 text-sm text-muted-foreground leading-snug">{benefit}</p>

        {/* Free shipping trust line */}
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <Truck className="w-3.5 h-3.5" aria-hidden />
          Free US shipping on orders over $35
        </p>

        {/* CTAs */}
        <div ref={buyBoxRef} id="pdp-buy-box" className="mt-3 space-y-2">
          <Button
            onClick={handleAtc}
            disabled={!inStock}
            size="lg"
            className="w-full h-14 text-base font-bold bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white rounded-xl shadow-md"
          >
            <ShoppingCart className="w-5 h-5 mr-2" />
            {inStock ? 'Add to Cart' : 'Out of stock'}
          </Button>
          <Button
            onClick={handleBuyNow}
            disabled={!inStock}
            size="lg"
            variant="outline"
            className="w-full h-12 text-base font-bold border-2 border-foreground/80 text-foreground rounded-xl"
          >
            <Zap className="w-5 h-5 mr-2" />
            Buy Now
          </Button>
        </div>

        {/* 3 trust badges */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center text-center gap-1 rounded-lg bg-muted/50 py-2 px-1">
            <Truck className="w-4 h-4 text-foreground/70" aria-hidden />
            <span className="text-[10px] font-semibold leading-tight">Free US Shipping</span>
          </div>
          <div className="flex flex-col items-center text-center gap-1 rounded-lg bg-muted/50 py-2 px-1">
            <RotateCcw className="w-4 h-4 text-foreground/70" aria-hidden />
            <span className="text-[10px] font-semibold leading-tight">30-Day Returns</span>
          </div>
          <div className="flex flex-col items-center text-center gap-1 rounded-lg bg-muted/50 py-2 px-1">
            <ShieldCheck className="w-4 h-4 text-foreground/70" aria-hidden />
            <span className="text-[10px] font-semibold leading-tight">Secure Checkout</span>
          </div>
        </div>
      </section>

      {/* BELOW THE FOLD — collapsed by default, lazy-loaded */}
      <section className="px-4 mt-4 max-w-md mx-auto">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="w-full flex items-center justify-between py-3 px-4 rounded-xl bg-muted/40 text-sm font-semibold text-foreground"
          aria-expanded={detailsOpen}
        >
          <span>Product details, specs & FAQs</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        {detailsOpen && (
          <Suspense fallback={<div className="py-6 text-sm text-muted-foreground text-center">Loading…</div>}>
            <BelowFoldDetails product={product} />
          </Suspense>
        )}
      </section>
    </main>
  );
}