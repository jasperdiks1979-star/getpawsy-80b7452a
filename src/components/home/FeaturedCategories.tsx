import { Link } from 'react-router-dom';

const CATEGORIES = [
  { label: 'Shop Cats', href: '/collections/cats', hint: 'Trees, litter boxes & toys' },
  { label: 'Shop Dogs', href: '/collections/dogs', hint: 'Beds, travel & training' },
  { label: 'Litter Boxes', href: '/collections/cat-litter-boxes', hint: 'Enclosed & self-cleaning' },
  { label: 'Cat Trees', href: '/collections/cat-trees-and-condos', hint: 'Towers & condos' },
  { label: 'Dog Beds', href: '/collections/dog-beds', hint: 'Orthopedic & elevated' },
  { label: 'All Products', href: '/products', hint: 'Browse the full catalog' },
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
