import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { HomeProductGridSection } from './HomeProductGridSection';

const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

// Dog training collection categories only
const DOG_TRAINING_CATEGORIES = [
  'Dog Training', 'Dog Collars & Leashes', 'Dog Harnesses',
  'Dog Potty Training', 'Anti-Bark', 'Puppy Essentials',
  'Training Accessories', 'Dog Behavior', 'Dog Leash',
];

// Hard-exclude non-dog categories
const EXCLUDED_PATTERNS = [
  'cat', 'kitten', 'feline', 'rabbit', 'hamster', 'guinea pig',
  'bird', 'fish', 'reptile', 'small animal', 'ferret',
];

function isDogTrainingProduct(p: { name: string; category?: string | null }): boolean {
  const text = `${p.name} ${p.category || ''}`.toLowerCase();
  if (EXCLUDED_PATTERNS.some(pat => text.includes(pat))) return false;
  // Must have a dog/training signal
  const dogSignals = ['dog', 'puppy', 'canine', 'leash', 'harness', 'collar',
    'training', 'potty', 'bark', 'no-pull', 'clicker', 'treat pouch',
    'agility', 'crate', 'pee pad', 'housebreaking'];
  return dogSignals.some(s => text.includes(s));
}

export function TrendingProducts() {
  const { data: products, isLoading } = useQuery({
    queryKey: ['dog-training-picks'],
    queryFn: async () => {
      const supabase = await getSupabase();

      // Try bestsellers first filtered to dog training
      const { data: bestsellers } = await supabase
        .from('bestsellers')
        .select('product_id, rank, products:product_id (id, name, slug, image_url, price, category, compare_at_price)')
        .eq('is_active', true)
        .order('rank', { ascending: true })
        .limit(40);

      if (bestsellers && bestsellers.length > 0) {
        const focused = bestsellers
          .map((b: any) => b.products)
          .filter((p: any) => p && p.slug && p.name && isDogTrainingProduct(p));
        if (focused.length >= 4) {
          // Sort by margin (compare_at_price vs price)
          return sortByMargin(focused).slice(0, 8);
        }
      }

      // Fallback: direct query for dog training products
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, image_url, price, category, compare_at_price')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .not('image_url', 'is', null)
        .gt('price', 0)
        .order('price', { ascending: false })
        .limit(200);

      if (error) throw error;
      const filtered = (data || []).filter(p => !!p.slug && !!p.name && isDogTrainingProduct(p));
      return sortByMargin(filtered).slice(0, 8);
    },
    staleTime: 10 * 60 * 1000,
  });

  const items = useMemo(() => (products || []).slice(0, 8), [products]);

  if (isLoading) {
    return (
      <section className="py-14 md:py-16">
        <div className="container px-4 md:px-6">
          <div className="h-8 w-56 bg-muted rounded mb-8 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-muted animate-pulse" style={{ aspectRatio: '3/4' }} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <HomeProductGridSection
      title="Top Dog Training Picks"
      subtitle="High-performance tools trusted by US dog owners"
      products={items}
      trackingKey="dog-training-picks"
      seeAllHref="/collections/dog-training-accessories"
      seeAllLabel="Explore All Dog Training Tools"
    />
  );
}

function sortByMargin(products: any[]): any[] {
  return [...products].sort((a, b) => {
    const marginA = a.compare_at_price && a.compare_at_price > a.price
      ? (a.compare_at_price - a.price) / a.compare_at_price
      : 0;
    const marginB = b.compare_at_price && b.compare_at_price > b.price
      ? (b.compare_at_price - b.price) / b.compare_at_price
      : 0;
    return marginB - marginA;
  });
}

export default TrendingProducts;
