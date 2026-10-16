import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SIGNALS } from '@/components/trust/TrustStripAboveATC';
import { US_TRANSIT_DAYS } from '@/lib/shipping-windows';

describe('TrustStripAboveATC delivery copy', () => {
  it('states the configured transit window instead of implying shipping options', () => {
    const labels = SIGNALS.map((s) => s.label).join(' | ');
    expect(labels).not.toMatch(/shipping options/i);
    expect(labels).toContain(`${US_TRANSIT_DAYS.min}–${US_TRANSIT_DAYS.max} business days`);
  });

  it('matches the single Stripe shipping rate window', () => {
    const src = readFileSync('supabase/functions/create-checkout/index.ts', 'utf8');
    expect(src).toContain(`minimum: { unit: "business_day", value: ${US_TRANSIT_DAYS.min} }`);
    expect(src).toContain(`maximum: { unit: "business_day", value: ${US_TRANSIT_DAYS.max} }`);
  });
});
