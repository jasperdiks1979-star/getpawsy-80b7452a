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
import { getTrustModules, TRUST_LABELS } from '@/config/trust-blocks';

const Dot = () => (
  <span
    aria-hidden
    className="inline-block h-[3px] w-[3px] rounded-full bg-foreground/25"
  />
);

export function MobileStickyTrustBar() {
  if (!getConversionFlag('mobileTrustBar')) return null;

  const modules = getTrustModules('pdp_mobile_strip');
  if (!modules.length) return null;

  // dynamic labels for shipping & returns reflect live constants
  const labelFor = (m: string) =>
    m === 'free_shipping'
      ? `Free shipping $${FREE_SHIPPING_THRESHOLD}+`
      : m === 'returns'
        ? `${RETURN_WINDOW_DAYS}-day returns`
        : TRUST_LABELS[m as keyof typeof TRUST_LABELS];

  return (
    <div
      role="region"
      aria-label="Shipping, returns and checkout"
      className="md:hidden -mx-4 px-4 mb-3 border-y border-border/50 bg-background/60"
      style={{ contain: 'layout' }}
    >
      <div className="h-7 flex items-center justify-center gap-3">
        {modules.map((m, i) => (
          <span key={m} className="flex items-center gap-3">
            {i > 0 && <Dot />}
            <span className="text-[10.5px] font-medium tracking-[0.08em] uppercase text-foreground/70">
              {labelFor(m)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default MobileStickyTrustBar;