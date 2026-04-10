import { Link } from 'react-router-dom';
import { FadeInView } from '@/components/ui/FadeInView';
import { ArrowRight } from 'lucide-react';

const MONEY_PAGES = [
  {
    path: '/best-cat-litter-box-2026',
    title: 'Best Cat Litter Box 2026 (What Actually Works)',
    description: 'We tested 30+ litter boxes — these 5 control odor, tracking, and mess.',
    emoji: '🐱',
  },
  {
    path: '/best-dog-car-seat-safety',
    title: 'Best Dog Car Seats 2026 (Crash-Tested & Safe)',
    description: 'Crash-tested car seats for dogs of all sizes. Expert safety picks.',
    emoji: '🚗',
  },
  {
    path: '/best-interactive-cat-toys',
    title: 'Best Interactive Cat Toys 2026 (Top Picks Tested)',
    description: 'Toys that actually hold attention beyond 5 minutes. Expert-tested.',
    emoji: '🎯',
  },
  {
    path: '/best-dog-anxiety-solutions',
    title: 'Best Dog Anxiety Solutions 2026 (What Actually Works)',
    description: 'Premium quality calming products tested with real anxious dogs.',
    emoji: '🐕',
  },
] as const;

const CLUSTER_PAGES = [
  { path: '/best-cat-litter-box-reddit', title: 'Best Litter Box — Reddit Picks' },
  { path: '/best-litter-box-for-smell', title: 'Best Litter Box for Odor Control' },
  { path: '/best-litter-box-large-cats', title: 'Best Litter Box for Large Cats' },
  { path: '/best-litter-boxes-apartments-2026', title: 'Best Litter Boxes for Apartments' },
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

          {/* Cluster sub-pages — eliminate orphans */}
          <div className="flex flex-wrap justify-center gap-2 mt-6 max-w-4xl mx-auto">
            {CLUSTER_PAGES.map((page) => (
              <Link
                key={page.path}
                to={page.path}
                className="text-xs font-medium text-muted-foreground hover:text-primary border border-border/40 rounded-full px-3 py-1.5 hover:border-primary/30 transition-colors"
              >
                {page.title} →
              </Link>
            ))}
          </div>
        </FadeInView>
      </div>
    </section>
  );
}

export default BestBuyingGuides2026;
