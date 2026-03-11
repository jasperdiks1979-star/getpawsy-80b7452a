import { Link } from 'react-router-dom';
import { BookOpen, ArrowRight, Sparkles } from 'lucide-react';

/**
 * SEO authority block — renders cornerstone guide links.
 * Used on homepage, product pages, category pages, and blog.
 * Dofollow links with keyword-rich anchors for internal link equity.
 */

const CORNERSTONE_GUIDES = [
  {
    slug: 'best-cat-trees-for-indoor-cats',
    anchor: 'Best Cat Trees for Indoor Cats',
    description: 'Expert-tested cat trees for climbing, scratching & lounging. Sizes for every space.',
    category: 'Cat Furniture',
    readTime: '12 min',
  },
  {
    slug: 'best-cat-litter-box-2026',
    anchor: 'Best Cat Litter Boxes 2026',
    description: 'Complete buying guide with odor control tips, size recommendations & multi-cat solutions.',
    category: 'Cat Litter',
    readTime: '15 min',
  },
  {
    slug: 'dog-grooming-essentials-guide',
    anchor: 'Dog Grooming Essentials Guide',
    description: 'Brushes, nail trimmers, shampoos & techniques for a healthy, happy dog.',
    category: 'Dog Grooming',
    readTime: '10 min',
  },
  {
    slug: 'best-dog-car-seats-safe-travel',
    anchor: 'Best Dog Car Seats for Safe Travel',
    description: 'Safety-tested car seats & boosters to protect your dog on every journey.',
    category: 'Dog Travel',
    readTime: '11 min',
  },
  {
    slug: 'interactive-cat-toys-guide',
    anchor: 'Interactive Cat Toys Guide',
    description: 'Mental stimulation toys that reduce boredom and encourage natural hunting instincts.',
    category: 'Cat Toys',
    readTime: '9 min',
  },
  {
    slug: 'best-dog-training-equipment',
    anchor: 'Best Dog Training Equipment',
    description: 'Essential tools for obedience, leash training & behavior correction.',
    category: 'Dog Training',
    readTime: '13 min',
  },
];

interface PopularGuidesBlockProps {
  title?: string;
  compact?: boolean;
}

export function PopularGuidesBlock({
  title = 'Popular Buying Guides',
  compact = false,
}: PopularGuidesBlockProps) {
  return (
    <section className="py-10 md:py-14">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground tracking-tight">
            {title}
          </h2>
          {!compact && (
            <p className="text-sm text-muted-foreground">Expert-tested, updated for 2026</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CORNERSTONE_GUIDES.map((guide) => (
          <Link
            key={guide.slug}
            to={`/guides/${guide.slug}`}
            className="group relative block rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-soft hover:-translate-y-1 transition-all duration-300"
          >
            {/* Category pill */}
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary mb-3">
              <Sparkles className="w-3 h-3" />
              {guide.category}
            </span>

            <h3 className="font-display font-bold text-foreground group-hover:text-primary transition-colors text-sm md:text-base leading-snug mb-2 line-clamp-2">
              {guide.anchor}
            </h3>

            {!compact && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-4 leading-relaxed">
                {guide.description}
              </p>
            )}

            <div className="flex items-center justify-between mt-auto">
              <span className="text-[11px] text-muted-foreground font-medium">{guide.readTime} read</span>
              <span className="flex items-center gap-1 text-sm font-semibold text-primary group-hover:gap-2 transition-all duration-300">
                Read <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
