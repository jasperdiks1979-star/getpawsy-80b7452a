import { Link } from 'react-router-dom';
import { FadeInView } from '@/components/ui/FadeInView';
import { MONEY_COLLECTIONS } from '@/lib/money-collections';

/**
 * "Popular Right Now" — homepage contextual block linking to
 * 3 high-priority boost-target money collections (positions 4–15 push).
 * Rotates through money collections to distribute link equity.
 */

const BOOST_TARGETS = MONEY_COLLECTIONS.filter(mc =>
  ['orthopedic-calming-dog-beds', 'cat-trees-and-condos', 'best-dog-harnesses'].includes(mc.slug)
);

export function PopularRightNow() {
  return (
    <section className="py-10 md:py-14">
      <div className="container px-4 md:px-6">
        <FadeInView className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">
            Popular Right Now
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Trending collections our customers love this month
          </p>
        </FadeInView>

        <FadeInView>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {BOOST_TARGETS.map((mc) => (
              <Link
                key={mc.slug}
                to={`/collections/${mc.slug}`}
                className="group block rounded-2xl border border-border/50 bg-card p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-300"
              >
                <span className="text-3xl block mb-2">{mc.icon}</span>
                <h3 className="font-display font-semibold text-base text-foreground group-hover:text-primary transition-colors mb-1">
                  {mc.name}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                  {mc.description}
                </p>
                <span className="text-xs font-medium text-primary">
                  Shop {mc.shortName} →
                </span>
              </Link>
            ))}
          </div>
        </FadeInView>
      </div>
    </section>
  );
}

export default PopularRightNow;
