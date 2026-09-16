/**
 * COMMERCE N — settlement & price-parity closure.
 *
 * Behavioural / state-transition tests. Everything imported here is pure, so
 * nothing touches Stripe, CJ, the database or the network.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as client from '@/lib/cart-pricing';
import * as server from '../../supabase/functions/_shared/pricing-engine';
import {
  canonicalUnitPrice,
  lockFulfillmentWarehouse,
  resolveExactVariant,
  shouldSettleSession,
  validateLinePrice,
  variantIsPurchasable,
  variantStockOf,
  webhookRetryDecision,
} from '../../supabase/functions/_shared/order-state';
import { getTierDiscountPercent, TIERED_INCENTIVES } from '@/lib/shipping-constants';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

// ── N-3: ONE pricing engine ────────────────────────────────────────────────
describe('N-3 single pricing contract', () => {
  const carts = [
    [{ unitPriceCents: 7913, quantity: 1 }],
    [{ unitPriceCents: 7913, quantity: 2 }],
    [{ unitPriceCents: 7913, quantity: 3 }],
    [{ unitPriceCents: 10499, quantity: 1 }],
    [{ unitPriceCents: 1999, quantity: 1 }],
    [{ unitPriceCents: 3400, quantity: 2 }],
    [{ unitPriceCents: 2500, quantity: 4 }],
    [{ unitPriceCents: 4999, quantity: 1 }, { unitPriceCents: 1599, quantity: 2 }],
  ];

  it('client and server engines agree on every cart', () => {
    for (const cart of carts) {
      for (const coupon of [0, 10, 15]) {
        expect(client.computeCartQuote(cart, { couponPercent: coupon })).toEqual(
          server.computeCartQuote(cart, { couponPercent: coupon }),
        );
      }
    }
  });

  it('$79.13 x2 — PDP tile, cart total and Stripe cents are the same number', () => {
    const pdp = client.quoteForBundle(client.toCents(79.13), 2);
    const cart = client.computeCartQuote([{ unitPriceCents: 7913, quantity: 2 }]);
    const stripeIntendedCents = server.computeCartQuote([
      { unitPriceCents: 7913, quantity: 2 },
    ]).totalCents;

    expect(pdp.subtotalCents).toBe(15826);
    expect(pdp.tierPercent).toBe(5);
    expect(pdp.tierDeductionCents).toBe(791);
    expect(pdp.totalCents).toBe(15035); // $150.35
    expect(cart.totalCents).toBe(pdp.totalCents);
    expect(stripeIntendedCents).toBe(pdp.totalCents);
  });

  it('no PDP-only 15% / 25% tier survives anywhere', () => {
    const src = read('src/components/products/VolumeDiscountSelector.tsx');
    expect(src).not.toMatch(/discount:\s*15/);
    expect(src).not.toMatch(/discount:\s*25/);
    expect(src).toContain('cart-pricing');
    // Buy-2 of a $79.13 item earns the canonical 5%, never 15%.
    expect(client.quoteForBundle(7913, 2).tierPercent).toBe(5);
    expect(client.quoteForBundle(7913, 3).tierPercent).toBe(10);
  });

  it('single units never earn a percentage tier', () => {
    expect(client.computeCartQuote([{ unitPriceCents: 10499, quantity: 1 }]).tierPercent).toBe(0);
    expect(getTierDiscountPercent(104.99, 1)).toBe(0);
    expect(getTierDiscountPercent(70, 2)).toBe(5);
  });

  it('cart UI tiers are derived from the engine', () => {
    expect(TIERED_INCENTIVES.map((t) => [t.threshold, t.discountPercent])).toEqual([
      [35, 0],
      [65, 5],
      [99, 10],
    ]);
  });

  it('create-checkout owns no private tier table', () => {
    const src = read('supabase/functions/create-checkout/index.ts');
    expect(src).toContain('pricing-engine.ts');
    expect(src).not.toContain('const TIERED_INCENTIVES');
    expect(src).not.toContain('function getTierPercent');
  });
});

// ── N-4: exact variant price ───────────────────────────────────────────────
describe('N-4 exact variant price', () => {
  it('uses the variant sell price when the variant has one', () => {
    expect(canonicalUnitPrice(79.13, { vid: 'v1', variantSellPrice: 93.4 })).toBe(93.4);
  });
  it('falls back to base price only when the variant has none', () => {
    expect(canonicalUnitPrice(79.13, { vid: 'v1' })).toBe(79.13);
    expect(canonicalUnitPrice(79.13, null)).toBe(79.13);
  });
  it('a 25% lower client price is now rejected, not accepted', () => {
    expect(validateLinePrice({ clientPrice: 59.35, serverPrice: 79.13 }).ok).toBe(false);
    expect(validateLinePrice({ clientPrice: 71.22, serverPrice: 79.13 }).ok).toBe(false);
    expect(validateLinePrice({ clientPrice: 79.13, serverPrice: 79.13 }).ok).toBe(true);
  });
});

// ── N-5: deliberate variant choice ─────────────────────────────────────────
describe('N-5 multi-variant products require an explicit choice', () => {
  const variants = [{ vid: 'a' }, { vid: 'b' }];
  it('server refuses a multi-variant line with no variant id', () => {
    expect(resolveExactVariant(variants, null)).toEqual({ ok: false, reason: 'variant_required' });
  });
  it('single-variant products stay frictionless', () => {
    expect(resolveExactVariant([{ vid: 'only' }], null).ok).toBe(true);
  });
  it('PDP blocks add-to-cart until an option is chosen', () => {
    const src = read('src/pages/ProductDetail.tsx');
    expect(src).toContain('variantChoiceMissing');
    expect(src).toContain('Please choose an option first');
    expect(src).toContain('disabled={!inStock || variantChoiceMissing}');
    // and never re-prices the cart line with a PDP-only discount
    expect(src).not.toContain('volumeDiscount > 0 ? basePrice');
  });
});

// ── N-6: exact variant stock ───────────────────────────────────────────────
describe('N-6 exact variant stock', () => {
  it('reads supplier stock from any of the known fields', () => {
    expect(variantStockOf({ vid: 'a', variantStock: 0 } as never)).toBe(0);
    expect(variantStockOf({ vid: 'a', stock: '7' } as never)).toBe(7);
    expect(variantStockOf({ vid: 'a' })).toBeNull();
  });
  it('aggregate product stock cannot make a zero-stock variant purchasable', () => {
    const r = variantIsPurchasable({
      variant: { vid: 'a', variantStock: 0 } as never,
      productStockTotal: 500,
      quantity: 1,
    });
    expect(r).toEqual({ ok: false, reason: 'variant_sold_out' });
  });
  it('rejects a quantity larger than the variant stock', () => {
    expect(
      variantIsPurchasable({
        variant: { vid: 'a', variantStock: 2 } as never,
        productStockTotal: 500,
        quantity: 3,
      }).ok,
    ).toBe(false);
  });
  it('falls back to product stock only when the variant reports none', () => {
    expect(
      variantIsPurchasable({ variant: { vid: 'a' }, productStockTotal: 0, quantity: 1 }),
    ).toEqual({ ok: false, reason: 'product_sold_out' });
    expect(
      variantIsPurchasable({ variant: { vid: 'a' }, productStockTotal: 4, quantity: 1 }).ok,
    ).toBe(true);
  });
});

// ── N-7 / N-8: warehouse lock + mandatory destination ──────────────────────
describe('N-7/N-8 shipping lock', () => {
  it('locks a concrete warehouse for a supported lane', () => {
    expect(lockFulfillmentWarehouse({ supplierWarehouse: 'US', destinationCountry: 'US' }))
      .toEqual({ ok: true, warehouse: 'US' });
  });
  it('UNKNOWN warehouse is never globally shippable', () => {
    for (const wh of [null, undefined, '', 'unknown', 'none']) {
      expect(lockFulfillmentWarehouse({ supplierWarehouse: wh, destinationCountry: 'US' }))
        .toEqual({ ok: false, reason: 'warehouse_unknown' });
    }
  });
  it('rejects a lane the warehouse cannot serve', () => {
    expect(lockFulfillmentWarehouse({ supplierWarehouse: 'US', destinationCountry: 'AU' }))
      .toEqual({ ok: false, reason: 'lane_not_supported' });
  });
  it('a missing destination fails closed', () => {
    expect(lockFulfillmentWarehouse({ supplierWarehouse: 'US', destinationCountry: '' }))
      .toEqual({ ok: false, reason: 'destination_required' });
  });
  it('create-checkout requires a destination and does not offer a fallback list', () => {
    const src = read('supabase/functions/create-checkout/index.ts');
    expect(src).toContain('destination_required');
    expect(src).toContain('allowed_countries: [destinationCountry as any]');
    expect(src).not.toContain('"BR", "CL", "CO", "PE", "UY", "CR"');
    expect(src).not.toContain('function cjCanShip');
  });
  it('fulfillment uses the locked warehouse, not a re-optimised one', () => {
    const src = read('supabase/functions/create-cj-order/index.ts');
    const lockIdx = src.indexOf('Locked warehouse from checkout');
    const optIdx = src.indexOf('legacy order) — optimizing');
    expect(lockIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeLessThan(optIdx);
    expect(src).toContain('locked_warehouse_unavailable');
  });
});

// ── N-1: settlement gating ─────────────────────────────────────────────────
describe('N-1 settlement gating', () => {
  it('an unpaid completed session does NOT settle', () => {
    expect(shouldSettleSession({ payment_status: 'unpaid', status: 'complete' })).toEqual({
      settle: false,
      paymentStatus: 'pending',
    });
  });
  it('a paid session settles', () => {
    expect(shouldSettleSession({ payment_status: 'paid', status: 'complete' }).settle).toBe(true);
  });
  it('an expired session settles nothing and is recorded as expired', () => {
    expect(shouldSettleSession({ payment_status: 'unpaid', status: 'expired' })).toEqual({
      settle: false,
      paymentStatus: 'expired',
    });
  });
  it('one shared routine serves sync and async success', () => {
    const src = read('supabase/functions/stripe-webhook/index.ts');
    expect(src).toContain('case "checkout.session.async_payment_succeeded":\n      case "checkout.session.completed": {');
    // the old duplicate async handler is gone
    expect(src).not.toContain('async_payment_succeeded update error');
    // settlement is gated before any side effect
    const gateIdx = src.indexOf('const gate = shouldSettleSession(session)');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(src.indexOf('await createCJDropshippingOrder'));
    expect(gateIdx).toBeLessThan(src.indexOf('await sendOrderConfirmationEmail'));
    expect(gateIdx).toBeLessThan(src.indexOf('deductPackagingInventory'));
  });
  it('an already-paid order never repeats side effects', () => {
    const src = read('supabase/functions/stripe-webhook/index.ts');
    expect(src).toContain('Order already settled, skipping side effects');
  });
});

// ── N-2: retry-safe dedupe ─────────────────────────────────────────────────
describe('N-2 webhook retry semantics', () => {
  it('only processed is terminal', () => {
    expect(webhookRetryDecision({ existingStatus: 'processed', leaseAgeSeconds: 1 }).action)
      .toBe('skip_duplicate');
  });
  it('a failed attempt is recoverable', () => {
    expect(webhookRetryDecision({ existingStatus: 'failed', leaseAgeSeconds: 1 }).action)
      .toBe('take_over');
  });
  it('a crashed attempt (stale lease) is recoverable', () => {
    expect(webhookRetryDecision({ existingStatus: 'processing', leaseAgeSeconds: 600 }).action)
      .toBe('take_over');
  });
  it('an in-flight attempt is not duplicated', () => {
    expect(webhookRetryDecision({ existingStatus: 'processing', leaseAgeSeconds: 5 }).action)
      .toBe('wait_in_flight');
  });
  it('the webhook claims through the lease RPC and never acks an unfinished event as done', () => {
    const src = read('supabase/functions/stripe-webhook/index.ts');
    expect(src).toContain('claim_stripe_webhook_event');
    expect(src).toContain('status: terminal ? 200 : 409');
    expect(src).toContain('status: "failed"');
  });
});

// ── N-10 / N-11: commit gap + privacy ──────────────────────────────────────
describe('N-10 session→order commit gap', () => {
  const src = read('supabase/functions/create-checkout/index.ts');
  it('the order is written before the Stripe session exists', () => {
    const orderIdx = src.indexOf('.upsert(orderRow');
    const sessionIdx = src.indexOf('stripe.checkout.sessions.create');
    expect(orderIdx).toBeGreaterThan(-1);
    expect(orderIdx).toBeLessThan(sessionIdx);
  });
  it('a failed order write fails closed instead of handing over a URL', () => {
    expect(src).toContain('checkout_unavailable');
    const failIdx = src.indexOf('checkout_unavailable');
    expect(failIdx).toBeLessThan(src.indexOf('stripe.checkout.sessions.create'));
  });
  it('session creation carries an idempotency key tied to the attempt', () => {
    expect(src).toContain('idempotencyKey: `checkout_${attemptId}`');
    expect(src).toContain('onConflict: "checkout_attempt_id"');
  });
  it('the webhook can rebind a paid session to its order via the attempt id', () => {
    const wh = read('supabase/functions/stripe-webhook/index.ts');
    expect(wh).toContain('checkout_attempt_id');
    expect(wh).toContain('payment_without_order');
    expect(wh).not.toContain('orderId = session.id; // Fallback to session id');
  });
});

describe('N-11 success-page privacy', () => {
  const src = read('supabase/functions/verify-payment-session/index.ts');
  it('never returns the guest access token or PII for a known session id', () => {
    const responseBlock = src.slice(src.indexOf('minimum safe success-page payload'));
    expect(responseBlock).not.toContain('access_token');
    expect(responseBlock).not.toContain('customer_email');
    expect(responseBlock).not.toContain('items: order.items');
    expect(responseBlock).toContain('reference');
  });
});
