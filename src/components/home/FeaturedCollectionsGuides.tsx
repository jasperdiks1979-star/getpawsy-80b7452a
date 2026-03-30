import { Link } from 'react-router-dom';
import { FadeInView } from '@/components/ui/FadeInView';
import { ArrowRight, BookOpen, ShoppingBag } from 'lucide-react';

/**
 * Homepage internal linking block — targets high-priority collections + guides.
 * Crawlable <a> links with keyword-rich anchor text for SEO authority flow.
 */

const FEATURED_COLLECTIONS = [
  {
    slug: 'cat-trees-and-condos',
    label: 'Cat Trees & Condos',
    description: 'Multi-level cat trees, scratching posts & condos for active indoor cats.',
    icon: '🐱',
    guidePath: '/best-interactive-cat-toys',
    guideLabel: 'best cat toys guide',
  },
  {
    slug: 'dog-toys',
    label: 'Dog Toys & Enrichment',
    description: 'Interactive toys, puzzle feeders & chew toys for all breeds and sizes.',
    icon: '🦴',
    guidePath: '/best-dog-anxiety-solutions',
    guideLabel: 'best dog enrichment guide',
  },
  {
    slug: 'cat-litter-boxes',
    label: 'Cat Litter Boxes',
    description: 'Top-rated litter boxes for odor control, large cats & multi-cat households.',
    icon: '🧹',
    guidePath: '/best-cat-litter-box-2026',
    guideLabel: 'best cat litter box 2026 guide',
  },
  {
    slug: 'dog-beds',
    label: 'Orthopedic & Calming Dog Beds',
    description: 'Memory foam, bolster & calming beds for puppies, seniors & anxious dogs.',
    icon: '🛏️',
    guidePath: '/best-dog-anxiety-solutions',
    guideLabel: 'best dog anxiety solutions guide',
  },
];

const FEATURED_GUIDES = [
  {
    slug: 'best-cat-litter-box-2026',
    label: 'Best Cat Litter Box 2026',
    description: 'Complete buying guide with odor control tips, size charts & multi-cat solutions.',
    readTime: '18 min',
  },
  {
    slug: 'best-dog-car-seats-safe-travel',
    label: 'Best Dog Car Seats for Safe Travel',
    description: 'Safety-tested car seats & boosters — ranked by crash protection and comfort.',
    readTime: '11 min',
  },
];

export function FeaturedCollectionsGuides() {
  return (
    <section className="py-12 md:py-16">
      <div className="container px-4 md:px-6">
        <FadeInView className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">
            Popular Categories & Expert Guides
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Shop our most-searched pet product categories or read our in-depth buying guides
          </p>
        </FadeInView>

        {/* Collections */}
        <FadeInView>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-5xl mx-auto mb-6">
            {FEATURED_COLLECTIONS.map((col) => (
              <Link
                key={col.slug}
                to={`/collections/${col.slug}`}
                className="group block rounded-2xl border border-border/50 bg-card p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-300"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{col.icon}</span>
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold text-sm md:text-base text-foreground group-hover:text-primary transition-colors mb-1">
                      {col.label}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-2">
                      {col.description}
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                      <ShoppingBag className="w-3 h-3" />
                      Shop {col.label} <ArrowRight className="w-3 h-3" />
                    </span>
                    {col.guidePath && (
                      <Link
                        to={col.guidePath}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors mt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <BookOpen className="w-3 h-3" />
                        Read our {col.guideLabel} →
                      </Link>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </FadeInView>

        {/* Guides */}
        <FadeInView>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {FEATURED_GUIDES.map((guide) => (
              <Link
                key={guide.slug}
                to={`/guides/${guide.slug}`}
                className="group block rounded-2xl border border-border/50 bg-card p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-300"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <BookOpen className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold text-sm md:text-base text-foreground group-hover:text-primary transition-colors mb-1">
                      {guide.label}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-2">
                      {guide.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">{guide.readTime} read</span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        Read the {guide.label} Guide <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </FadeInView>
      </div>
    </section>
  );
}

export default FeaturedCollectionsGuides;
