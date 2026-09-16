/**
 * Delivery truth: the storefront must never state a delivery speed for a
 * product whose shipping origin we cannot evidence, and must never present an
 * estimate as a guaranteed date.
 */
import { describe, it, expect } from 'vitest';
import { getDeliveryTruth, hasProvenUsOrigin } from '@/lib/delivery-truth';

describe('delivery truth', () => {
  it.each(['US', 'us', ' United States ', 'USA'])('treats %s as a proven US origin', (w) => {
    expect(hasProvenUsOrigin(w)).toBe(true);
    expect(getDeliveryTruth(w).evidence).toBe('us_warehouse_verified');
  });

  it.each([null, undefined, '', 'unknown', 'CN', 'EU'])('treats %s as unproven', (w) => {
    expect(hasProvenUsOrigin(w as any)).toBe(false);
    expect(getDeliveryTruth(w as any).evidence).toBe('origin_unverified');
  });

  it('makes no delivery-speed claim when the origin is unproven', () => {
    const t = getDeliveryTruth('unknown');
    // Our own processing time is a policy we control and may be stated.
    // A delivery window is not.
    expect(t.line).not.toMatch(/delivery[^.]*\d+\s*business days/i);
    expect(t.detail).not.toMatch(/estimated delivery/i);
    expect(t.detail).toMatch(/confirmed at checkout/i);
  });


  it('labels the US window as an estimate, never as a guarantee', () => {
    const t = getDeliveryTruth('US');
    expect(t.detail).toMatch(/estimated delivery/i);
    expect(t.detail).toMatch(/confirmed at checkout/i);
    expect(t.detail).not.toMatch(/guaranteed|will arrive|delivered by/i);
  });

  it('always states the origin as fact only when it is proven', () => {
    expect(getDeliveryTruth('US').line).toMatch(/US warehouse/);
    expect(getDeliveryTruth('CN').line).not.toMatch(/US warehouse/);
  });
});
