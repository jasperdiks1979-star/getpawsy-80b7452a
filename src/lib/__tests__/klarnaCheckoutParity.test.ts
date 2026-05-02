import { describe, it, expect } from "vitest";
import { splitKlarnaInstallments } from "@/lib/klarna";

/**
 * Parity test: the Klarna "4 interest-free payments" figure shown on
 * /checkout MUST be derived from the EXACT amount that the
 * `create-checkout` edge function asks Stripe to charge.
 *
 * What Stripe actually charges (mirroring create-checkout/index.ts):
 *   - line_items unit_amount = product price (in cents) × quantity
 *   - Stripe coupon (discountCode) → percentage off the LINE-ITEM SUBTOTAL
 *   - shipping is collected separately and NOT included in line_items
 *   - the frontend "tier discount" (Checkout.tsx) is NOT sent to Stripe
 *
 * Therefore: stripeChargedTotal = lineSubtotal × (1 − couponPct/100)
 * and Klarna messaging uses splitKlarnaInstallments(stripeChargedTotal,'USD').
 */

// Mirrors Checkout.tsx VALID_DISCOUNT_CODES.
const COUPONS: Record<string, number> = {
  WELCOME10: 10,
  DONTGO15: 15,
  BUNDLE10: 10,
  BUNDLE15: 15,
  BUNDLE18: 18,
  BUNDLE20: 20,
  SLOWFEEDER25: 25,
};

interface Item { price: number; quantity: number; }

function lineSubtotal(items: Item[]): number {
  return items.reduce((s, i) => s + i.price * i.quantity, 0);
}

/** Mirror of the frontend tier discount input — must NOT affect Stripe charge. */
function tierDiscountAmount(subtotal: number, tierPct: number): number {
  return subtotal * (tierPct / 100);
}

function shipping(subtotal: number, freeThreshold = 50, flat = 4.99): number {
  return subtotal >= freeThreshold ? 0 : flat;
}

/**
 * Source of truth used in Checkout.tsx:
 *   stripeChargedTotal = max(0, totalPrice − couponDiscountAmount)
 */
function stripeChargedTotal(items: Item[], couponCode?: string): number {
  const sub = lineSubtotal(items);
  const pct = couponCode ? (COUPONS[couponCode.toUpperCase()] ?? 0) : 0;
  const couponAmt = (sub * pct) / 100;
  return Math.max(0, sub - couponAmt);
}

/** What Stripe will actually charge in cents (line_items × coupon). */
function stripeChargedCents(items: Item[], couponCode?: string): number {
  const lineCents = items.reduce(
    (s, i) => s + Math.round(i.price * 100) * i.quantity,
    0,
  );
  const pct = couponCode ? (COUPONS[couponCode.toUpperCase()] ?? 0) : 0;
  // Stripe percent_off applied on the subtotal, rounded to nearest cent.
  return Math.round(lineCents * (1 - pct / 100));
}

describe("Klarna 4-instalment ↔ Stripe charge parity", () => {
  it("matches a single $129.99 item with no coupon", () => {
    const items: Item[] = [{ price: 129.99, quantity: 1 }];
    const charged = stripeChargedTotal(items);
    const split = splitKlarnaInstallments(charged, "USD");

    // Sum of 4 instalments (in cents) === Stripe charge (in cents).
    const totalMinor =
      Math.round(split.firstInstallment * 100) +
      Math.round(split.perInstallment * 100) * 3;
    expect(totalMinor).toBe(stripeChargedCents(items));
    expect(charged).toBeCloseTo(129.99, 2);
  });

  it("excludes shipping from the Klarna split", () => {
    const items: Item[] = [{ price: 19.99, quantity: 1 }];
    const charged = stripeChargedTotal(items);
    // Sanity: Klarna split must NOT include shipping cost.
    const ship = shipping(lineSubtotal(items));
    expect(ship).toBe(4.99);
    expect(charged).toBeCloseTo(19.99, 2);
    const split = splitKlarnaInstallments(charged, "USD");
    const totalMinor =
      Math.round(split.firstInstallment * 100) +
      Math.round(split.perInstallment * 100) * 3;
    expect(totalMinor).toBe(stripeChargedCents(items));
    // Shipping is NOT in the cents going to Stripe line_items either.
    expect(stripeChargedCents(items)).toBe(1999);
  });

  it("excludes the FRONTEND tier discount from the Klarna split", () => {
    // Tier discount exists for UI display but is NOT sent to Stripe.
    const items: Item[] = [{ price: 200, quantity: 1 }];
    const tierDiscount = tierDiscountAmount(lineSubtotal(items), 5); // 5% UI-only
    expect(tierDiscount).toBe(10);

    const charged = stripeChargedTotal(items); // no coupon
    expect(charged).toBe(200); // tier discount intentionally NOT subtracted

    const split = splitKlarnaInstallments(charged, "USD");
    expect(split.perInstallment).toBeCloseTo(50, 2);
    expect(split.firstInstallment).toBeCloseTo(50, 2);
  });

  it("applies a percentage coupon (WELCOME10) exactly like Stripe", () => {
    const items: Item[] = [
      { price: 49.99, quantity: 2 }, // 99.98
      { price: 12.5, quantity: 1 },  // 112.48 subtotal
    ];
    const charged = stripeChargedTotal(items, "WELCOME10"); // 10% off
    expect(charged).toBeCloseTo(101.232, 3);

    const split = splitKlarnaInstallments(charged, "USD");
    const totalMinor =
      Math.round(split.firstInstallment * 100) +
      Math.round(split.perInstallment * 100) * 3;
    expect(totalMinor).toBe(stripeChargedCents(items, "WELCOME10"));
  });

  it("absorbs sub-cent rounding remainder into the FIRST instalment", () => {
    // 100.03 / 4 = 25.0075 → base 25.00, remainder 3¢ → first 25.03.
    const items: Item[] = [{ price: 100.03, quantity: 1 }];
    const charged = stripeChargedTotal(items);
    const split = splitKlarnaInstallments(charged, "USD");
    expect(split.perInstallment).toBeCloseTo(25.0, 2);
    expect(split.firstInstallment).toBeCloseTo(25.03, 2);
    const totalMinor =
      Math.round(split.firstInstallment * 100) +
      Math.round(split.perInstallment * 100) * 3;
    expect(totalMinor).toBe(stripeChargedCents(items));
  });

  it("handles BUNDLE20 on a multi-line cart with quantity > 1", () => {
    const items: Item[] = [
      { price: 75, quantity: 3 },   // 225
      { price: 19.99, quantity: 2 },// 39.98 → subtotal 264.98
    ];
    const charged = stripeChargedTotal(items, "BUNDLE20"); // 20% off → 211.984
    const split = splitKlarnaInstallments(charged, "USD");
    const totalMinor =
      Math.round(split.firstInstallment * 100) +
      Math.round(split.perInstallment * 100) * 3;
    expect(totalMinor).toBe(stripeChargedCents(items, "BUNDLE20"));
  });

  it("never quotes a per-instalment higher than charge/4 (no over-promise)", () => {
    const cases = [35, 35.01, 99.99, 250.7, 1000, 7521.37];
    for (const total of cases) {
      const split = splitKlarnaInstallments(total, "USD");
      // perInstallment is the user-facing number; must be <= exact quarter.
      expect(split.perInstallment).toBeLessThanOrEqual(total / 4 + 1e-9);
    }
  });
});
