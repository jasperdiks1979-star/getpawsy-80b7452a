import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';

/**
 * SEO authority block — renders cornerstone guide links.
 * Used on homepage, product pages, category pages, and blog.
 * Dofollow links with keyword-rich anchors for internal link equity.
 */

const CORNERSTONE_GUIDES = [
  {
    slug: 'best-cat-trees-2026',
    anchor: 'Best Cat Trees (2026) — Complete Buyer\'s Guide',
    description: '9 cat trees tested for stability, enrichment & value. Large cats, budget picks & more.',
  },
  {
    slug: 'best-cat-litter-box-2026',
    anchor: 'Best Cat Litter Box 2026 – Complete Buying Guide',
    description: 'Tested & reviewed picks for odor control, large cats, and multi-cat homes.',
  },
  {
    slug: 'outdoor-dog-games-2026',
    anchor: 'Outdoor Dog Games (2026) – 15 Vet-Approved Ideas',
    description: '15 outdoor games ranked by energy burn. Vet-informed picks for all breeds & ages.',
  },
  {
    slug: 'best-cat-trees-small-apartments',
    anchor: 'Best Cat Trees for Small Apartments 2026',
    description: 'Space-saving cat trees tested in real homes under 600 sq ft.',
  },
];

interface PopularGuidesBlockProps {
  /** Optional title override */
  title?: string;
  /** Compact mode hides descriptions */
  compact?: boolean;
}

export function PopularGuidesBlock({
  title = 'Popular Buying Guides',
  compact = false,
}: PopularGuidesBlockProps) {
  return (
    <section className="py-8 md:py-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
          {title}
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {CORNERSTONE_GUIDES.map((guide) => (
          <Link
            key={guide.slug}
            to={`/guides/${guide.slug}`}
            className="group block rounded-xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-md transition-all"
          >
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1 text-sm md:text-base line-clamp-2">
              {guide.anchor}
            </h3>
            {!compact && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                {guide.description}
              </p>
            )}
            <span className="flex items-center gap-1 text-sm font-medium text-primary">
              Read Guide <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
