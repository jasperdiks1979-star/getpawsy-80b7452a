/**
 * MobileStickyTrustBar — ultra-subtle, top-anchored trust whisper on mobile.
 *
 * Premium-DTC posture:
 *   - 24px tall, neutral palette (no primary fill, no badge energy).
 *   - One refined line, three quiet anchors separated by hairline dots.
 *   - Auto-hides on scroll-down, returns on scroll-up.
 *   - All copy is policy-approved; no urgency, no countdowns, no review counts.
 */
import { useEffect, useRef, useState } from 'react';
import {
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';
import { getConversionFlag } from '@/lib/conversionFlags';

const Dot = () => (
  <span
    aria-hidden
    className="inline-block h-[3px] w-[3px] rounded-full bg-muted-foreground/40"
  />
);

export function MobileStickyTrustBar() {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
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
      <div className="h-6 flex items-center justify-center gap-3 px-4 bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-md border-b border-border/50">
        <span className="text-[10.5px] font-medium tracking-[0.06em] text-foreground/80">
          Free shipping ${FREE_SHIPPING_THRESHOLD}+
        </span>
        <Dot />
        <span className="text-[10.5px] font-medium tracking-[0.06em] text-foreground/80">
          {RETURN_WINDOW_DAYS}-day returns
        </span>
        <Dot />
        <span className="text-[10.5px] font-medium tracking-[0.06em] text-foreground/80">
          Secure checkout
        </span>
      </div>
    </div>
  );
}

export default MobileStickyTrustBar;