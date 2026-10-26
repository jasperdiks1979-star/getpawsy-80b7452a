/**
 * Homepage "Featured Picks" selection.
 *
 * Rule (homepage merchandising policy): a product may only appear when it is
 * active, in stock, not a duplicate, merch-visible and not merch-blocked,
 * has a real image and a price >= MIN_PRICE, and is not a sandbox/placeholder
 * fixture or keyword-excluded item. Verified curator picks keep their order
 * first; remaining slots fill from the live catalog, highest stock first.
 */

import { EXCLUDED_KEYWORDS, MIN_PRICE } from '@/config/homepage-bestsellers';

export interface FeaturedPickRow {
  id: string;
  slug: string | null;
  name: string | null;
  price: number | null;
  image_url: string | null;
  stock: number | null;
  is_active: boolean | null;
  is_duplicate: boolean | null;
  merch_hidden: boolean | null;
  merch_role: string | null;
}

export const FEATURED_PICKS_LIMIT = 12;

export function isEligibleFeaturedPick(p: FeaturedPickRow): boolean {
  if (p.is_active !== true) return false;
  if (!(Number(p.stock) > 0)) return false;
  if (p.is_duplicate === true) return false;
  if (p.merch_hidden === true) return false;
  if (p.merch_role === 'blocked') return false;
  if (!p.slug || !p.image_url) return false;
  if (!(typeof p.price === 'number' && Number(p.price) >= MIN_PRICE)) return false;
  const text = `${p.slug} ${p.name ?? ''}`.toLowerCase();
  if (/sandbox|placeholder|test-fixture/i.test(text)) return false;
  if (EXCLUDED_KEYWORDS.some((kw) => text.includes(kw))) return false;
  return true;
}

/**
 * Merge verified curator picks (ordered) with catalog fill rows into a
 * de-duplicated list of at most `limit` eligible products.
 */
export function selectFeaturedPicks(
  verifiedIds: readonly string[],
  verifiedRows: FeaturedPickRow[],
  catalogRows: FeaturedPickRow[],
  limit: number = FEATURED_PICKS_LIMIT,
): FeaturedPickRow[] {
  const byId = new Map(verifiedRows.map((p) => [String(p.id), p]));
  const picked: FeaturedPickRow[] = [];
  const seen = new Set<string>();

  for (const id of verifiedIds) {
    const row = byId.get(id);
    if (row && isEligibleFeaturedPick(row) && !seen.has(id)) {
      seen.add(id);
      picked.push(row);
    }
  }

  const fill = [...catalogRows]
    .filter((p) => isEligibleFeaturedPick(p) && !seen.has(String(p.id)))
    .sort((a, b) => Number(b.stock ?? 0) - Number(a.stock ?? 0));

  for (const row of fill) {
    if (picked.length >= limit) break;
    seen.add(String(row.id));
    picked.push(row);
  }

  return picked.slice(0, limit);
}
