/**
 * Regression guard for the Cat Trees storefront outage (2026-09-25).
 *
 * The primary nav links pass short slugs ("cat-trees") while products are
 * filed under full catalog categories ("Cat Trees & Condos"). The /products
 * filter must match them or the category page renders 0 products.
 *
 * Locks the exact production matching logic in src/lib/categoryMatching.ts,
 * which is imported verbatim by src/pages/Products.tsx.
 */
import { describe, it, expect } from 'vitest';
import { categoryDirectMatch, toSlug, normalizeCategory } from '@/lib/categoryMatching';

// Representative catalog categories as stored on products
const CAT_TREE_CATEGORY = 'Cat Trees & Condos';
const LITTER_CATEGORY = 'Cat Litter Boxes';
const CAT_TOYS_CATEGORY = 'Cat Toys';

describe('primary category nav slugs match catalog categories', () => {
  it('cat-trees matches "Cat Trees & Condos" (short-slug prefix rule)', () => {
    expect(categoryDirectMatch(CAT_TREE_CATEGORY, 'cat-trees')).toBe(true);
  });

  it('cat-litter-boxes matches "Cat Litter Boxes"', () => {
    expect(categoryDirectMatch(LITTER_CATEGORY, 'cat-litter-boxes')).toBe(true);
  });

  it('cat-toys matches "Cat Toys"', () => {
    expect(categoryDirectMatch(CAT_TOYS_CATEGORY, 'cat-toys')).toBe(true);
  });

  it('simulated filter over a product list returns nonzero items for each primary link', () => {
    const products = [
      { category: CAT_TREE_CATEGORY },
      { category: CAT_TREE_CATEGORY },
      { category: LITTER_CATEGORY },
      { category: CAT_TOYS_CATEGORY },
      { category: 'Dog Beds' },
    ];
    const filterBy = (selected: string) =>
      products.filter((p) => categoryDirectMatch(p.category, selected));

    expect(filterBy('cat-trees').length).toBe(2);
    expect(filterBy('cat-litter-boxes').length).toBe(1);
    expect(filterBy('cat-toys').length).toBe(1);
  });

  it('does not over-match: cat-trees must not match unrelated categories', () => {
    expect(categoryDirectMatch('Cat Toys', 'cat-trees')).toBe(false);
    expect(categoryDirectMatch('Dog Beds', 'cat-trees')).toBe(false);
    expect(categoryDirectMatch('Cat Litter Boxes', 'cat-toys')).toBe(false);
  });

  it('slug helpers behave as the database slug format expects', () => {
    expect(toSlug(CAT_TREE_CATEGORY)).toBe('cat-trees-condos');
    expect(normalizeCategory(CAT_TREE_CATEGORY)).toBe('cat-trees-and-condos');
    expect(toSlug(LITTER_CATEGORY)).toBe('cat-litter-boxes');
    expect(toSlug(CAT_TOYS_CATEGORY)).toBe('cat-toys');
  });
});
