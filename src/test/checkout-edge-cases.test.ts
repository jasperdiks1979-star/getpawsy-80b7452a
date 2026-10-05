import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeCartQuote as clientQuote } from "@/lib/cart-pricing";
import { computeCartQuote as serverQuote } from "../../supabase/functions/_shared/pricing-engine";
import { STOREFRONT_COUPONS } from "@/lib/couponCodes";
import { guardVariantPricing } from "../../supabase/functions/_shared/variant-price-guard";
import { canonicalUnitPrice } from "../../supabase/functions/_shared/order-state";

const r = (p: string) => readFileSync(p, "utf8");
const serverCoupons = (): Record<string, number> => {
  const m = r("supabase/functions/create-checkout/index.ts").match(/COUPON_CODE_PERCENT[^{]*\{([\s\S]*?)\};/);
  const out: Record<string, number> = {};
  for (const [, k, v] of m![1].matchAll(/(\w+):\s*(\d+)/g)) out[k] = Number(v);
  return out;
};

describe("checkout totals: cart == server == Stripe", () => {
  const carts: Array<[string, Array<{ unitPriceCents: number; quantity: number }>, number]> = [
    ["single under free shipping", [{ unitPriceCents: 1999, quantity: 1 }], 0],
    ["exactly at threshold", [{ unitPriceCents: 3500, quantity: 1 }], 0],
    ["one unit over 99 (no volume tier)", [{ unitPriceCents: 10399, quantity: 1 }], 10],
    ["bundle x3 hits 5%", [{ unitPriceCents: 2233, quantity: 3 }], 0],
    ["bundle + coupon half-cent rounding", [{ unitPriceCents: 3315, quantity: 2 }], 15],
    ["mixed multi-line 10% + SLOWFEEDER25", [{ unitPriceCents: 4999, quantity: 2 }, { unitPriceCents: 1999, quantity: 1 }], 25],
  ];
  for (const [label, lines, coupon] of carts) {
    it(label, () => {
      const c = clientQuote(lines, { couponPercent: coupon });
      expect(c).toEqual(serverQuote(lines, { couponPercent: coupon }));
      expect(c.totalCents).toBe(c.subtotalCents - c.totalDeductionCents + c.shippingCents);
    });
  }
  it("single unit never earns a volume tier", () => {
    expect(clientQuote([{ unitPriceCents: 12000, quantity: 1 }]).tierPercent).toBe(0);
  });
  it("Checkout page renders totals from the canonical cents engine", () => {
    const s = r("src/pages/Checkout.tsx");
    expect(s).toContain("computeCartQuote(");
    expect(s).not.toMatch(/totalPrice \* \(tierDiscountPercent/);
  });
});

describe("coupon codes", () => {
  it("every storefront code is charged at the same percent by the server", () => {
    const srv = serverCoupons();
    for (const [code, { discount }] of Object.entries(STOREFRONT_COUPONS)) expect(srv[code]).toBe(discount);
  });
  it("the promised SLOWFEEDER25 code is accepted at checkout", () => {
    expect(STOREFRONT_COUPONS.SLOWFEEDER25.discount).toBe(25);
  });
});

describe("stale carts and retries", () => {
  it("409 price_mismatch stays and tells the cart the current price of the exact line", () => {
    const s = r("supabase/functions/create-checkout/index.ts");
    expect(s).toContain('code: "price_mismatch"');
    expect(s).toMatch(/line_id:.*client_line_id/);
    expect(s).toContain("current_price: serverUnitPrice");
  });
  it("cart re-prices the line and asks the shopper to review (no auto-retry)", () => {
    const s = r("src/pages/Checkout.tsx");
    const i = s.indexOf("parsed?.code === 'price_mismatch'");
    expect(i).toBeGreaterThan(0);
    const block = s.slice(i, i + 900);
    expect(block).toContain("repriceItem(");
    expect(block).toContain("setIsProcessing(false)");
    expect(block).not.toContain("invoke(");
  });
  it("double-click reuses the attempt; changed params get a fresh Stripe idempotency key", () => {
    const s = r("supabase/functions/create-checkout/index.ts");
    expect(s).toContain("checkoutAttemptId(");
    expect(s).toMatch(/checkout_\$\{attemptId\}_\$\{paramsDigest\}/);
  });
});

describe("supplier sync never puts supplier cost into a sell price", () => {
  const existing = [{ vid: "a", variantSellPrice: 97.95, variantCostPrice: 40 }];
  it("keeps processed sell price + marker, records fresh cost separately", () => {
    expect(guardVariantPricing(existing, { vid: "a", variantSellPrice: 41.2 })).toEqual({
      variantSellPrice: 97.95, variantCostPrice: 40, supplierCostPrice: 41.2,
    });
  });
  it("never marks a raw CJ price as processed", () => {
    const g = guardVariantPricing([], { vid: "x", variantSellPrice: 26.84, variantCostPrice: 26.84 });
    expect(g.variantCostPrice).toBeNull();
    expect(canonicalUnitPrice(72.49, { vid: "x", ...g } as never, 2)).toBe(72.49);
  });
  it("both variant-rebuilding syncs use the guard", () => {
    for (const f of ["cj-stock-reconcile", "cj-backfill-media-variants"]) {
      expect(r(`supabase/functions/${f}/index.ts`)).toContain("guardVariantPricing(");
    }
  });
});
