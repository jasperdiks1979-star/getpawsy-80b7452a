/**
 * MobileStickyTrustBar — slim, top-anchored trust strip on mobile.
 *
 * Compliance:
 *   - All strings come from `merchant-policy` / `shipping-constants`.
 *   - No fake urgency, no countdowns, no review counts.
 *   - ≤32px tall so it never competes with the header CTA.
 *   - Hides on scroll-down, reappears on scroll-up so it never blocks PDP UI.
 */
import { useEffect, useRef, useState } from 'react';
import { Truck, RotateCcw, ShieldCheck } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';
import { getConversionFlag } from '@/lib/conversionFlags';

export function MobileStickyTrustBar() {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      // Visible when at top OR scrolling up
      setVisible(y < 80 || y < lastY.current);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!getConversionFlag('mobileTrustBar')) return null;

  return (
    <div
      role="region"
      aria-label="Shipping, returns and checkout"
      className={`md:hidden fixed top-0 inset-x-0 z-30 transition-transform duration-300 ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
      style={{ contain: 'layout' }}
    >
      <div className="h-8 flex items-center justify-between gap-3 px-3 bg-primary/95 text-primary-foreground text-[11px] font-medium backdrop-blur">
        <span className="flex items-center gap-1">
          <Truck className="w-3 h-3" aria-hidden />
          Free ship ${FREE_SHIPPING_THRESHOLD}+
        </span>
        <span className="flex items-center gap-1">
          <RotateCcw className="w-3 h-3" aria-hidden />
          {RETURN_WINDOW_DAYS}-day returns
        </span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" aria-hidden />
          Secure checkout
        </span>
      </div>
    </div>
  );
}

export default MobileStickyTrustBar;