import { Link } from 'react-router-dom';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';

/**
 * Featured Products — higher-value curated items.
 * Only verified product/collection paths. No fake badges.
 */
const FEATURED_ITEMS = [
  {
    name: 'Self-Cleaning Cat Litter Box – Smart App Control & Odor Lock',
    path: '/product/60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-128e',
    image: '/images/products/self-cleaning-litter-box.webp',
    description: 'Automatic 60L litter box with app control, infrared sensor, and deodorizing system.',
    type: 'product' as const,
  },
  {
    name: 'Elevated Cooling Dog Bed – Breathable Mesh for All Seasons',
    path: '/product/dog-cot-cooling-pet-bed-3',
    image: '/images/products/elevated-cooling-dog-bed.webp',
    description: 'Raised mesh dog bed for airflow and comfort. Indoor or outdoor use.',
    type: 'product' as const,
  },
  {
    name: '44" Multi-Level Cat Tree – Condo, Hammock & Scratching Posts',
    path: '/product/44-multi-level-cat-tree-with-spacious-top-perch-2-door-condo-hammock-for-indoor-0441',
    image: '/images/products/multi-level-cat-tree.webp',
    description: 'Sisal-wrapped cat tree with hammock, enclosed condo, and perch for indoor cats.',
    type: 'product' as const,
  },
  {
    name: 'Cat Trees & Condos',
    path: '/collections/cat-trees-and-condos',
    description: 'Browse all cat trees, towers, and condos for climbing and scratching.',
    type: 'collection' as const,
  },
  {
    name: 'Dog Beds & Cots',
    path: '/collections/dog-beds',
    description: 'Cooling, orthopedic, and elevated dog beds for every breed.',
    type: 'collection' as const,
  },
  {
    name: 'Dog Travel Guide',
    path: '/guides/dog-travel-essentials-guide',
    description: 'Expert tips for carriers, car seats, and travel with dogs.',
    type: 'collection' as const,
  },
] as const;

export function FeaturedProductsSection() {
  return (
    <section className="py-10 md:py-12">
      <div className="container px-4 md:px-6">
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-2">
          Featured Products & Collections
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6 max-w-lg mx-auto">
          Hand-picked premium items from the GetPawsy catalog.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 max-w-5xl mx-auto">
          {FEATURED_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="group flex flex-col rounded-xl border border-border/50 bg-card overflow-hidden hover:shadow-md transition-shadow duration-300"
            >
              {'image' in item && item.image && (
                <div className="aspect-square overflow-hidden bg-muted">
                  <img
                    src={item.image}
                    alt={item.name}
                    width={300}
                    height={300}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                  />
                </div>
              )}

              <div className="p-3 flex flex-col flex-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                  {item.type === 'collection' ? 'Collection' : 'Product'}
                </span>
                <h3 className="font-semibold text-xs md:text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-1">
                  {item.name}
                </h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-2">
                  {item.description}
                </p>
                <span className="text-xs font-medium text-primary mt-auto inline-flex items-center gap-1">
                  {item.type === 'collection' ? 'Browse' : 'View Details'}
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeaturedProductsSection;
