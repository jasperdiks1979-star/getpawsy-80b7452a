import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isGuideLinkAllowed, isSpecificProductPhrase, productSlugFromHref } from '@/lib/guide-product-eligibility';

describe('guide product auto-link phrases', () => {
  it('does not link generic litter-box wording to a specific product', () => {
    expect(isSpecificProductPhrase('cat litter box')).toBe(false);
  });
  it('keeps product-specific phrases linkable', () => {
    expect(isSpecificProductPhrase('stainless steel litter box')).toBe(true);
  });
});

const eligible = new Set(['stainless-steel-cat-litter-box-with-lid-large-cat-litter-box-for-big-cats-scoop-and-mat-included']);

describe('guide product link eligibility', () => {
  it('allows an eligible in-stock product', () => {
    expect(isGuideLinkAllowed('/products/stainless-steel-cat-litter-box-with-lid-large-cat-litter-box-for-big-cats-scoop-and-mat-included', eligible)).toBe(true);
  });
  it('drops a merch-blocked product (automatic litter box)', () => {
    expect(isGuideLinkAllowed('/products/automatic-cat-litter-box-self-cleaning-app-control', eligible)).toBe(false);
  });
  it('drops legacy /product/ links to ineligible products', () => {
    expect(productSlugFromHref('/product/rabbit-hutch-bunny-cage-guinea-pig-house-with-pull-out-tray-and-divided-board-b094')).toBe('rabbit-hutch-bunny-cage-guinea-pig-house-with-pull-out-tray-and-divided-board-b094');
    expect(isGuideLinkAllowed('/product/rabbit-hutch-bunny-cage-guinea-pig-house-with-pull-out-tray-and-divided-board-b094', eligible)).toBe(false);
  });
  it('fails closed before the eligible set is loaded', () => {
    expect(isGuideLinkAllowed('/products/stainless-steel-cat-litter-box-with-lid-large-cat-litter-box-for-big-cats-scoop-and-mat-included', null)).toBe(false);
  });
  it('keeps non-product links', () => {
    expect(isGuideLinkAllowed('/collections/cat-litter-boxes', null)).toBe(true);
  });
  it('GuidePage loads products with all storefront gates', () => {
    const src = readFileSync('src/pages/GuidePage.tsx', 'utf8');
    for (const g of [".gt('stock', 0)", ".eq('merch_hidden', false)", ".neq('merch_role', 'blocked')", ".eq('is_duplicate', false)"]) {
      expect(src).toContain(g);
    }
    expect(src).toContain('allowedProducts: eligibleSlugs && eligibleSet ? eligibleSlugs : new Set<string>()');
  });
});

describe('priority pick block', () => {
  it('uses all storefront gates', () => {
    const src = readFileSync('src/components/guides/PriorityPickBlock.tsx', 'utf8');
    for (const g of [".gt('stock', 0)", ".eq('merch_hidden', false)", ".neq('merch_role', 'blocked')", ".eq('is_duplicate', false)"]) {
      expect(src).toContain(g);
    }
  });
});
