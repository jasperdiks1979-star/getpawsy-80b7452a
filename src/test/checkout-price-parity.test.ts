// @vitest-environment jsdom
/**
 * P0 revenue-critical regression tests.
 *
 * Covers price/discount parity (volume rule), the removal of the invented
 * cart tax, Pinterest bot classification, and the fail-closed discount path
 * in create-checkout.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  getTierDiscountPercent,
  getCartIncentiveState,
} from '@/lib/shipping-constants';
import { getBotClassification } from '@/lib/botDetection';

const money = (n: number) => Math.round(n * 100) / 100;

function cartTotals(subtotal: number, units: number) {
  const percent = getTierDiscountPercent(subtotal, units);
  const discount = money((subtotal * percent) / 100);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_RATE;
  return { percent, discount, shipping, total: money(subtotal - discount + shipping) };
}

describe('P0-1 price parity — tier discount is a volume discount', () => {
  it('A. $79.13, qty 1 → 0% tier, free shipping, total $79.13', () => {
    const t = cartTotals(79.13, 1);
    expect(t.percent).toBe(0);
    expect(t.shipping).toBe(0);
    expect(t.total).toBe(79.13);
  });

  it('B. $104.99, qty 1 → 0% tier, total $104.99', () => {
    const t = cartTotals(104.99, 1);
    expect(t.percent).toBe(0);
    expect(t.total).toBe(104.99);
  });

  it('C. qty 2, subtotal $70 → 5%', () => {
    const t = cartTotals(70, 2);
    expect(t.percent).toBe(5);
    expect(t.total).toBe(66.5);
  });

  it('D. qty 2, subtotal $120 → 10%', () => {
    const t = cartTotals(120, 2);
    expect(t.percent).toBe(10);
    expect(t.total).toBe(108);
  });

  it('below $65 never earns a percentage tier, even with 3 units', () => {
    expect(getTierDiscountPercent(60, 3)).toBe(0);
  });
});

describe('P0-2 no invented tax in the cart total', () => {
  it('cart total is subtotal − tier discount + shipping only', () => {
    expect(cartTotals(79.13, 1).total).toBe(79.13);
    expect(cartTotals(20, 1).total).toBe(money(20 + FLAT_SHIPPING_RATE));
  });

  it('Cart.tsx contains no estimated-tax calculation', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/pages/Cart.tsx'), 'utf8');
    expect(src).not.toMatch(/0\.08/);
    expect(src).toMatch(/Calculated at checkout/);
  });
});

describe('TIERED_INCENTIVE_UI — display state matches the charge', () => {
  it('$79.13 / 1 unit: free shipping unlocked, no 5% claim, no negative remainder', () => {
    const s = getCartIncentiveState(79.13, 1);
    expect(s.freeShippingUnlocked).toBe(true);
    expect(s.freeShippingRemaining).toBe(0);
    expect(s.discountPercent).toBe(0);
    expect(s.currentTier?.discountPercent).toBe(0);
    expect(s.allRewardsUnlocked).toBe(false);
    expect(s.pendingVolumeTier?.discountPercent).toBe(5);
    expect(s.unitsNeededForVolume).toBe(1);
  });

  it('$104.99 / 1 unit: no 10% applied, no all-rewards message', () => {
    const s = getCartIncentiveState(104.99, 1);
    expect(s.discountPercent).toBe(0);
    expect(s.allRewardsUnlocked).toBe(false);
    expect(s.pendingVolumeTier?.discountPercent).toBe(10);
  });

  it('$70 / 2 units: 5% unlocked', () => {
    const s = getCartIncentiveState(70, 2);
    expect(s.discountPercent).toBe(5);
    expect(s.pendingVolumeTier).toBeNull();
  });

  it('$120 / 2 units: 10% unlocked and all rewards unlocked', () => {
    const s = getCartIncentiveState(120, 2);
    expect(s.discountPercent).toBe(10);
    expect(s.allRewardsUnlocked).toBe(true);
  });

  it('never reports a negative amount to free shipping', () => {
    for (const sub of [0, 10, 34.99, 35, 200]) {
      expect(getCartIncentiveState(sub, 1).freeShippingRemaining).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('P0-4 Pinterest classification', () => {
  const setUA = (ua: string) => {
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
  };

  beforeEach(() => {
    sessionStorage.clear();
  });

  it('E. real Pinterest iOS in-app browser is not a bot', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]',
    );
    const c = getBotClassification();
    expect(c.is_bot).toBe(false);
    expect(c.bot_reason ?? '').not.toContain('ua:pinterest');
  });

  it('F. PinterestBot crawler is still a bot', () => {
    setUA('Mozilla/5.0 (compatible; Pinterestbot/1.0; +https://www.pinterest.com/bot.html)');
    const c = getBotClassification();
    expect(c.is_bot).toBe(true);
    expect(c.bot_reason).toContain('ua:');
  });

  it('the crawler pattern list no longer contains a bare "pinterest" entry', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/botDetection.ts'), 'utf8');
    const list = src.slice(src.indexOf('const CRAWLER_PATTERNS'), src.indexOf('export interface BotClassification'));
    expect(list).toContain("'pinterestbot'");
    expect(list).not.toMatch(/'pinterest'/);
  });
});

describe('P0-3 discount failure fails closed', () => {
  const src = readFileSync(resolve(process.cwd(), 'supabase/functions/create-checkout/index.ts'), 'utf8');

  it('G. returns 503 discount_unavailable before any Checkout Session is created', () => {
    const failIdx = src.indexOf('discount_unavailable');
    const sessionIdx = src.indexOf('stripe.checkout.sessions.create');
    expect(failIdx).toBeGreaterThan(-1);
    expect(sessionIdx).toBeGreaterThan(-1);
    expect(failIdx).toBeLessThan(sessionIdx);
    expect(src.slice(failIdx - 400, failIdx + 600)).toContain('status: 503');
    expect(src.slice(failIdx - 800, failIdx)).toContain('return new Response');
  });

  it('retries coupon creation exactly once before aborting', () => {
    expect(src.match(/stripe\.coupons\.create/g)?.length).toBe(2);
    expect(src).toContain('retry: "1"');
  });

  it('server still gates the tier on total quantity via the canonical engine', () => {
    // Commerce N: the >= 2 rule now lives in the shared pricing engine, which
    // create-checkout calls instead of keeping its own copy.
    expect(src).toContain('computeCartQuote');
    const engine = readFileSync(
      resolve(process.cwd(), 'supabase/functions/_shared/pricing-engine.ts'),
      'utf8',
    );
    expect(engine).toContain('VOLUME_DISCOUNT_MIN_UNITS = 2');
  });
});
