import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { HomeProductGridSection } from './HomeProductGridSection';
import { classifySpecies } from '@/lib/species-taxonomy';

const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

// Hard-exclude non-dog/cat species keywords
const EXCLUDED_SPECIES = [
  'rabbit', 'hamster', 'guinea pig', 'bird', 'fish',
  'reptile', 'small animal', 'ferret', 'hutch', 'cage',
];

/**
 * Product scoring for homepage "Top 8" featuring.
 * Higher score = featured first.
 */
function productScore(p: { name: string; category?: string | null; price?: number; compare_at_price?: number | null; image_url?: string | null }): number {
  const text = `${p.name} ${p.category || ''}`.toLowerCase();

  // Hard exclude non-cat/dog species
  if (EXCLUDED_SPECIES.some(s => text.includes(s))) return -100;

  const taxonomy = classifySpecies(p.name, p.category || '', []);
  let score = 0;

  // +40 if cat/dog/multi (exclude unknown)
  if (['dog', 'cat', 'multi'].includes(taxonomy.speciesPrimary)) score += 40;
  else return -50; // unknown species = deprioritize

  // +20 if in impulse price band ($15-$79)
  const price = p.price || 0;
  if (price >= 15 && price <= 79) score += 20;

  // +10 if has margin (compare_at_price > price)
  if (p.compare_at_price && p.compare_at_price > price) {
    score += 10 + Math.min(15, Math.round(((p.compare_at_price - price) / p.compare_at_price) * 30));
  }

  // +15 if has image
  if (p.image_url) score += 15;

  // Dog training bonus (aligns with hero positioning)
  const dogTrainingSignals = ['leash', 'harness', 'training', 'potty', 'bark', 'no-pull', 'clicker', 'crate'];
  if (dogTrainingSignals.some(s => text.includes(s))) score += 10;

  return score;
}

export function TrendingProducts() {
  const { data: products, isLoading } = useQuery({
    queryKey: ['top-8-homepage-picks'],
    queryFn: async () => {
      const supabase = await getSupabase();

      // Fetch a broad pool of active products
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, image_url, price, category, compare_at_price')
        .eq('is_active', true)
        .eq('is_duplicate', false)
        .not('slug', 'is', null)
        .not('image_url', 'is', null)
        .gt('price', 0)
        .limit(300);

      if (error) throw error;

      // Score and sort all products
      const scored = (data || [])
        .filter(p => !!p.slug && !!p.name)
        .map(p => ({ ...p, _score: productScore(p) }))
        .filter(p => p._score > 0) // Exclude negative scores (non-cat/dog species)
        .sort((a, b) => b._score - a._score || new Date(b.id).getTime() - new Date(a.id).getTime());

      return scored.slice(0, 8);
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
      title="Top Picks for Your Pet"
      subtitle="High-performance products trusted by US pet owners"
      products={items}
      trackingKey="top-8-homepage-picks"
      seeAllHref="/products"
      seeAllLabel="Explore All Products"
    />
  );
}

export default TrendingProducts;
