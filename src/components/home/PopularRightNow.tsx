import { Link } from 'react-router-dom';
import { FadeInView } from '@/components/ui/FadeInView';
import { MONEY_COLLECTIONS } from '@/lib/money-collections';
import { getTier1Collections } from '@/lib/revenue-tier-engine';

/**
 * Revenue-sculpted homepage blocks:
 * 1. "Top Rated & Best Value" — highest RPS tier-1 collections
 * 2. "Most Loved by US Customers" — emotional appeal picks
 * 3. "Smart Picks for Travel & Safety" — safety cluster
 * 
 * All blocks prioritize revenue_tier_1 products/collections.
 */

// Revenue-weighted selection: tier 1 collections first, then money collections
const tier1 = getTier1Collections();
const tier1Slugs = new Set(tier1.map(c => c.slug));

const TOP_RATED = MONEY_COLLECTIONS.filter(mc =>
  ['orthopedic-calming-dog-beds', 'cat-trees-and-condos', 'best-slow-feeder-dog-bowls'].includes(mc.slug)
);

const MOST_LOVED = MONEY_COLLECTIONS.filter(mc =>
  ['best-interactive-dog-toys', 'best-cat-scratching-posts', 'best-interactive-cat-toys'].includes(mc.slug)
);

const TRAVEL_SAFETY = MONEY_COLLECTIONS.filter(mc =>
  ['best-dog-car-seats', 'best-dog-harnesses', 'best-cat-carriers'].includes(mc.slug)
);

interface BlockProps {
  title: string;
  subtitle: string;
  items: typeof MONEY_COLLECTIONS;
}

function HomepageBlock({ title, subtitle, items }: BlockProps) {
  return (
    <div className="mb-10">
      <FadeInView className="text-center mb-6">
        <h3 className="text-xl md:text-2xl font-display font-bold mb-1">{title}</h3>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto">{subtitle}</p>
      </FadeInView>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {items.map((mc) => (
          <Link
            key={mc.slug}
            to={`/collections/${mc.slug}`}
            className="group block rounded-2xl border border-border/50 bg-card p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-300"
          >
            <span className="text-3xl block mb-2">{mc.icon}</span>
            <h4 className="font-display font-semibold text-base text-foreground group-hover:text-primary transition-colors mb-1">
              {mc.name}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
              {mc.description}
            </p>
            {tier1Slugs.has(mc.slug) && (
              <span className="inline-block text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full mb-2">
                Best Value
              </span>
            )}
            <span className="text-xs font-medium text-primary block">
              Shop {mc.shortName} →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function PopularRightNow() {
  return (
    <section className="py-10 md:py-14">
      <div className="container px-4 md:px-6">
        <FadeInView className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">
            Popular Right Now
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Our highest-rated collections, hand-picked for US pet parents
          </p>
        </FadeInView>

        <HomepageBlock
          title="Top Rated & Best Value"
          subtitle="Premium picks with the best quality-to-price ratio"
          items={TOP_RATED}
        />

        <HomepageBlock
          title="Most Loved by US Customers"
          subtitle="Enrichment favorites that keep pets happy & active"
          items={MOST_LOVED}
        />

        <HomepageBlock
          title="Smart Picks for Travel & Safety"
          subtitle="Keep your pet safe on every adventure"
          items={TRAVEL_SAFETY}
        />
      </div>
    </section>
  );
}

export default PopularRightNow;
