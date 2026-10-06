import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  resolveCheckoutAttempt,
  type CheckoutAttemptOrder,
} from '../../supabase/functions/_shared/checkout-attempt';

const digest = async (payload: unknown) =>
  createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 48);

const lookupFrom = (rows: Map<string, CheckoutAttemptOrder>) => async (attemptId: string) => ({
  data: rows.get(attemptId) ?? null,
  error: null,
});

async function nextId(priorAttemptId: string, settledOrderId: string) {
  return digest({ prior_attempt_id: priorAttemptId, settled_order_id: settledOrderId });
}

describe('checkout attempt identity', () => {
  it('reuses the same order for repeated requests while it remains unpaid', async () => {
    const rows = new Map([['cart-fingerprint', { id: 'order-unpaid', payment_status: 'unpaid' }]]);

    await expect(resolveCheckoutAttempt('cart-fingerprint', lookupFrom(rows), digest)).resolves.toEqual({
      attemptId: 'cart-fingerprint',
      reusableOrder: { id: 'order-unpaid', payment_status: 'unpaid' },
    });
  });

  it.each(['paid', 'expired', 'failed', 'refunded', 'cancelled', null])(
    'never reuses an order whose payment status is %s',
    async (paymentStatus) => {
      const rows = new Map([[
        'cart-fingerprint',
        { id: 'terminal-order', payment_status: paymentStatus },
      ]]);
      const expectedAttemptId = await nextId('cart-fingerprint', 'terminal-order');

      await expect(resolveCheckoutAttempt('cart-fingerprint', lookupFrom(rows), digest)).resolves.toEqual({
        attemptId: expectedAttemptId,
        reusableOrder: null,
      });
    },
  );

  it('walks past multiple completed identical purchases and preserves the full order history', async () => {
    const secondAttempt = await nextId('cart-fingerprint', 'paid-order-1');
    const thirdAttempt = await nextId(secondAttempt, 'paid-order-2');
    const rows = new Map<string, CheckoutAttemptOrder>([
      ['cart-fingerprint', { id: 'paid-order-1', payment_status: 'paid' }],
      [secondAttempt, { id: 'paid-order-2', payment_status: 'paid' }],
    ]);

    await expect(resolveCheckoutAttempt('cart-fingerprint', lookupFrom(rows), digest)).resolves.toEqual({
      attemptId: thirdAttempt,
      reusableOrder: null,
    });
    expect(rows.size).toBe(2);
  });

  it('makes simultaneous starts for the same later purchase converge on one deterministic id', async () => {
    const rows = new Map([['cart-fingerprint', { id: 'paid-order-1', payment_status: 'paid' }]]);
    const [first, second] = await Promise.all([
      resolveCheckoutAttempt('cart-fingerprint', lookupFrom(rows), digest),
      resolveCheckoutAttempt('cart-fingerprint', lookupFrom(rows), digest),
    ]);

    expect(first.attemptId).toBe(second.attemptId);
    expect(first.reusableOrder).toBeNull();
    expect(second.reusableOrder).toBeNull();
  });

  it('fails closed on lookup errors and an unexpectedly deep history', async () => {
    const unavailable = async () => ({ data: null, error: new Error('database unavailable') });
    await expect(resolveCheckoutAttempt('cart-fingerprint', unavailable, digest)).rejects.toThrow(
      'database unavailable',
    );

    const alwaysSettled = async (attemptId: string) => ({
      data: { id: `settled-${attemptId}`, payment_status: 'paid' },
      error: null,
    });
    await expect(resolveCheckoutAttempt('cart-fingerprint', alwaysSettled, digest, 3)).rejects.toThrow(
      'checkout_attempt_chain_limit',
    );
  });
});