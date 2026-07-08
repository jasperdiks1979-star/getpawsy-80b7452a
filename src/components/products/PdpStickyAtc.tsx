/**
 * PdpStickyAtc — universal persistent mobile Add-to-Cart bar for every PDP.
 *
 * Why this exists:
 *   Most mobile shoppers scroll past the buy box and lose the CTA. Without a
 *   sticky ATC the only remaining tap-target is the back button. This bar
 *   re-appears once the in-page buy box scrolls out of view so the primary
 *   conversion action is always one tap away.
 *
 * Compliance:
 *   - No fake urgency, no fake stock counts, no anchor pricing.
 *   - Surfaces real, verifiable signals only: live price + free-shipping rule.
 *   - Honors `inStock` so we never invite a tap on an unavailable product.
 */
import { useEffect, useRef, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping-constants';
import { useHaptic } from '@/hooks/useHaptic';
import { getConversionFlag } from '@/lib/conversionFlags';
import { fireStickyAtcClick } from '@/lib/funnelEvents';

interface Props {
  onCtaClick: () => void;
  inStock: boolean;
  price: number;
  /** Product id passed through so we can attribute the sticky click. */
  productId?: string;
  /** Optional override for CTA label. Defaults to "Add to Cart". */
  ctaLabel?: string;
}

export function PdpStickyAtc({ onCtaClick, inStock, price, productId, ctaLabel = 'Add to Cart' }: Props) {
  const [visible, setVisible] = useState(false);
  const [hiddenByScroll, setHiddenByScroll] = useState(false);
  const lastY = useRef(0);
  const haptic = useHaptic();
  const v2 = getConversionFlag('premiumPdpV2');
  const showPayMarks = getConversionFlag('pdpStickyPaymentMarks');

  useEffect(() => {
    const buy = document.getElementById('pdp-buy-box');
    if (!buy || typeof IntersectionObserver === 'undefined') {
      // Fallback: if we can't observe, show after a short scroll
      const onScroll = () => setVisible(window.scrollY > 600);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: '-15% 0px -15% 0px' },
    );
    io.observe(buy);
    return () => io.disconnect();
  }, []);

  // v2: also hide while scrolling down, reveal while scrolling up. Keeps
  // the buy CTA reachable without covering content the user is reading.
  useEffect(() => {
    if (!v2) return;
    lastY.current = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (Math.abs(delta) > 6) {
          setHiddenByScroll(delta > 0 && y > 200);
          lastY.current = y;
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [v2]);

  if (!visible) return null;

  const qualifiesFreeShip = price >= FREE_SHIPPING_THRESHOLD;

  const handleTap = () => {
    if (v2 && inStock) haptic.trigger('medium');
    // Attribution: record sticky_atc_click BEFORE the ATC handler fires so
    // impression → click can be measured independently of add_to_cart
    // writer success. Non-blocking; never throws.
    try {
      fireStickyAtcClick({ product_id: productId ?? null, source_component: 'pdp_sticky_cta' });
    } catch { /* ignore */ }
    onCtaClick();
  };

  if (v2) {
    return (
      <div
        role="region"
        aria-label="Quick add to cart"
        className={[
          'md:hidden fixed inset-x-0 bottom-0 z-40',
          'border-t border-border/40 bg-background/95 backdrop-blur-md',
          'supports-[backdrop-filter]:bg-background/80',
          'px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]',
          'shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.18)]',
          'transition-transform duration-300 ease-out',
          hiddenByScroll ? 'translate-y-full' : 'translate-y-0',
        ].join(' ')}
        style={{ contain: 'layout' }}
      >
        {showPayMarks && <PaymentMarksRow />}
        <div className="flex items-center gap-3">
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[15px] font-semibold tracking-tight text-foreground tabular-nums">
              ${price.toFixed(2)}
            </span>
            <span className="text-[10px] text-muted-foreground truncate">
              {qualifiesFreeShip ? 'Free US shipping • Secure checkout' : `Free over $${FREE_SHIPPING_THRESHOLD} • Secure checkout`}
            </span>
          </div>
          <Button
            onClick={handleTap}
            disabled={!inStock}
            className="ml-auto h-14 flex-1 gap-2 text-[15px] font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-transform"
          >
            <ShoppingCart className="w-[18px] h-[18px]" />
            {inStock ? `${ctaLabel} →` : 'Out of stock'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Quick add to cart"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-6px_20px_-10px_rgba(0,0,0,0.25)]"
      style={{ contain: 'layout' }}
    >
      {showPayMarks && <PaymentMarksRow />}
      <div className="flex items-center gap-3">
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-base font-bold text-foreground">${price.toFixed(2)}</span>
          <span className="text-[10px] text-muted-foreground truncate">
            {qualifiesFreeShip ? 'Free US shipping • Secure checkout' : `Free over $${FREE_SHIPPING_THRESHOLD} • Secure checkout`}
          </span>
        </div>
        <Button
          onClick={handleTap}
          disabled={!inStock}
          className="ml-auto h-12 flex-1 gap-2 text-sm font-bold bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white rounded-xl active:scale-[0.98] transition-transform"
        >
          <ShoppingCart className="w-4 h-4" />
          {inStock ? `${ctaLabel} →` : 'Out of stock'}
        </Button>
      </div>
    </div>
  );
}

export default PdpStickyAtc;

/**
 * PaymentMarksRow — hairline text-only row of accepted payment methods.
 * No images, no external requests, no CLS. Renders in-line above the ATC
 * bar as a subtle trust signal for first-time mobile visitors (Pinterest
 * cohort is 85% mobile with zero cart activity — the missing signal is
 * "can I trust this checkout?"). Copy is static and matches the express
 * payment options the Checkout page already exposes via Stripe.
 */
function PaymentMarksRow() {
  const marks = ['Apple Pay', 'Google Pay', 'Visa', 'Mastercard', 'Amex'];
  return (
    <div
      aria-label="Accepted payment methods"
      className="flex items-center justify-center gap-1.5 pb-1.5"
    >
      {marks.map((m, i) => (
        <span key={m} className="flex items-center gap-1.5">
          {i > 0 && (
            <span
              aria-hidden
              className="inline-block h-[3px] w-[3px] rounded-full bg-foreground/25"
            />
          )}
          <span className="text-[9px] font-semibold tracking-[0.08em] uppercase text-foreground/55 tabular-nums">
            {m}
          </span>
        </span>
      ))}
    </div>
  );
}