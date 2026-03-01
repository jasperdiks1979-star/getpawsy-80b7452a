import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { HomeProductGridSection } from './HomeProductGridSection';

const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

// Hard-exclude non-dog/cat species keywords
const EXCLUDED_SPECIES = [
  'rabbit', 'hamster', 'guinea pig', 'bird', 'fish',
  'reptile', 'small animal', 'ferret', 'hutch', 'cage',
];

const TRAINING_INTENTS = ['training', 'walking', 'behavior', 'potty', 'grooming'];

/**
 * Product scoring for homepage "Top 8" featuring.
 * Uses DB-level primary_species/primary_intent when available, falls back to text matching.
 */
function productScore(p: {
  name: string;
  category?: string | null;
  price?: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  primary_species?: string | null;
  primary_intent?: string | null;
}): { score: number; intent: string } {
  const text = `${p.name} ${p.category || ''}`.toLowerCase();

  // Hard exclude non-cat/dog species
  if (EXCLUDED_SPECIES.some(s => text.includes(s))) return { score: -100, intent: 'excluded' };

  const species = p.primary_species || 'unknown';
  const intent = p.primary_intent || 'general';
  let score = 0;

  // +30 if dog or both, +15 cat, skip unknown
  if (['dog', 'both'].includes(species)) score += 30;
  else if (species === 'cat') score += 15;
  else score -= 10; // unknown species = mild deprioritize (not hard exclude)

  // +50 if training-related intent
  if (TRAINING_INTENTS.includes(intent)) score += 50;

  // +20 impulse price band ($15-$79)
  const price = p.price || 0;
  if (price >= 15 && price <= 79) score += 20;

  // +15 if has margin (compare_at_price > price)
  if (p.compare_at_price && p.compare_at_price > price) {
    score += 15;
  }

  // +10 if has image
  if (p.image_url) score += 10;

  // -50 if missing key fields
  if (!p.price || !p.image_url || !p.name) score -= 50;

  return { score, intent };
}

export function TrendingProducts() {
  const { data: products, isLoading } = useQuery({
    queryKey: ['top-8-homepage-picks-v2'],
    queryFn: async () => {
      const supabase = await getSupabase();

      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, image_url, price, category, compare_at_price, primary_species, primary_intent')
        .eq('is_active', true)
        .eq('is_duplicate', false)
        .not('slug', 'is', null)
        .not('image_url', 'is', null)
        .gt('price', 0)
        .limit(300);

      if (error) throw error;

      // Score all products
      const scored = (data || [])
        .filter(p => !!p.slug && !!p.name)
        .map(p => {
          const { score, intent } = productScore(p as any);
          return { ...p, _score: score, _intent: intent };
        })
        .filter(p => p._score > 0)
        .sort((a, b) => b._score - a._score);

      // Diversify: max 2 per intent
      const intentCounts: Record<string, number> = {};
      const diversified: typeof scored = [];
      for (const p of scored) {
        const count = intentCounts[p._intent] || 0;
        if (count >= 2) continue;
        intentCounts[p._intent] = count + 1;
        diversified.push(p);
        if (diversified.length >= 8) break;
      }

      // If not enough after diversification, fill from remaining scored
      if (diversified.length < 8) {
        for (const p of scored) {
          if (diversified.find(d => d.id === p.id)) continue;
          diversified.push(p);
          if (diversified.length >= 8) break;
        }
      }

      console.info('[TrendingProducts] Top 8 selected:', diversified.length, 'from', scored.length, 'scored (pool:', (data || []).length, ')');
      return diversified;
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
      title="Dog Training Picks"
      subtitle="Top-rated training tools trusted by US dog owners"
      products={items}
      trackingKey="top-8-homepage-picks"
      seeAllHref="/collections/dog-leash-control"
      seeAllLabel="Shop All Training Gear"
    />
  );
}

export default TrendingProducts;
