/**
 * PdpMobileQuickBuy — mobile-only, above-the-fold compact buy card.
 *
 * Rendered ONLY for products whose per-SKU override sets `mobileQuickBuy`,
 * directly under the mobile gallery, so cold ad traffic sees price, three
 * verified benefit bullets and the Add to Cart action inside the first
 * screens instead of scrolling past generic prose.
 *
 * Pure presentation: it reuses the page's existing `onAddToCart` handler, so
 * cart logic, analytics and Pinterest tracking are untouched.
 * NOT a fixed bar — the mobile sticky CTA stays owned by PdpStickyAtc.
 */
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
  DELIVERY_TIME_STANDARD,
} from '@/lib/shipping-constants';

interface PdpMobileQuickBuyProps {
  price: number;
  bullets: string[];
  inStock: boolean;
  onAddToCart: () => void;
}

export function PdpMobileQuickBuy({ price, bullets, inStock, onAddToCart }: PdpMobileQuickBuyProps) {
  return (
    <section
      aria-label="Price and add to cart"
      className="md:hidden mt-4 rounded-2xl border border-border/60 bg-card p-4 space-y-3"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-display font-bold text-primary">${price.toFixed(2)}</span>
        <span className="text-xs text-muted-foreground">USD</span>
      </div>

      {bullets.length > 0 && (
        <ul className="space-y-1.5">
          {bullets.slice(0, 3).map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-foreground/85 leading-snug">
              <span className="text-primary mt-0.5 flex-shrink-0" aria-hidden="true">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <Button
        size="lg"
        className="w-full h-13 min-h-[52px] gap-2 text-base font-bold rounded-xl"
        onClick={onAddToCart}
        disabled={!inStock}
      >
        <ShoppingCart className="w-5 h-5" />
        {inStock ? 'Add to Cart' : 'Currently unavailable'}
      </Button>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Free US shipping on orders over ${FREE_SHIPPING_THRESHOLD} · Estimated delivery: {DELIVERY_TIME_STANDARD} ·{' '}
        {RETURN_WINDOW_DAYS}-day returns · Secure checkout
      </p>
    </section>
  );
}

export default PdpMobileQuickBuy;
