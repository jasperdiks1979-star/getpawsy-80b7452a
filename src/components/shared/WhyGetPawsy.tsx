import { Truck, RotateCcw, ShieldCheck, Headphones } from 'lucide-react';
import {
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';

const TRUST_BULLETS = [
  { icon: Truck, text: `Fast US Shipping (${DELIVERY_TIME_STANDARD})` },
  { icon: RotateCcw, text: `${RETURN_WINDOW_DAYS}-Day Easy Returns` },
  { icon: ShieldCheck, text: 'Secure Checkout' },
  { icon: Headphones, text: 'Real Customer Support' },
] as const;

interface WhyGetPawsyProps {
  className?: string;
}

/**
 * Global trust block — injected on homepage, collection pages, and product pages.
 * Provides Google Merchant Center compliance trust signals.
 * Static HTML — fully crawlable, no JS dependency.
 */
export function WhyGetPawsy({ className = '' }: WhyGetPawsyProps) {
  return (
    <section
      className={`rounded-2xl border border-border/40 bg-muted/20 p-6 md:p-8 ${className}`}
      aria-label="Why GetPawsy"
    >
      <h2 className="text-lg md:text-xl font-display font-bold text-foreground mb-3 text-center">
        Why GetPawsy?
      </h2>
      <p className="text-sm text-muted-foreground text-center max-w-xl mx-auto mb-5 leading-relaxed">
        At GetPawsy, we carefully select practical, high-quality pet products designed for real pet
        owners in the United States. Every product is reviewed for usability, safety, and value
        before being offered to our customers.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TRUST_BULLETS.map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="flex items-center gap-2 rounded-lg bg-card/70 border border-border/30 px-3 py-2.5"
          >
            <Icon className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-xs font-medium text-foreground leading-tight">{text}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground text-center mt-4">
        Questions? Email us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </section>
  );
}

export default WhyGetPawsy;
