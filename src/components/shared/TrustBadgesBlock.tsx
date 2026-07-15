import { Truck, RotateCcw, Lock, ShieldCheck } from 'lucide-react';
import {
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

const BADGES = [
  {
    icon: Truck,
    title: 'Free Shipping on Orders $35+',
    subtitle: `Estimated delivery: ${DELIVERY_TIME_STANDARD}`,
  },
  {
    icon: RotateCcw,
    title: `${RETURN_WINDOW_DAYS}-Day Returns`,
    subtitle: 'Easy returns on eligible items',
  },
  {
    icon: Lock,
    title: 'Secure Checkout',
    subtitle: 'Encrypted & protected payments',
  },
  {
    icon: ShieldCheck,
    title: 'Quality Selection',
    subtitle: 'Carefully selected products for pets',
  },
] as const;

interface TrustBadgesBlockProps {
  className?: string;
  /** Compact mode for product pages (smaller padding) */
  compact?: boolean;
}

/**
 * Unified trust badges block — placed on homepage, collection pages,
 * and product pages. Semantic HTML, crawlable, CLS-safe, no lazy-load.
 */
export function TrustBadgesBlock({ className = '', compact = false }: TrustBadgesBlockProps) {
  return (
    <section
      className={`${compact ? 'py-4' : 'py-6 md:py-10'} ${className}`}
      aria-label="Trust and shipping information"
    >
      <ul className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 list-none p-0 m-0">
        {BADGES.map(({ icon: Icon, title, subtitle }) => (
          <li
            key={title}
            className="flex items-start gap-3 rounded-xl bg-card border border-border/40 px-4 py-3.5 shadow-sm"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
              <Icon
                className="w-5 h-5 text-primary"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground text-sm leading-tight">
                {title}
              </p>
              <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                {subtitle}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default TrustBadgesBlock;
