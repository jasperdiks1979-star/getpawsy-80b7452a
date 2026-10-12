import { describe, it, expect } from 'vitest';
import { RETIRED_PRODUCT_SLUGS, retiredStubSlugs } from '@/lib/retired-product-slugs';

describe('retired product 404 stubs', () => {
  it('stubs the retired slugs', () => {
    expect(retiredStubSlugs([])).toContain('xl-stainless-steel-cat-litter-box-flip-top');
    expect(retiredStubSlugs([])).toHaveLength(RETIRED_PRODUCT_SLUGS.length);
  });
  it('never stubs a slug that is live again', () => {
    expect(retiredStubSlugs(['xl-stainless-steel-cat-litter-box-flip-top'])).not.toContain('xl-stainless-steel-cat-litter-box-flip-top');
  });
  it('never contains the active RVS litter box', () => {
    expect(RETIRED_PRODUCT_SLUGS).not.toContain('stainless-steel-cat-litter-box-with-lid-large-cat-litter-box-for-big-cats-scoop-and-mat-included');
  });
});
