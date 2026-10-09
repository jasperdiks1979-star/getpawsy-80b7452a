import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { initialDisplayPrice } from "@/lib/initialDisplayPrice";
import { customerUnitPrice } from "@/lib/customerUnitPrice";
import { US_ARRIVAL } from "@/components/checkout/ShippingPrecheck";

describe("PDP initial price = purchasable variant price", () => {
  it("RVS litter box shape: base 96.99, all options 97.95 → shows 97.95, no range", () => {
    const v = { variantSellPrice: 97.95, variantCostPrice: 40 };
    const resolved = [v, v, v].map((x) => customerUnitPrice(96.99, x, 3));
    expect(initialDisplayPrice(96.99, resolved)).toEqual({ price: 97.95, isRange: false });
  });
  it("mixed options → lowest with range flag", () => {
    expect(initialDisplayPrice(50, [55, 60])).toEqual({ price: 55, isRange: true });
  });
  it("no variants / raw supplier cost → base price", () => {
    expect(initialDisplayPrice(19.99, [])).toEqual({ price: 19.99, isRange: false });
    const raw = customerUnitPrice(72.49, { variantSellPrice: 26.84 }, 2);
    expect(initialDisplayPrice(72.49, [raw, raw]).price).toBe(72.49);
  });
});

describe("Key Benefits never padded with category guesses", () => {
  it("USProductDescription no longer appends getTypeBenefits output", () => {
    const src = readFileSync("src/components/products/USProductDescription.tsx", "utf8");
    expect(src).not.toMatch(/typeBenefits\.forEach/);
  });
});

describe("checkout US arrival matches shared shipping windows", () => {
  it("handling 1–2 + transit 5–10 = 6–12 business days", () => {
    expect(US_ARRIVAL).toEqual({ min: 6, max: 12 });
  });
});
