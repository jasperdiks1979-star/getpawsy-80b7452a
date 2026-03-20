import { useQuery } from '@tanstack/react-query';
import { HomeProductGridSection } from './HomeProductGridSection';

const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

/**
 * Manually curated bestseller slugs — strict order.
 * These are high-value, high-converting products only.
 */
const CURATED_SLUGS = [
  'memory-foam-pet-bed-for-small-dogs-cats-with-washable-removable-cover-non-slip-base-waterproof-liner',
  'tactical-service-dog-harness-strap-set-car-seat-belt-collapsible-bowl-biodegradable-trash-bag-set-fo',
  'dog-booster-car-seat-pet-car-seat-for-small-medium-dog-up-to-40-lbs-black',
  'crate-furniture-32small-dog-cage-end-table-with-2-doors-lockable-door-puppy-kennel-indoor-black',
];

/** Display-friendly names to override long DB titles */
const DISPLAY_NAMES: Record<string, string> = {
  'memory-foam-pet-bed-for-small-dogs-cats-with-washable-removable-cover-non-slip-base-waterproof-liner': 'Orthopedic Dog Bed',
  'tactical-service-dog-harness-strap-set-car-seat-belt-collapsible-bowl-biodegradable-trash-bag-set-fo': 'No-Pull Dog Harness',
  'dog-booster-car-seat-pet-car-seat-for-small-medium-dog-up-to-40-lbs-black': 'Dog Car Seat & Travel Kit',
  'crate-furniture-32small-dog-cage-end-table-with-2-doors-lockable-door-puppy-kennel-indoor-black': 'Furniture Dog Crate',
};

export function TrendingProducts() {
  const { data: products, isLoading } = useQuery({
    queryKey: ['curated-bestsellers-v3'],
    queryFn: async () => {
      const supabase = await getSupabase();

      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, image_url, price, category')
        .in('slug', CURATED_SLUGS)
        .eq('is_active', true);

      if (error) throw error;

      // Sort by curated order & apply display names
      const sorted = CURATED_SLUGS
        .map(slug => data?.find(p => p.slug === slug))
        .filter(Boolean)
        .map(p => ({ ...p!, name: DISPLAY_NAMES[p!.slug] || p!.name }));

      return sorted;
    },
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <section className="py-14 md:py-16">
        <div className="container px-4 md:px-6">
          <div className="h-8 w-56 bg-muted rounded mb-8 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-muted animate-pulse" style={{ aspectRatio: '3/4' }} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!products || products.length === 0) return null;

  return (
    <HomeProductGridSection
      title="Top Picks for Pet Parents"
      subtitle="Proven tools that solve real problems — fast."
      products={products}
      trackingKey="curated-bestsellers"
      seeAllHref="/products"
      seeAllLabel="View All Products"
    />
  );
}

export default TrendingProducts;
