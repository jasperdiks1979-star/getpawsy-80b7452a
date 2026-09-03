/**
 * PHASE 9A — Cart integrity regression suite.
 *
 * Guards the invariant that a valid `pawsy-cart` can NEVER be erased by
 * hydration, reload, delayed product resolution, or transient API failure.
 * Only conclusively invalid entries may be dropped.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { CartProvider, useCart, type CartItem } from '@/contexts/CartContext';
import { runDataHealing } from '@/lib/data-healer';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      // Every network read fails: transient API failure simulation.
      const rej = () => Promise.reject(new Error('transient network failure'));
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gt', 'is', 'update', 'insert', 'limit']) {
        chain[m] = () => chain;
      }
      chain.maybeSingle = rej;
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: new Error('fail') }).then(res);
      return chain;
    },
  },
}));

const UUID_A = '3f1c9d2e-4b6a-4c8e-9a10-8b7c6d5e4f30';
const UUID_B = '7a2b4c6d-8e9f-4012-b345-6789abcdef01';

const makeCart = (): CartItem[] => [
  {
    id: `${UUID_A}::vid-1001`,
    slug: 'calming-cat-bed',
    name: 'Calming Cat Bed',
    price: 39.99,
    image: '/a.jpg',
    quantity: 2,
    variant: 'Grey / Medium',
    v2: {
      productId: UUID_A,
      variantId: 'cjv_1001',
      cjProductId: 'cjp-abc',
      cjVariantId: 'vid-1001',
      sku: 'SKU-A-1001',
    },
  },
  {
    id: UUID_B,
    slug: 'orthopedic-dog-bed',
    name: 'Orthopedic Dog Bed',
    price: 79.5,
    image: '/b.jpg',
    quantity: 1,
  },
];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

const hydrate = () => renderHook(() => useCart(), { wrapper });

beforeEach(() => {
  localStorage.clear();
});

describe('Phase 9A — cart survives hydration/reload', () => {
  it('restores a valid multi-product cart after reload', () => {
    localStorage.setItem('pawsy-cart', JSON.stringify(makeCart()));
    const { result } = hydrate();
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items.map((i) => i.id)).toEqual([`${UUID_A}::vid-1001`, UUID_B]);
  });

  it('preserves quantities, variants and prices across reload', () => {
    localStorage.setItem('pawsy-cart', JSON.stringify(makeCart()));
    const { result } = hydrate();
    expect(result.current.items[0].quantity).toBe(2);
    expect(result.current.items[0].variant).toBe('Grey / Medium');
    expect(result.current.items[1].price).toBe(79.5);
    expect(result.current.totalItems).toBe(3);
  });

  it('preserves full UUIDs through add → persist → hydrate', () => {
    const { result } = hydrate();
    act(() => {
      result.current.addItem({
        id: `${UUID_A}::vid-1001`,
        name: 'Calming Cat Bed',
        price: 39.99,
        image: '/a.jpg',
        v2: {
          productId: UUID_A,
          variantId: 'cjv_1001',
          cjProductId: 'cjp-abc',
          cjVariantId: 'vid-1001',
          sku: 'SKU-A-1001',
        },
      });
    });
    const persisted = JSON.parse(localStorage.getItem('pawsy-cart') ?? '[]');
    expect(persisted[0].id).toBe(`${UUID_A}::vid-1001`);
    expect(persisted[0].v2.productId).toBe(UUID_A);
    expect(persisted[0].v2.cjVariantId).toBe('vid-1001');

    const second = hydrate();
    expect(second.result.current.items[0].v2?.productId).toBe(UUID_A);
    expect(second.result.current.items[0].v2?.sku).toBe('SKU-A-1001');
  });

  it('keeps an empty cart empty (no phantom entries)', () => {
    localStorage.setItem('pawsy-cart', JSON.stringify([]));
    const { result } = hydrate();
    expect(result.current.items).toEqual([]);
    expect(result.current.totalPrice).toBe(0);
  });

  it('drops only conclusively invalid entries and keeps valid siblings', () => {
    localStorage.setItem(
      'pawsy-cart',
      JSON.stringify([
        ...makeCart(),
        null,
        { name: 'no id', price: 1, quantity: 1 },
        { id: 'x', price: 'free', quantity: 1 },
      ]),
    );
    const { result } = hydrate();
    expect(result.current.items).toHaveLength(2);
  });

  it('keeps the legacy item when only the v2 identity block is malformed', () => {
    const cart = makeCart();
    (cart[0] as unknown as { v2: unknown }).v2 = { productId: UUID_A }; // missing vid/sku
    localStorage.setItem('pawsy-cart', JSON.stringify(cart));
    const { result } = hydrate();
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].v2).toBeUndefined();
  });

  it('backs up rather than silently destroys an unparseable payload', () => {
    localStorage.setItem('pawsy-cart', '{{{not json');
    const { result } = hydrate();
    expect(result.current.items).toEqual([]);
    expect(localStorage.getItem('pawsy-cart-corrupt-backup')).toBe('{{{not json');
  });
});

describe('Phase 9A — transient failures never clear the cart', () => {
  it('survives a failing abandoned-cart sync / product lookup', async () => {
    localStorage.setItem('pawsy-cart', JSON.stringify(makeCart()));
    const { result } = hydrate();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(result.current.items).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem('pawsy-cart') ?? '[]')).toHaveLength(2);
  });

  it('survives repeated remount (navigation home → PDP → products → cart)', () => {
    localStorage.setItem('pawsy-cart', JSON.stringify(makeCart()));
    for (let i = 0; i < 4; i++) {
      const { result, unmount } = hydrate();
      expect(result.current.items).toHaveLength(2);
      expect(result.current.items[0].v2?.cjVariantId).toBe('vid-1001');
      unmount();
    }
    expect(JSON.parse(localStorage.getItem('pawsy-cart') ?? '[]')).toHaveLength(2);
  });
});

describe('Phase 9A — DataHealer must not eat a valid cart', () => {
  it('leaves a valid pawsy-cart array byte-identical', () => {
    const raw = JSON.stringify(makeCart());
    localStorage.setItem('pawsy-cart', raw);
    runDataHealing();
    expect(localStorage.getItem('pawsy-cart')).toBe(raw);
  });

  it('preserves v2 identity while healing a partially corrupt item', () => {
    const cart = makeCart();
    (cart[1] as unknown as { name: unknown }).name = 42;
    localStorage.setItem('pawsy-cart', JSON.stringify(cart));
    runDataHealing();
    const healed = JSON.parse(localStorage.getItem('pawsy-cart') ?? '[]');
    expect(Array.isArray(healed)).toBe(true);
    expect(healed).toHaveLength(2);
    expect(healed[0].v2.cjVariantId).toBe('vid-1001');
  });

  it('keeps the array shape and a backup when the payload is non-JSON', () => {
    localStorage.setItem('pawsy-cart', 'not-json-at-all');
    runDataHealing();
    expect(JSON.parse(localStorage.getItem('pawsy-cart') ?? 'null')).toEqual([]);
    expect(localStorage.getItem('pawsy-cart-corrupt-backup')).toBe('not-json-at-all');
  });

  it('never touches attribution/identity keys', () => {
    localStorage.setItem('pawsy-cart', JSON.stringify(makeCart()));
    localStorage.setItem('first_utm_source', 'pinterest');
    localStorage.setItem('gp_visitor_id', 'e0f0-not-json');
    runDataHealing();
    expect(localStorage.getItem('first_utm_source')).toBe('pinterest');
    expect(localStorage.getItem('gp_visitor_id')).toBe('e0f0-not-json');
  });
});

describe('Phase 9A — CartUpsell id handling never truncates UUIDs', () => {
  // Mirrors the extraction logic in src/components/cart/CartUpsell.tsx.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const baseIds = (ids: string[]) =>
    Array.from(
      new Set(
        ids.map((id) => {
          const m = String(id).match(UUID_RE);
          return m ? m[0] : String(id).split('::')[0];
        }),
      ),
    );

  it('recovers the full UUID from a variant-suffixed cart id', () => {
    expect(baseIds([`${UUID_A}::vid-1001`, UUID_B])).toEqual([UUID_A, UUID_B]);
  });

  it('never splits a UUID on its internal dashes', () => {
    for (const id of baseIds([`${UUID_A}-vid-1001`])) {
      expect(id).toHaveLength(36);
    }
  });
});
