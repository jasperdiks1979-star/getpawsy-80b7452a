import { useQuery } from '@tanstack/react-query';
import { HomeProductGridSection } from './HomeProductGridSection';
import {
  BESTSELLER_CONFIG,
  MANUAL_PRODUCTS,
  EXCLUDED_KEYWORDS,
  MIN_PRICE,
} from '@/config/homepage-bestsellers';

const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

/**
 * Checks whether a product name/slug contains an excluded keyword.
 */
function isExcluded(name: string, slug: string): boolean {
  const haystack = `${name} ${slug}`.toLowerCase();
  return EXCLUDED_KEYWORDS.some(kw => haystack.includes(kw));
}

/**
 * MANUAL MODE — fetch only curated slugs, preserve strict order,
 * apply display-name overrides.
 */
async function fetchManualProducts() {
  const supabase = await getSupabase();
  const slugs = MANUAL_PRODUCTS.map(p => p.slug);

  const { data, error } = await supabase
    .from('products_public')
    .select('id, name, slug, image_url, price, category')
    .in('slug', slugs)
    .eq('is_active', true);

  if (error) throw error;

  // Map by slug for O(1) lookup
  const bySlug = new Map((data ?? []).map(p => [p.slug, p]));

  // Build result in strict curated order, skip missing
  const result = MANUAL_PRODUCTS
    .map(curated => {
      const db = bySlug.get(curated.slug);
      if (!db) {
        console.warn(`[Bestsellers] Curated product missing: "${curated.displayName}" (${curated.slug})`);
        return null;
      }
      return {
        ...db,
        name: curated.displayName,
        benefit: curated.benefit,
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      name: string;
      slug: string;
      image_url: string | null;
      price: number;
      category: string | null;
      benefit: string;
    }>;

  return result;
}

/**
 * AUTO MODE — pull top-scored products from DB, apply exclusions.
 * Falls back to manual mode if no scored data exists.
 */
async function fetchAutoProducts() {
  const supabase = await getSupabase();

  // Try scored winners first (future: a dedicated 'product_scores' table)
  const { data, error } = await supabase
    .from('products_public')
    .select('id, name, slug, image_url, price, category')
    .eq('is_active', true)
    .gte('price', MIN_PRICE)
    .order('price', { ascending: false })
    .limit(40);

  if (error) throw error;

  const filtered = (data ?? [])
    .filter(p => !isExcluded(p.name, p.slug))
    .slice(0, BESTSELLER_CONFIG.maxProducts);

  // Fallback to manual if auto yields nothing useful
  if (filtered.length === 0) {
    console.info('[Bestsellers] Auto mode returned 0 products — falling back to manual.');
    return fetchManualProducts();
  }

  return filtered.map(p => ({ ...p, benefit: '' }));
}

export function TrendingProducts() {
  const mode = BESTSELLER_CONFIG.mode;

  const { data: products, isLoading } = useQuery({
    queryKey: ['homepage-bestsellers', mode],
    queryFn: mode === 'manual' ? fetchManualProducts : fetchAutoProducts,
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <section className="py-14 md:py-16">
        <div className="container px-4 md:px-6">
          <div className="h-8 w-56 bg-muted rounded mb-8 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
            {Array.from({ length: BESTSELLER_CONFIG.maxProducts }).map((_, i) => (
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
      title={BESTSELLER_CONFIG.sectionTitle}
      subtitle={BESTSELLER_CONFIG.sectionSubtitle}
      products={products}
      trackingKey="homepage-bestsellers"
      seeAllHref={BESTSELLER_CONFIG.seeAllHref}
      seeAllLabel={BESTSELLER_CONFIG.seeAllLabel}
    />
  );
}

export default TrendingProducts;
