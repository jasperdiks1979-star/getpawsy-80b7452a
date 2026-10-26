import { describe, it, expect } from 'vitest';
import { normalizeWishlist } from '@/contexts/WishlistContext';
import { roomMatches, ROOM_SPOTS } from '@/lib/shopTheRoom';
import { guidePicks } from '@/components/guides/GuideMascotCTA';
import type { FinderRow } from '@/lib/petFinder';

const row = (o: Partial<FinderRow>): FinderRow => ({ id: 'x', slug: 'x', name: 'x', price: 30, image_url: 'i', stock: 5, primary_species: 'cat', ...o });

describe('favorites', () => {
  it('dedupes product ids and drops malformed entries', () => {
    const out = normalizeWishlist([{ productId: 'a', addedAt: 1 }, { productId: 'a', addedAt: 2 }, { foo: 1 }, null, { productId: 'b', addedAt: 3 }]);
    expect(out.map((i) => i.productId)).toEqual(['a', 'b']);
  });
  it('non-array storage yields empty list', () => {
    expect(normalizeWishlist('junk')).toEqual([]);
  });
});

describe('shop the room', () => {
  const bed = ROOM_SPOTS.find((s) => s.id === 'bed')!;
  it('dog bed spot only shows in-stock dog beds', () => {
    const rows = [
      row({ id: '1', name: 'Raised Dog Bed', primary_species: 'dog' }),
      row({ id: '2', name: 'Orthopedic Dog Bed', primary_species: 'dog', stock: 0 }),
      row({ id: '3', name: 'Cat Bed', primary_species: 'cat' }),
    ];
    expect(roomMatches(rows, bed).map((r) => r.id)).toEqual(['1']);
  });
  it('items under $15 are excluded', () => {
    expect(roomMatches([row({ name: 'Dog Bed', primary_species: 'dog', price: 9 })], bed)).toEqual([]);
  });
});

describe('guide picks', () => {
  it('dog guide never shows cat-only items', () => {
    const rows = [row({ id: 'c', primary_species: 'cat' }), row({ id: 'd', primary_species: 'dog' })];
    expect(guidePicks(rows, 'dog').map((r) => r.id)).toEqual(['d']);
  });
});

describe('shop the room toys', () => {
  it('cat trees labelled as toys are not shown under toys', () => {
    const toys = ROOM_SPOTS.find((s) => s.id === 'toys')!;
    const rows = [row({ id: 't', name: 'Cat Tree Condo Cat Toy' }), row({ id: 'b', name: 'Rolling Ball Toy' })];
    expect(roomMatches(rows, toys).map((r) => r.id)).toEqual(['b']);
  });
});

import { cardLeadImage as _cli } from './cardLeadImage';
describe('fleece dog bed card lead', () => {
  it('uses the clean bed shot from its own gallery, not the bonus-toy promo', () => {
    const id = '08856bd3-3842-4058-ba44-f1927ae59f2e';
    const b = `https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/product-images/rehosted/${id}/`;
    expect(_cli({ id, image_url: b + 'feea2438d590dab2.png', images: [b + 'feea2438d590dab2.png', b + '8e529f821f207d65.png'] })).toBe(b + '8e529f821f207d65.png');
    expect(_cli({ id, image_url: b + 'feea2438d590dab2.png', images: [b + 'feea2438d590dab2.png'] })).toBe(b + 'feea2438d590dab2.png');
  });
});
