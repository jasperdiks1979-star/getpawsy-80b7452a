import { Link } from 'react-router-dom';

const FEATURED_PRODUCTS = [
  {
    name: 'Automatic Self-Cleaning Litter Box',
    path: '/lp/self-cleaning-litter-box',
    description: 'Infrared-sensor litter box with automatic cleaning cycle, odor control, and app connectivity.',
    badge: 'Featured',
  },
  {
    name: 'Orthopedic Dog Bed – Memory Foam',
    path: '/product/orthopedic-dog-bed-memory-foam',
    description: 'Vet-style memory foam bed with removable washable cover for senior and large-breed dogs.',
    badge: 'Popular',
  },
  {
    name: 'Multi-Level Cat Tree & Condo',
    path: '/product/large-cat-tree-multi-level-activity-center',
    description: 'Sisal-wrapped cat tree with hammock, perches, and enclosed condo for multi-cat homes.',
    badge: 'Popular',
  },
  {
    name: 'Dog Car Seat with Safety Harness',
    path: '/product/dog-car-seat-booster-safety-harness',
    description: 'Crash-tested booster seat with adjustable harness for small to medium dogs up to 30 lbs.',
    badge: 'Safety Pick',
  },
  {
    name: 'Interactive Cat Toys Bundle',
    path: '/collections/cat-interactive-toys',
    description: 'Feather wands, laser toys, and puzzle feeders to keep indoor cats active and stimulated.',
    badge: 'New',
  },
  {
    name: 'Dog Grooming Essentials',
    path: '/collections/best-dog-grooming-tools',
    description: 'Self-cleaning brushes, nail grinders, and deshedding tools for all coat types.',
    badge: 'Top Pick',
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
