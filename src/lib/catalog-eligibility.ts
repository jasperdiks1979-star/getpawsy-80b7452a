/**
 * Single source of truth for shopper-facing product promotion eligibility.
 *
 * eligibleForPromotion(product) =
 *   is_active = true
 *   AND stock > 0
 *   AND is_duplicate is not true
 *   AND canonical slug present
 *   AND visible in the public catalog view (products_public)
 *   AND has an image
 *
 * Every promotional rail (Top Picks, Featured, crawl links) MUST use this module.
 * Do not fork this rule inside components.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EligibleProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  stock: number | null;
  category: string | null;
  primary_species: string | null;
}

export const ELIGIBLE_SELECT =
  'id, name, slug, price, compare_at_price, image_url, stock, category, primary_species';

/** Canonical shopper-facing product URL. Never emit the legacy /product/:slug form. */
export const productUrl = (slug: string) => `/products/${slug}`;

/** Client-side guard — mirrors the query filters exactly. */
export function eligibleForPromotion(p: Partial<EligibleProduct> & { is_active?: boolean | null; is_duplicate?: boolean | null }): boolean {
  return Boolean(
    p &&
      p.slug &&
      p.name &&
      p.image_url &&
      typeof p.price === 'number' &&
      p.price > 0 &&
      (p.stock ?? 0) > 0 &&
      p.is_active !== false &&
      p.is_duplicate !== true,
  );
}

interface FetchOpts {
  limit?: number;
  species?: 'cat' | 'dog';
  categories?: string[];
  minPrice?: number;
  maxPrice?: number;
}

/** One bounded batch query against the authoritative public catalog view. */
export async function fetchEligibleProducts(opts: FetchOpts = {}): Promise<EligibleProduct[]> {
  const { limit = 12, species, categories, minPrice, maxPrice } = opts;
  let q = supabase
    .from('products_public')
    .select(ELIGIBLE_SELECT)
    .eq('is_active', true)
    .gt('stock', 0)
    .not('is_duplicate', 'is', true)
    .not('slug', 'is', null)
    .not('image_url', 'is', null)
    .order('price', { ascending: false })
    .limit(limit);

  if (species) q = q.eq('primary_species', species);
  if (categories?.length) q = q.in('category', categories);
  if (typeof minPrice === 'number') q = q.gte('price', minPrice);
  if (typeof maxPrice === 'number') q = q.lte('price', maxPrice);

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as EligibleProduct[]).filter((p) => eligibleForPromotion(p));
}

/** Shared, cached hook — sections with identical options reuse one query (no N+1). */
export function useEligibleProducts(opts: FetchOpts = {}) {
  const key = ['eligible-products', opts.species ?? 'all', (opts.categories ?? []).join('|'), opts.limit ?? 12, opts.minPrice ?? '', opts.maxPrice ?? ''];
  return useQuery({
    queryKey: key,
    queryFn: () => fetchEligibleProducts(opts),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Deterministic, diversity-aware selection: round-robins over category so a
 * single category cannot dominate a rail. Stable for a given input order.
 */
export function diversify<T extends { category?: string | null }>(items: T[], limit: number): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category ?? 'uncategorized';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }
  const out: T[] = [];
  let added = true;
  while (out.length < limit && added) {
    added = false;
    for (const list of buckets.values()) {
      const next = list.shift();
      if (next) {
        out.push(next);
        added = true;
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}
