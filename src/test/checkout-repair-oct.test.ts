import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { variantStockOf } from '@/lib/variantStock';
const r = (p: string) => readFileSync(p, 'utf8');
describe('Oct-4 checkout repair', () => {
  it('flat 0 + US warehouse stock is buyable', () => {
    expect(variantStockOf({ stock: 0, inventories: [{ countryCode: 'US', totalInventory: 1595 }] })).toBe(1595);
  });
  it('flat 0 without warehouse stays blocked; CN-only ignored', () => {
    expect(variantStockOf({ stock: 0 })).toBe(0);
    expect(variantStockOf({ stock: 0, inventories: [{ countryCode: 'CN', totalInventory: 9 }] })).toBe(0);
    expect(variantStockOf(null)).toBeNull();
  });
  it('create-checkout no longer upserts on the partial unique index', () => {
    const s = r('supabase/functions/create-checkout/index.ts');
    expect(s).not.toMatch(/onConflict:\s*"checkout_attempt_id"/);
    expect(s).toContain('23505');
  });
  it('stripe_redirect fires only after a URL is returned', () => {
    const s = r('src/pages/Checkout.tsx');
    expect(s.indexOf("step: 'stripe_redirect'")).toBeGreaterThan(s.indexOf('if (data?.url)'));
  });
  it('clicking a pre-highlighted option confirms it', () => {
    expect(r('src/pages/ProductDetail.tsx')).not.toContain('if (!isSelected) { setSelectedVariant');
  });
});
