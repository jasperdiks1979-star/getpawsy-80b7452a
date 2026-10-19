import { describe, it, expect } from "vitest";
import { listingPrice } from "@/lib/listingPrice";
import { customerUnitPrice } from "@/lib/customerUnitPrice";
import { canonicalUnitPrice } from "../../supabase/functions/_shared/order-state";

// Live 54" cat tree data, 19 Oct 2026: base 158.99, two marked options.
const pink = { variantNameEn: "Pink", variantSellPrice: 162.99, variantCostPrice: 44.38 };
const grey = { variantNameEn: "Light grey", variantSellPrice: 164.99, variantCostPrice: 45.52 };

describe("54-inch cat tree per-colour price", () => {
  it("card shows From 162.99, never base 158.99", () => {
    expect(listingPrice(158.99, [grey, pink])).toMatchObject({ price: 162.99, max: 164.99, isRange: true });
  });
  it("Pink charges 162.99, Light grey 164.99 (client == checkout)", () => {
    expect(customerUnitPrice(158.99, pink, 2)).toBe(162.99);
    expect(customerUnitPrice(158.99, grey, 2)).toBe(164.99);
    expect(canonicalUnitPrice(158.99, pink as never, 2)).toBe(162.99);
    expect(canonicalUnitPrice(158.99, grey as never, 2)).toBe(164.99);
  });
});
