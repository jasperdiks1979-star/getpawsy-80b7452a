/**
 * MobileTrustWhisper — ultra-subtle inline trust line shown above the gallery
 * on mobile PDPs.
 *
 * Premium-DTC posture:
 *   - Inline, not fixed. Never overlaps the global Navbar.
 *   - Neutral palette, hairline dot separators, refined letter-spacing.
 *   - Three quiet anchors. No icons. No fills. No badge energy.
 *   - Copy comes only from `merchant-policy` / `shipping-constants`.
 */
import {
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';
import { getConversionFlag } from '@/lib/conversionFlags';

const Dot = () => (
  <span
    aria-hidden
    className="inline-block h-[3px] w-[3px] rounded-full bg-foreground/25"
  />
);

export function MobileStickyTrustBar() {
  if (!getConversionFlag('mobileTrustBar')) return null;

  return (
    <div
      role="region"
      aria-label="Shipping, returns and checkout"
      className="md:hidden -mx-4 px-4 mb-3 border-y border-border/50 bg-background/60"
      style={{ contain: 'layout' }}
    >
      <div className="h-7 flex items-center justify-center gap-3">
        <span className="text-[10.5px] font-medium tracking-[0.08em] uppercase text-foreground/70">
          Free shipping ${FREE_SHIPPING_THRESHOLD}+
        </span>
        <Dot />
        <span className="text-[10.5px] font-medium tracking-[0.08em] uppercase text-foreground/70">
          {RETURN_WINDOW_DAYS}-day returns
        </span>
        <Dot />
        <span className="text-[10.5px] font-medium tracking-[0.08em] uppercase text-foreground/70">
          Secure checkout
        </span>
      </div>
    </div>
  );
}

export default MobileStickyTrustBar;