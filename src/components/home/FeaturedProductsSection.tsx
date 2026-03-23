import { Link } from 'react-router-dom';

const FEATURED_PRODUCTS = [
  {
    name: 'Self-Cleaning Cat Litter Box',
    slug: '60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-suitable-for-multiple-cat',
    description: 'Automatic cleaning system that helps reduce odor and daily maintenance.',
    badge: 'Best Seller',
  },
  {
    name: 'Orthopedic Dog Bed',
    slug: 'orthopedic-dog-bed-memory-foam',
    description: 'Memory foam support for dogs of all sizes — ideal for joint relief.',
    badge: 'Popular',
  },
  {
    name: 'Cat Tree & Condo',
    slug: 'large-cat-tree-multi-level-activity-center',
    description: 'Multi-level climbing furniture with sisal scratching posts.',
    badge: 'Top Rated',
  },
  {
    name: 'Dog Car Seat',
    slug: 'dog-car-seat-booster-safety-harness',
    description: 'Crash-tested car seat with safety harness for small to medium dogs.',
    badge: 'Safety Pick',
  },
] as const;

export function FeaturedProductsSection() {
  return (
    <section className="py-10 md:py-12">
      <div className="container px-4 md:px-6">
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-2">
          Featured Products
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6 max-w-lg mx-auto">
          Our most popular picks — trusted by thousands of US pet owners.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-4xl mx-auto">
          {FEATURED_PRODUCTS.map((p) => (
            <Link
              key={p.slug}
              to={`/product/${p.slug}`}
              className="group relative rounded-xl border border-border/40 bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all"
            >
              <span className="absolute top-2 right-2 text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {p.badge}
              </span>
              <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-1 pr-14 line-clamp-2">
                {p.name}
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{p.description}</p>
              <span className="text-xs font-medium text-primary mt-2 inline-block">View Product →</span>
            </Link>
          ))}
        </div>

        {/* Contextual SEO anchor links */}
        <div className="mt-8 max-w-3xl mx-auto text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Looking for the{' '}
            <Link to="/best-cat-litter-box-2026" className="text-primary hover:underline font-medium">
              best self-cleaning litter box
            </Link>
            ? Compare our top-rated{' '}
            <Link to="/collections/best-cat-litter-boxes" className="text-primary hover:underline font-medium">
              automatic cat litter solutions
            </Link>{' '}
            designed to help{' '}
            <Link to="/guides/best-cat-litter-box-2026" className="text-primary hover:underline font-medium">
              reduce litter smell at home
            </Link>
            . For dog owners, explore our{' '}
            <Link to="/collections/orthopedic-calming-dog-beds" className="text-primary hover:underline font-medium">
              orthopedic dog beds
            </Link>{' '}
            and{' '}
            <Link to="/collections/best-dog-car-seats" className="text-primary hover:underline font-medium">
              crash-tested dog car seats
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

export default FeaturedProductsSection;
