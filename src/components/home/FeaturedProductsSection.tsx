import { Link } from 'react-router-dom';

const FEATURED_PRODUCTS = [
  {
    name: 'Automatic Cat Litter Box Overview',
    path: '/lp/self-cleaning-litter-box',
    description: 'Hybrid product overview with specifications, shipping details, returns, and FAQs.',
    badge: 'Featured',
  },
  {
    name: 'Orthopedic Dog Bed',
    path: '/product/orthopedic-dog-bed-memory-foam',
    description: 'Memory foam dog bed with practical support details and product-specific information.',
    badge: 'Popular',
  },
  {
    name: 'Cat Tree & Condo',
    path: '/product/large-cat-tree-multi-level-activity-center',
    description: 'Multi-level cat furniture with sisal scratching posts and stable climbing surfaces.',
    badge: 'Popular',
  },
  {
    name: 'Dog Car Seat',
    path: '/product/dog-car-seat-booster-safety-harness',
    description: 'Travel seat with safety harness details for small to medium dogs.',
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
          Featured links to key product pages and product overviews from the GetPawsy catalog.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-4xl mx-auto">
          {FEATURED_PRODUCTS.map((p) => (
            <Link
              key={p.path}
              to={p.path}
              className="group relative rounded-xl border border-border/40 bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all"
            >
              <span className="absolute top-2 right-2 text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {p.badge}
              </span>
              <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-1 pr-14 line-clamp-2">
                {p.name}
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{p.description}</p>
              <span className="text-xs font-medium text-primary mt-2 inline-block">View Details →</span>
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
