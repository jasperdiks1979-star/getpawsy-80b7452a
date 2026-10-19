import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isBundleUpsellReady } from "@/lib/commerceBundleReleaseGate";
import { getProductContentOverride } from "@/config/product-content-overrides";
import { listingPrice } from "@/lib/listingPrice";

const RVS = "1daefaa0-7892-4760-87a9-0aa34c49c767";

describe("Complete the setup bundle stays hidden until variant parity is proven", () => {
  it("gate is closed", () => {
    expect(isBundleUpsellReady()).toBe(false);
  });
  it("PDP renders the bundle only through the gate", () => {
    expect(readFileSync("src/pages/ProductDetail.tsx", "utf8")).toContain("isBundleUpsellReady() && (relatedLoading");
  });
  it("RVS base 96.99 but charged variant 97.95 — the mismatch the gate guards", () => {
    const v = { variantSellPrice: 97.95, variantCostPrice: 32.96 };
    expect(listingPrice(96.99, [v, v, v]).price).toBe(97.95);
  });
});

describe("stainless steel litter box is described as manual", () => {
  const o = getProductContentOverride(RVS)!;
  it("mentions lid, scoop and mat; denies automatic/sensors/app", () => {
    const text = JSON.stringify(o);
    expect(text).toMatch(/lid/);
    expect(text).toMatch(/scoop/);
    expect(text).toMatch(/mat/);
    expect(o.faqs?.[0].a).toMatch(/no automatic cleaning, no sensors and no app/);
    expect(o.hideSections).toContain("litterBoxConversionBoost");
  });
});
