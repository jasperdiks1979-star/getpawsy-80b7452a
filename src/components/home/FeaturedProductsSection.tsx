import { Link } from 'react-router-dom';

/**
 * Featured Products Section — all paths DB-verified.
 * Product slugs and collection slugs confirmed in seo_collections + products tables.
 */
const FEATURED_PRODUCTS = [
  {
    name: 'Self-Cleaning Cat Litter Box',
    path: '/product/60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-128e',
    description: 'Automatic cat litter box with app control and infrared sensor. Helps reduce odor and daily cleaning effort.',
    badge: 'Featured',
  },
  {
    name: 'Elevated Cooling Dog Bed',
    path: '/product/dog-cot-cooling-pet-bed-3',
    description: 'Elevated dog bed with breathable mesh surface for comfortable rest. Suitable for indoor and outdoor use.',
    badge: 'Popular',
  },
  {
    name: 'Multi-Level Cat Tree & Condo',
    path: '/product/44-multi-level-cat-tree-with-spacious-top-perch-2-door-condo-hammock-for-indoor-0441',
    description: 'Sisal-wrapped cat tree with hammock, perches, and enclosed condo for indoor cats.',
    badge: 'Popular',
  },
  {
    name: 'Cat Trees & Condos Collection',
    path: '/collections/cat-trees-and-condos',
    description: 'Browse all cat trees, towers, and condos designed for climbing, scratching, and lounging.',
    badge: 'Collection',
  },
  {
    name: 'Best Cat Litter Boxes',
    path: '/collections/best-cat-litter-boxes',
    description: 'Compare self-cleaning, enclosed, and furniture-style litter box options for indoor cats.',
    badge: 'Collection',
  },
  {
    name: 'Dog Grooming Tools',
    path: '/collections/dog-grooming-tools',
    description: 'Brushes, trimmers, and grooming kits for routine coat care at home.',
    badge: 'Collection',
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
          Hand-picked products and collections from the GetPawsy catalog.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 max-w-5xl mx-auto">
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

        {/* Contextual SEO anchor links — verified collection slugs only */}
        <div className="mt-8 max-w-3xl mx-auto text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Looking for the best litter solution? Compare our{' '}
            <Link to="/collections/best-cat-litter-boxes" className="text-primary hover:underline font-medium">
              automatic cat litter boxes
            </Link>{' '}
            or explore{' '}
            <Link to="/collections/self-cleaning-litter-box" className="text-primary hover:underline font-medium">
              self-cleaning litter boxes
            </Link>
            . For dog owners, browse our{' '}
            <Link to="/collections/orthopedic-calming-dog-beds" className="text-primary hover:underline font-medium">
              orthopedic dog beds
            </Link>
            ,{' '}
            <Link to="/collections/best-dog-car-seats" className="text-primary hover:underline font-medium">
              dog car seats
            </Link>
            , and{' '}
            <Link to="/collections/dog-grooming-tools" className="text-primary hover:underline font-medium">
              grooming tools
            </Link>
            . See all{' '}
            <Link to="/collections/cat-trees-and-condos" className="text-primary hover:underline font-medium">
              cat trees and condos
            </Link>
            {' '}or{' '}
            <Link to="/products" className="text-primary hover:underline font-medium">
              browse all products
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

export default FeaturedProductsSection;
