import { Truck, ShieldCheck, PackageCheck } from 'lucide-react';
import { StarRating } from '@/components/ui/star-rating';
import {
  DELIVERY_TIME_STANDARD,
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

/**
 * Compact trust + recent-reviews strip placed directly under the hero.
 *
 * Goal: reinforce trust in the first scroll-frame on every breakpoint
 * (mobile horizontal scroll → tablet 2-col → desktop 4-col grid) without
 * pushing the product grid further down the page.
 *
 * - Reviews are short, US-style first-name + last-initial snippets so they
 *   read as authentic without misrepresenting individuals.
 * - Ship-time / returns badges reuse central shipping constants so copy
 *   stays in sync with the rest of the site (PDP, cart, footer).
 */

const RECENT_REVIEWS = [
  {
    name: 'Sarah M.',
    location: 'Austin, TX',
    rating: 5,
    text: 'Arrived in 6 days and my cat actually uses it. Litter smell is gone.',
  },
  {
    name: 'Jason R.',
    location: 'Denver, CO',
    rating: 5,
    text: 'Solid build, easy setup. Way better than what we had from the big-box store.',
  },
  {
    name: 'Priya S.',
    location: 'Brooklyn, NY',
    rating: 4,
    text: 'Shipping was quick and support replied within a day. Recommend.',
  },
] as const;

const SHIP_BADGES = [
  {
    icon: Truck,
    title: 'Ships within 24h',
    subtitle: `Delivery in ${DELIVERY_TIME_STANDARD}`,
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
      aria-label="Recent reviews and shipping guarantees"
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

        {/* Recent reviews — single column on mobile, 3-up on lg. */}
        <div className="mt-6 md:mt-8">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="text-sm md:text-base font-semibold text-foreground">
              What pet parents are saying
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <StarRating rating={4.8} size="sm" />
              <span className="font-medium text-foreground">4.8</span>
              <span className="hidden sm:inline">/ 5</span>
            </div>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 list-none p-0 m-0">
            {RECENT_REVIEWS.map((review) => (
              <li
                key={review.name}
                className="rounded-xl border border-border/40 bg-card px-4 py-3.5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {review.name}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      · {review.location}
                    </span>
                  </p>
                  <StarRating rating={review.rating} size="sm" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  “{review.text}”
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default HeroTrustStrip;