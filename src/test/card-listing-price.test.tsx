import { describe, it, expect } from "vitest";
import { listingPrice } from "@/lib/listingPrice";
import { readFileSync } from "node:fs";
// Live catalogue shapes, 12 Oct 2026.
describe("cards advertise the charged (listing) price", () => {
  it("RVS 96.99 base, marked options 97.95 → 97.95", () => {
    const v = { variantSellPrice: 97.95, variantCostPrice: 32.96 };
    expect(listingPrice(96.99, [v, v, v]).price).toBe(97.95);
  });
  it("LED ball → From 19.99 (range to 27.49)", () => {
    const lp = listingPrice(16.99, [{ variantSellPrice: 19.99, variantCostPrice: 1.76 }, { variantSellPrice: 19.99, variantCostPrice: 1.76 }, { variantSellPrice: 27.49, variantCostPrice: 4.17 }]);
    expect(lp).toMatchObject({ price: 19.99, max: 27.49, isRange: true });
  });
  it("cat tree with raw supplier cost single option stays at base", () => {
    expect(listingPrice(158.99, [{ variantSellPrice: 68.88 }]).price).toBe(158.99);
  });
  it("ProductCard and V2ProductCard use useListingPrice", () => {
    expect(readFileSync("src/components/products/ProductCard.tsx", "utf8")).toContain("useListingPrice(");
    expect(readFileSync("src/components/v2/storefront/V2ProductCard.tsx", "utf8")).toContain("useListingPrice(");
  });
});
