import { Link } from 'react-router-dom';
import { FadeInView } from '@/components/ui/FadeInView';
import { ArrowRight } from 'lucide-react';

const MONEY_PAGES = [
  {
    path: '/best-cat-litter-box-2026',
    title: 'Best Cat Litter Box 2026 (Top Picks & Reviews)',
    description: 'Compare top-rated litter boxes for odor control, large cats, and multi-cat homes.',
    emoji: '🐱',
  },
  {
    path: '/best-dog-car-seat-safety',
    title: 'Best Dog Car Seat Safety (Crash-Tested Picks)',
    description: 'Safe and secure travel solutions for small and medium dogs.',
    emoji: '🚗',
  },
  {
    path: '/best-interactive-cat-toys',
    title: 'Best Interactive Cat Toys (Keep Cats Active & Happy)',
    description: 'Stimulating toys that prevent boredom and improve cat health.',
    emoji: '🎯',
  },
  {
    path: '/best-dog-anxiety-solutions',
    title: 'Best Dog Anxiety Solutions (Calming Products That Work)',
    description: 'Reduce stress, barking, and separation anxiety effectively.',
    emoji: '🐕',
  },
] as const;

export function BestBuyingGuides2026() {
  return (
    <section className="py-12 md:py-16">
      <div className="container px-4 md:px-6">
        <FadeInView className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">
            🔥 Best Buying Guides 2026
          </h2>
          <p className="text-muted-foreground text-sm md:text-base max-w-xl mx-auto">
            Expert-tested picks to help you choose the best products for your pet.
          </p>
        </FadeInView>

        <FadeInView>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {MONEY_PAGES.map((page) => (
              <Link
                key={page.path}
                to={page.path}
                className="group relative block rounded-2xl border border-border/50 bg-card p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-300"
              >
                {/* Badge */}
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  🔥 Top 2026 Guide
                </span>

                <span className="text-2xl block mb-2">{page.emoji}</span>
                <h3 className="font-display font-semibold text-sm md:text-base text-foreground group-hover:text-primary transition-colors mb-1.5 pr-16 sm:pr-0">
                  {page.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                  {page.description}
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Read expert guide <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            ))}
          </div>
        </FadeInView>
      </div>
    </section>
  );
}

export default BestBuyingGuides2026;
