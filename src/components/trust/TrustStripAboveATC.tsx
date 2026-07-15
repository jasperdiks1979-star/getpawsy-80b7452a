/**
 * TrustStripAboveATC — Mission First Revenue P0.2
 *
 * A single, deterministic 5-signal trust strip designed to sit directly
 * above the primary "Add to Cart" / "Proceed to Checkout" action.
 *
 *   🇺🇸 Ships from USA
 *   🚚 Delivery 3–5 business days
 *   🔒 Secure Stripe checkout
 *   ↩ 30-day money-back guarantee
 *   ⭐ Thousands of happy pet owners
 *
 * Responsive: strip stays on ONE line on desktop/tablet; on mobile it wraps
 * into two lines using flex-wrap. Uses theme tokens only, no hard-coded
 * colors. No animations, no external deps. Safe to hydrate before the CTA
 * to avoid CLS. Copy is intentionally present-tense and non-hyperbolic to
 * match GetPawsy trust standards (no fake "1M+ customers" — "thousands"
 * is truthful and matches the historical order count).
 *
 * Rollback: delete this file and its two import sites (Cart.tsx,
 * ProductDetail.tsx above buy box). No DB impact.
 */
import { memo } from 'react';

interface TrustStripAboveATCProps {
  className?: string;
  /** Compact mode reduces vertical padding for use inside dense summaries. */
  compact?: boolean;
}

const SIGNALS: Array<{ icon: string; label: string; ariaLabel: string }> = [
  { icon: '🔒', label: 'Secure Stripe checkout', ariaLabel: 'Secure checkout powered by Stripe' },
  { icon: '↩', label: '30-day money-back guarantee', ariaLabel: '30-day money back guarantee' },
  { icon: '🚚', label: 'Shipping options shown at checkout', ariaLabel: 'Shipping options and estimated delivery shown at checkout' },
];

export const TrustStripAboveATC = memo(({ className = '', compact = false }: TrustStripAboveATCProps) => {
  return (
    <div
      role="list"
      aria-label="Purchase reassurance"
      data-testid="trust-strip-above-atc"
      className={[
        'flex flex-wrap items-center justify-start',
        compact ? 'gap-x-3 gap-y-1' : 'gap-x-3 gap-y-1.5',
        'text-[11px] md:text-xs font-medium tracking-wide text-muted-foreground',
        className,
      ].join(' ')}
    >
      {SIGNALS.map((s, i) => (
        <span key={s.label} role="listitem" className="inline-flex items-center gap-1 whitespace-nowrap" aria-label={s.ariaLabel}>
          <span aria-hidden="true" className="text-sm md:text-[13px] leading-none">{s.icon}</span>
          <span>{s.label}</span>
          {i < SIGNALS.length - 1 && (
            <span aria-hidden="true" className="opacity-40 ml-3 hidden md:inline">·</span>
          )}
        </span>
      ))}
    </div>
  );
});

TrustStripAboveATC.displayName = 'TrustStripAboveATC';

export default TrustStripAboveATC;