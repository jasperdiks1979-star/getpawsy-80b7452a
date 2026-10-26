import { describe, it, expect } from 'vitest';
import { finderMatches, type FinderRow } from '@/lib/petFinder';
import { cardLeadImage, CARD_LEAD_IMAGE_OVERRIDES } from '@/lib/cardLeadImage';

const row = (o: Partial<FinderRow>): FinderRow => ({ id: 'x', slug: 's', name: 'Cat Toy Ball', price: 20, image_url: 'i', stock: 5, primary_species: 'cat', ...o });

describe('finderMatches', () => {
  it('excludes out-of-stock products', () => {
    expect(finderMatches([row({ stock: 0 })], 'cat', 'play', 'any')).toEqual([]);
  });
  it('excludes dog-only products for cats', () => {
    expect(finderMatches([row({ primary_species: 'dog' })], 'cat', 'play', 'any')).toEqual([]);
  });
  it('applies the under $50 budget', () => {
    expect(finderMatches([row({ price: 60 })], 'cat', 'play', 'under50')).toEqual([]);
    expect(finderMatches([row({ price: 49 })], 'cat', 'play', 'under50')).toHaveLength(1);
  });
});

describe('cardLeadImage', () => {
  const id = Object.keys(CARD_LEAD_IMAGE_OVERRIDES)[0];
  it('uses override only when it is in the product own gallery', () => {
    expect(cardLeadImage({ id, image_url: 'orig', images: ['orig'] })).toBe('orig');
    expect(cardLeadImage({ id, image_url: 'orig', images: ['orig', CARD_LEAD_IMAGE_OVERRIDES[id]] })).toBe(CARD_LEAD_IMAGE_OVERRIDES[id]);
  });
});
