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
import { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping-constants';

interface Props {
  onCtaClick: () => void;
  inStock: boolean;
  price: number;
  /** Optional override for CTA label. Defaults to "Add to Cart". */
  ctaLabel?: string;
}

export function PdpStickyAtc({ onCtaClick, inStock, price, ctaLabel = 'Add to Cart' }: Props) {
  const [visible, setVisible] = useState(false);

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

  if (!visible) return null;

  const qualifiesFreeShip = price >= FREE_SHIPPING_THRESHOLD;

  return (
    <div
      role="region"
      aria-label="Quick add to cart"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-6px_20px_-10px_rgba(0,0,0,0.25)]"
      style={{ contain: 'layout' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-base font-bold text-foreground">${price.toFixed(2)}</span>
          <span className="text-[10px] text-muted-foreground truncate">
            {qualifiesFreeShip ? 'Free US shipping' : `Free shipping over $${FREE_SHIPPING_THRESHOLD}`}
          </span>
        </div>
        <Button
          onClick={onCtaClick}
          disabled={!inStock}
          className="ml-auto h-12 flex-1 gap-2 text-sm font-bold bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white rounded-xl active:scale-[0.98] transition-transform"
        >
          <ShoppingCart className="w-4 h-4" />
          {inStock ? ctaLabel : 'Out of stock'}
        </Button>
      </div>
    </div>
  );
}

export default PdpStickyAtc;