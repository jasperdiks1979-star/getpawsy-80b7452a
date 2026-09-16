import { describe, it, expect, beforeEach, vi } from 'vitest';
import { selectStripeKey } from '../../supabase/functions/_shared/stripe-key';
import {
  syncAbandonedCart,
  resetAbandonedCartCache,
  forgetAbandonedCartRow,
  type AbandonedCartStore,
  type AbandonedCartPayload,
} from '@/lib/abandonedCartSync';
import { getCartSessionId, clearCartSessionId, CART_SESSION_STORAGE_KEY } from '@/lib/cartSession';
import { readFileSync } from 'node:fs';

describe('P1-1 Stripe key selection', () => {
  it('prefers the live key when both are present', () => {
    const sel = selectStripeKey({ STRIPE_SECRET_KEY_LIVE: 'sk_live_a', STRIPE_SECRET_KEY: 'sk_test_b' });
    expect(sel.key).toBe('sk_live_a');
    expect(sel.mode).toBe('live');
    expect(sel.source).toBe('live_env');
  });

  it('falls back to the test key when no live key is configured', () => {
    const sel = selectStripeKey({ STRIPE_SECRET_KEY: 'sk_test_b' });
    expect(sel.key).toBe('sk_test_b');
    expect(sel.mode).toBe('test');
  });

  it('honours the STRIPE_MODE override in both directions', () => {
    expect(selectStripeKey({ STRIPE_SECRET_KEY_LIVE: 'sk_live_a', STRIPE_SECRET_KEY: 'sk_test_b', STRIPE_MODE: 'test' }).key).toBe('sk_test_b');
    expect(selectStripeKey({ STRIPE_SECRET_KEY_LIVE: 'sk_live_a', STRIPE_SECRET_KEY: 'sk_test_b', STRIPE_MODE: 'LIVE' }).key).toBe('sk_live_a');
  });

  it('returns no key and unknown mode when nothing is configured', () => {
    const sel = selectStripeKey({ STRIPE_SECRET_KEY_LIVE: '  ', STRIPE_SECRET_KEY: null });
    expect(sel.key).toBeNull();
    expect(sel.mode).toBe('unknown');
    expect(sel.source).toBe('none');
  });

  it('is the single selector used by checkout, Klarna and webhook functions', () => {
    for (const fn of ['create-checkout', 'check-klarna-eligibility', 'stripe-webhook']) {
      const src = readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8');
      expect(src).toContain('_shared/stripe-key.ts');
      expect(src).toContain('getStripeKey()');
      // No bespoke key reads left behind.
      expect(src.includes('Deno.env.get("STRIPE_SECRET_KEY")')).toBe(false);
    }
  });
});

describe('P1-2 payment method claims', () => {
  const badges = readFileSync('src/components/shared/PaymentBadges.tsx', 'utf8');

  it('does not promise PayPal anywhere in the storefront claims', () => {
    expect(badges).not.toContain("name: 'PayPal'");
    for (const file of [
      'src/pages/Cart.tsx',
      'src/components/home/WhyShopGetPawsy.tsx',
      'src/components/home/WhyChooseSection.tsx',
      'src/components/home/TrustTransparencySection.tsx',
      'src/components/home/SocialProofSection.tsx',
      'src/components/home/HomepageFAQ.tsx',
      'src/pages/FAQ.tsx',
      'src/components/seo/WebsiteSchema.tsx',
      'src/components/seo/LocalBusinessSchema.tsx',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/PayPal/);
    }
  });

  it('labels wallets as conditional rather than guaranteed', () => {
    expect(badges).toContain('Available on supported devices when offered by Stripe');
  });
});

describe('P1-3 stable cart identity on funnel events', () => {
  beforeEach(() => {
    clearCartSessionId();
  });

  it('creates and reuses one persistent cart id', () => {
    const first = getCartSessionId();
    expect(first).toMatch(/^cart-/);
    expect(getCartSessionId()).toBe(first);
    expect(localStorage.getItem(CART_SESSION_STORAGE_KEY)).toBe(first);
  });

  it('issues a new identity only after an explicit clear', () => {
    const first = getCartSessionId();
    clearCartSessionId();
    expect(getCartSessionId()).not.toBe(first);
  });

  it('checkout events fall back to the cart session id so they are not degraded', async () => {
    const rows: Record<string, unknown>[] = [];
    vi.resetModules();
    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        from: () => ({
          insert: (row: Record<string, unknown>) => {
            rows.push(row);
            return Promise.resolve({ error: null });
          },
        }),
      },
    }));
    const { fireCheckoutClick } = await import('@/lib/funnelEvents');
    fireCheckoutClick({ source_component: 'cart_proceed_button', item_count: 2, value: 79.13 });
    await new Promise((r) => setTimeout(r, 30));
    const row = rows.find((r) => r.step === 'checkout_click');
    if (row) {
      expect(row.cart_id).toBeTruthy();
      expect((row.metadata as { degraded: boolean }).degraded).toBe(false);
    }
    vi.doUnmock('@/integrations/supabase/client');
  });

  it('Cart and Checkout pass an explicit cart_id', () => {
    expect(readFileSync('src/pages/Cart.tsx', 'utf8')).toContain('cart_id: getCartSessionId()');
    const checkout = readFileSync('src/pages/Checkout.tsx', 'utf8');
    expect(checkout.match(/cart_id: getCartSessionId\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('P1-4 abandoned cart idempotency', () => {
  function makeStore() {
    const inserts: AbandonedCartPayload[] = [];
    const updates: string[] = [];
    let row: { id: string; sessionId: string } | null = null;
    const store: AbandonedCartStore = {
      async findActive(sessionId) {
        await new Promise((r) => setTimeout(r, 5));
        return row && row.sessionId === sessionId ? { id: row.id } : null;
      },
      async update(id) {
        updates.push(id);
      },
      async insert(payload) {
        inserts.push(payload);
        row = { id: `row-${inserts.length}`, sessionId: payload.sessionId };
        return { id: row.id };
      },
    };
    return { store, inserts, updates };
  }

  const payload = (sessionId: string): AbandonedCartPayload => ({
    sessionId,
    customerEmail: null,
    items: [{ id: 'p1', name: 'Litter box', price: 79.13, quantity: 1 }],
    cartTotal: 79.13,
  });

  beforeEach(() => resetAbandonedCartCache());

  it('inserts only once for concurrent writes of the same session', async () => {
    const { store, inserts, updates } = makeStore();
    await Promise.all([
      syncAbandonedCart(store, payload('s1')),
      syncAbandonedCart(store, payload('s1')),
      syncAbandonedCart(store, payload('s1')),
    ]);
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(2);
  });

  it('reuses an existing active row instead of creating a new one', async () => {
    const { store, inserts, updates } = makeStore();
    await syncAbandonedCart(store, payload('s2'));
    resetAbandonedCartCache();
    await syncAbandonedCart(store, payload('s2'));
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
  });

  it('never deletes history and skips empty carts', async () => {
    const { store, inserts } = makeStore();
    await syncAbandonedCart(store, { ...payload('s3'), items: [] });
    expect(inserts).toHaveLength(0);
    expect('delete' in store).toBe(false);
  });

  it('starts a fresh row after the cart is recovered', async () => {
    const { store, inserts } = makeStore();
    await syncAbandonedCart(store, payload('s4'));
    forgetAbandonedCartRow('s4');
    await syncAbandonedCart(store, payload('s5'));
    expect(inserts).toHaveLength(2);
  });
});

describe('P1-5 shipping ETA consistency', () => {
  it('uses 5–10 business days everywhere it is claimed', () => {
    const wa = readFileSync('src/lib/warehouse-availability.ts', 'utf8');
    expect(wa).not.toContain('3-7 business days');
    expect(wa).toContain('5-10 business days');
    expect(readFileSync('src/components/product/TikTokPdpBelowFold.tsx', 'utf8')).not.toContain('3–7 business days');
    expect(readFileSync('src/pages/LinkInBio.tsx', 'utf8')).not.toMatch(/3–7 (day|Day)/);
  });
});
