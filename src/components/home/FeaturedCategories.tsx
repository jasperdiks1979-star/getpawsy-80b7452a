import { Link } from 'react-router-dom';

/**
 * Cat-first category grid.
 *
 * Every tile maps to a category that actually holds merchandised products
 * (see docs/commercial-rebuild/phase2). The dog and outdoor range still exists
 * and keeps its URLs, but it is no longer part of primary merchandising.
 */
const CATEGORIES = [
  { label: 'Litter boxes', href: '/products?category=Cat+Litter+Boxes', hint: 'Enclosed, top-entry & stainless steel' },
  { label: 'Cat trees & condos', href: '/products?category=Cat+Trees+%26+Condos', hint: 'Towers, wall shelves & scratching posts' },
  { label: 'Toys & enrichment', href: '/products?category=Cat+Toys', hint: 'Puzzle feeders, wands & solo play' },
  { label: 'Beds & hideaways', href: '/products?category=Cat+Beds', hint: 'Calming beds, caves & window perches' },
  { label: 'Bowls & feeders', href: '/products?category=Cat+Bowls+%26+Feeders', hint: 'Slow feeders, fountains & raised bowls' },
  { label: 'All cat products', href: '/products', hint: 'Browse the full range' },
];

/** Compact category grid — the primary "where do I go next" step on mobile. */
export function FeaturedCategories() {
  return (
    <section className="py-8 md:py-12 border-t border-border/30" aria-label="Shop by category">
      <div className="container px-4 md:px-6">
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-5">
          Shop by category
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {CATEGORIES.map((c) => (
            <Link
              key={c.href}
              to={c.href}
              className="rounded-2xl border border-border/40 bg-card px-4 py-5 hover:border-primary/50 hover:shadow-md transition-all"
            >
              <span className="block text-sm md:text-base font-semibold text-foreground">
                {c.label}
              </span>
              <span className="block text-xs text-muted-foreground mt-1">{c.hint}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeaturedCategories;
