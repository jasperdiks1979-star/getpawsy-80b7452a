import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { listingPrice } from "@/lib/listingPrice";
import { customerUnitPrice } from "@/lib/customerUnitPrice";
import { US_ARRIVAL } from "@/components/checkout/ShippingPrecheck";
import USProductDescription from "@/components/products/USProductDescription";
import { WhyPetParentsLoveThis } from "@/components/products/WhyPetParentsLoveThis";
import { DELIVERY_TIME_TOTAL_ESTIMATE, PRODUCT_SHIPPING_INFO } from "@/lib/shipping-constants";

describe("listingPrice — one advertised price for PDP, schema and feed", () => {
  it("RVS litter box: base 96.99, all marked options 97.95 → 97.95", () => {
    const v = { variantSellPrice: 97.95, variantCostPrice: 40 };
    const lp = listingPrice(96.99, [v, v, v]);
    expect(lp).toMatchObject({ price: 97.95, isRange: false, differsFromBase: true });
    expect(lp.price).toBe(customerUnitPrice(96.99, v, 3));
  });
  it("mixed options → lowest purchasable, range", () => {
    const lp = listingPrice(50, [{ variantSellPrice: 55, variantCostPrice: 1 }, { variantSellPrice: 60, variantCostPrice: 1 }]);
    expect(lp).toMatchObject({ price: 55, max: 60, isRange: true });
  });
  it("out-of-stock option never sets the advertised minimum", () => {
    const lp = listingPrice(50, [
      { variantSellPrice: 30, variantCostPrice: 1, variantStock: 0 },
      { variantSellPrice: 60, variantCostPrice: 1, variantStock: 5 },
    ]);
    expect(lp.price).toBe(60);
  });
  it("raw supplier cost (no marker) and single option → base price", () => {
    expect(listingPrice(72.49, [{ variantSellPrice: 26.84 }, { variantSellPrice: 26.84 }]).price).toBe(72.49);
    expect(listingPrice(103.99, [{ variantSellPrice: 51.01 }]).price).toBe(103.99);
    expect(listingPrice(19.99, null).price).toBe(19.99);
  });
  it("feed generator, prerender and PDP all use listingPrice with variants", () => {
    const feed = readFileSync("vite-plugin-sitemaps.ts", "utf8");
    expect(feed).toContain("listingPrice(p.price, p.variants).price");
    expect(feed).toMatch(/weight,is_active,variants&is_active=eq\.true&is_duplicate=eq\.false&price=gt\.0/);
    const pre = readFileSync("vite-plugin-prerender-products.ts", "utf8");
    expect(pre).toContain("listingPrice(product.price, product.variants).price");
    expect(pre).toContain("select=id,slug,name,description,price,variants,");
    const pdp = readFileSync("src/pages/ProductDetail.tsx", "utf8");
    expect(pdp).toContain("listingPrice(Number(product.price), product.variants)");
  });
});

describe("no name/category-guessed product facts", () => {
  it("litter box named '...Mat Included' renders no mat template claims or synthesized intro/praise", () => {
    const { container } = render(
      <USProductDescription
        productId="1daefaa0-7892-4760-87a9-0aa34c49c767"
        productName="Stainless Steel Cat Litter Box with Lid, Scoop and Mat Included"
        description="Stainless steel litter box with a lid. Includes a scoop and a mat."
      />,
    );
    const t = container.textContent || "";
    for (const bad of ["resting surface", "quick-drying", "Portable and versatile", "Non-slip backing", "Why Pet Parents Love It", "versatile addition"]) {
      expect(t).not.toContain(bad);
    }
    expect(t).toContain("Stainless steel litter box with a lid.");
  });
  it("dog ramp / cat toy get no generic benefit bullets", () => {
    for (const name of ["Folding Dog Ramp for Bed", "Feather Cat Toy Wand"]) {
      const { container } = render(<USProductDescription productName={name} description="" />);
      expect(container.textContent).not.toMatch(/Key Benefits|Encourages active play|pet-safe materials/);
    }
  });
  it("WhyPetParentsLoveThis renders nothing without a verified override", () => {
    const { container } = render(<WhyPetParentsLoveThis productId="none" productName="Dog Bed" category="beds" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("shipping: handling 1–2 + transit 5–10 = estimated 6–12", () => {
  it("checkout arrival and shared total agree", () => {
    expect(US_ARRIVAL).toEqual({ min: 6, max: 12 });
    expect(DELIVERY_TIME_TOTAL_ESTIMATE).toBe("6–12 business days");
    expect(PRODUCT_SHIPPING_INFO.deliveryTime).toMatch(/Processing 1–2 business days, then 5–10 business days US transit/);
  });
});

import { getCanonicalCardPrice } from "@/lib/canonical-pricing";
import { getDisplayPrice } from "@/lib/merchant-safe-product";
describe("cards and runtime ProductSchema use the shared listing price", () => {
  const v = { variantSellPrice: 97.95, variantCostPrice: 40 };
  it("card price and schema price = listingPrice when variants loaded", () => {
    expect(getCanonicalCardPrice({ price: 96.99, variants: [v, v, v] }).price).toBe(97.95);
    expect(getDisplayPrice({ price: 96.99, variants: [v, v, v] } as never).price).toBe(97.95);
  });
  it("without variant data falls back to products.price (no invented value)", () => {
    expect(getCanonicalCardPrice({ price: 96.99 }).price).toBe(96.99);
  });
  it("shopper copy no longer labels transit as total delivery", () => {
    for (const f of ["src/components/products/ConversionBlock.tsx", "src/components/home/FreeShippingBanner.tsx", "src/pages/BestsellerDetail.tsx", "src/components/home/WhyShopGetPawsy.tsx"]) {
      expect(readFileSync(f, "utf8")).not.toContain("Estimated delivery: 5–10 business days");
    }
  });
});
