import { Truck, ShieldCheck, PackageCheck } from 'lucide-react';
import {
  DELIVERY_TIME_STANDARD,
  FREE_SHIPPING_THRESHOLD,
  PROCESSING_TIME,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

/**
 * Compact trust strip placed directly under the hero.
 *
 * The invented testimonial block and the hardcoded 4.8 rating that used to
 * live here were removed: they were not written by customers and there is no
 * rating data behind them. Only verifiable policy facts remain — our own
 * processing time, our own free-shipping threshold and our own return window.
 * Real reviews appear on product pages once customers write them.
 */

const SHIP_BADGES = [
  {
    icon: Truck,
    title: `Processed in ${PROCESSING_TIME}`,
    subtitle: `Estimated delivery ${DELIVERY_TIME_STANDARD} after dispatch`,
  },
  {
    icon: PackageCheck,
    title: `Free shipping $${FREE_SHIPPING_THRESHOLD}+`,
    subtitle: 'On eligible US orders',
  },
  {
    icon: ShieldCheck,
    title: `${RETURN_WINDOW_DAYS}-day returns`,
    subtitle: 'Easy, no-hassle process',
  },
] as const;

export function HeroTrustStrip() {
  return (
    <section
      className="border-b border-border/40 bg-background"
      aria-label="Shipping and returns"
    >
      <div className="container px-4 md:px-6 py-6 md:py-10">
        {/* Ship-time badges — horizontal scroll on mobile, grid on md+. */}
        <ul
          className="
            flex md:grid md:grid-cols-3
            gap-3 md:gap-4
            overflow-x-auto md:overflow-visible
            -mx-4 md:mx-0 px-4 md:px-0
            snap-x snap-mandatory md:snap-none
            list-none p-0 m-0
            [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
          "
        >
          {SHIP_BADGES.map(({ icon: Icon, title, subtitle }) => (
            <li
              key={title}
              className="
                snap-start shrink-0
                min-w-[78%] sm:min-w-[60%] md:min-w-0
                flex items-center gap-3
                rounded-xl bg-card border border-border/40
                px-4 py-3 shadow-sm
              "
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" strokeWidth={1.75} aria-hidden="true" />
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
      </div>
    </section>
  );
}

export default HeroTrustStrip;
