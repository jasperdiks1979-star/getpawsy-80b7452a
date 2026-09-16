/**
 * Commercial KPI card: small samples must report "not enough data" rather than
 * a confident-looking percentage.
 */
import { describe, it, expect } from 'vitest';
import { computeCommercialKpis, MIN_ORDERS_FOR_RATES } from '@/components/admin/CommercialKpiCard';

const paid = (email: string, total: number, extra: Partial<any> = {}) => ({
  customer_email: email,
  total_amount: total,
  payment_status: 'paid',
  refund_state: 'none',
  refunded_amount_cents: 0,
  ...extra,
});

describe('commercial KPIs', () => {
  it('ignores unpaid orders', () => {
    const k = computeCommercialKpis([
      paid('a@x.com', 50),
      { ...paid('b@x.com', 90), payment_status: 'unpaid' },
    ]);
    expect(k.paidOrders).toBe(1);
    expect(k.revenue).toBe(50);
  });

  it('hides rates below the minimum sample', () => {
    const k = computeCommercialKpis([paid('a@x.com', 20), paid('a@x.com', 20)]);
    expect(k.sufficient).toBe(false);
    expect(k.refundRate).toBeNull();
    expect(k.repeatRate).toBeNull();
    // Absolute counts are still truthful and are shown.
    expect(k.paidOrders).toBe(2);
    expect(k.aov).toBe(20);
  });

  it('computes refund and repeat rates once the sample is large enough', () => {
    const rows = Array.from({ length: MIN_ORDERS_FOR_RATES }, (_, i) =>
      paid(`buyer${i % 5}@x.com`, 100),
    );
    rows[0] = paid('buyer0@x.com', 100, { refund_state: 'refunded', refunded_amount_cents: 10000 });
    const k = computeCommercialKpis(rows);
    expect(k.sufficient).toBe(true);
    expect(k.refundedOrders).toBe(1);
    expect(k.refundRate).toBeCloseTo((1 / MIN_ORDERS_FOR_RATES) * 100);
    // 5 distinct buyers, each ordering twice.
    expect(k.buyers).toBe(5);
    expect(k.repeatBuyers).toBe(5);
    expect(k.repeatRate).toBe(100);
  });

  it('counts a refund flagged only by amount', () => {
    const rows = Array.from({ length: MIN_ORDERS_FOR_RATES }, () => paid('a@x.com', 10));
    rows[1] = paid('a@x.com', 10, { refunded_amount_cents: 500 });
    expect(computeCommercialKpis(rows).refundedOrders).toBe(1);
  });

  it('never divides by zero', () => {
    const k = computeCommercialKpis([]);
    expect(k.aov).toBeNull();
    expect(k.refundRate).toBeNull();
    expect(k.repeatRate).toBeNull();
  });
});

describe('internal order exclusion', () => {
  it('excludes store-owner orders from revenue and counts them separately', () => {
    const k = computeCommercialKpis([
      { customer_email: 'jasperdiks@hotmail.com', total_amount: 98.99, payment_status: 'paid', refund_state: null, refunded_amount_cents: 0 },
      { customer_email: 'real@example.com', total_amount: 50, payment_status: 'paid', refund_state: null, refunded_amount_cents: 0 },
    ] as any);
    expect(k.paidOrders).toBe(1);
    expect(k.revenue).toBe(50);
    expect(k.internalOrders).toBe(1);
  });

  it('excludes token-amount live payment smoke tests', () => {
    const k = computeCommercialKpis([
      { customer_email: 'someone@example.com', total_amount: 1, payment_status: 'paid', refund_state: null, refunded_amount_cents: 0 },
    ] as any);
    expect(k.paidOrders).toBe(0);
    expect(k.internalOrders).toBe(1);
  });
});

describe('internal order exclusion cannot regress', () => {
  it('matches owner addresses regardless of case or padding', () => {
    const k = computeCommercialKpis([
      { customer_email: '  JasperDiks@Hotmail.com ', total_amount: 98.99, payment_status: 'paid', refund_state: null, refunded_amount_cents: 0 },
      { customer_email: 'JASPERDIKS1979@GMAIL.COM', total_amount: 118.99, payment_status: 'paid', refund_state: null, refunded_amount_cents: 0 },
    ] as any);
    expect(k.paidOrders).toBe(0);
    expect(k.revenue).toBe(0);
    expect(k.internalOrders).toBe(2);
  });

  it('treats the live production order set as zero customer revenue', () => {
    // Exact snapshot of every paid row in production at Phase 10.
    const production = [
      ['jasperdiks@hotmail.com', 1],
      ['jasperdiks@hotmail.com', 0.5],
      ['jasperdiks@hotmail.com', 0.5],
      ['jasperdiks1979@gmail.com', 118.99],
      ['jasperdiks@hotmail.com', 98.99],
    ].map(([customer_email, total_amount]) => ({
      customer_email, total_amount, payment_status: 'paid', refund_state: null, refunded_amount_cents: 0,
    }));
    const k = computeCommercialKpis(production as any);
    expect(k.paidOrders).toBe(0);
    expect(k.revenue).toBe(0);
    expect(k.aov).toBeNull();
    expect(k.internalOrders).toBe(5);
  });

  it('keeps a genuine order at the smoke-test boundary', () => {
    const k = computeCommercialKpis([
      { customer_email: 'real@example.com', total_amount: 2.01, payment_status: 'paid', refund_state: null, refunded_amount_cents: 0 },
    ] as any);
    expect(k.paidOrders).toBe(1);
    expect(k.internalOrders).toBe(0);
  });
});
