import { Truck, RotateCcw, ShieldCheck, Headphones } from 'lucide-react';
import { SUPPORT_EMAIL } from '@/lib/shipping-constants';

const TRUST_BULLETS = [
  { icon: Truck, label: 'US Shipping (estimated 5–10 business days)' },
  { icon: RotateCcw, label: '30-Day Easy Returns' },
  { icon: ShieldCheck, label: 'Secure Checkout & Encrypted Payments' },
  { icon: Headphones, label: 'Dedicated Customer Support (response within 24 hours)' },
] as const;

interface WhyGetPawsyProps {
  className?: string;
}

/**
 * Global trust block — injected on homepage, collection pages, and product pages.
 * Provides Google Merchant Center compliance trust signals.
 * Static semantic HTML — fully crawlable, zero JS dependency, no lazy-load.
 */
export function WhyGetPawsy({ className = '' }: WhyGetPawsyProps) {
  return (
    <section
      className={`rounded-2xl border border-border/30 bg-[hsl(35,30%,97%)] dark:bg-muted/30 px-6 py-8 md:px-10 md:py-10 ${className}`}
      aria-label="Why GetPawsy"
    >
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-4 text-center">
        Why GetPawsy?
      </h2>

      <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-8 leading-relaxed">
        At GetPawsy, we focus on practical, high-quality pet products that make everyday life easier
        for pet owners in the United States. Every product is carefully selected for usability,
        comfort, and reliability — so you can shop with confidence.
      </p>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto list-none p-0 m-0">
        {TRUST_BULLETS.map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="flex items-start gap-3 rounded-xl bg-card border border-border/30 px-4 py-3.5"
          >
            <Icon
              className="w-5 h-5 text-primary flex-shrink-0 mt-0.5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-foreground leading-snug">{label}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground text-center mt-6">
        Questions? Reach us at{' '}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-primary hover:underline font-medium"
        >
          {SUPPORT_EMAIL}
        </a>
      </p>
    </section>
  );
}

export default WhyGetPawsy;
