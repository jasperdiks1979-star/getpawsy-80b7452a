import { describe, it, expect } from 'vitest';
import {
  isEligibleFeaturedPick,
  selectFeaturedPicks,
  FEATURED_PICKS_LIMIT,
  type FeaturedPickRow,
} from '@/lib/featured-picks';

const base: FeaturedPickRow = {
  id: 'p1',
  slug: 'cat-tree',
  name: 'Cat Tree',
  price: 49.99,
  image_url: 'https://example.com/img.jpg',
  stock: 10,
  is_active: true,
  is_duplicate: false,
  merch_hidden: false,
  merch_role: null,
};

describe('isEligibleFeaturedPick', () => {
  it('accepts an active, stocked, merch-visible product', () => {
    expect(isEligibleFeaturedPick(base)).toBe(true);
  });

  it('rejects inactive, out-of-stock, duplicate, hidden and blocked products', () => {
    expect(isEligibleFeaturedPick({ ...base, is_active: false })).toBe(false);
    expect(isEligibleFeaturedPick({ ...base, stock: 0 })).toBe(false);
    expect(isEligibleFeaturedPick({ ...base, is_duplicate: true })).toBe(false);
    expect(isEligibleFeaturedPick({ ...base, merch_hidden: true })).toBe(false);
    expect(isEligibleFeaturedPick({ ...base, merch_role: 'blocked' })).toBe(false);
  });

  it('rejects missing image, missing slug and price below the floor', () => {
    expect(isEligibleFeaturedPick({ ...base, image_url: null })).toBe(false);
    expect(isEligibleFeaturedPick({ ...base, slug: null })).toBe(false);
    expect(isEligibleFeaturedPick({ ...base, price: 5 })).toBe(false);
  });

  it('rejects placeholder fixtures and excluded keywords', () => {
    expect(isEligibleFeaturedPick({ ...base, slug: 'sandbox-test-product' })).toBe(false);
    expect(isEligibleFeaturedPick({ ...base, name: 'Anti bark collar for dogs' })).toBe(false);
  });
});

describe('selectFeaturedPicks', () => {
  it('keeps verified picks first in order, then fills by stock', () => {
    const verified: FeaturedPickRow[] = [
      { ...base, id: 'v1', stock: 2 },
      { ...base, id: 'v2', stock: 3 },
    ];
    const catalog: FeaturedPickRow[] = [
      { ...base, id: 'c1', stock: 50 },
      { ...base, id: 'c2', stock: 90 },
      { ...base, id: 'v1', stock: 50 }, // duplicate of a verified pick
    ];
    const picks = selectFeaturedPicks(['v2', 'v1'], verified, catalog, 4);
    expect(picks.map((p) => p.id)).toEqual(['v2', 'v1', 'c2', 'c1']);
  });

  it('never exceeds the limit and skips ineligible verified picks', () => {
    const verified: FeaturedPickRow[] = [
      { ...base, id: 'v1', stock: 0 }, // ineligible
    ];
    const catalog = Array.from({ length: 20 }, (_, i) => ({
      ...base,
      id: `c${i}`,
      stock: 100 - i,
    }));
    const picks = selectFeaturedPicks(['v1'], verified, catalog);
    expect(picks).toHaveLength(FEATURED_PICKS_LIMIT);
    expect(picks.some((p) => p.id === 'v1')).toBe(false);
  });

  it('returns an empty list when nothing is eligible (safe fallback)', () => {
    expect(selectFeaturedPicks([], [], [])).toEqual([]);
  });
});
