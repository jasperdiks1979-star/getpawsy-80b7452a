import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

// Files that render storefront-visible copy or structured data.
const SURFACES = [
  "src/components/products/ProductFAQAccordion.tsx",
  "src/components/seo/FAQSchema.tsx",
  "src/components/seo/CategoryPopularProducts.tsx",
  "src/components/products/CategoryEmptyState.tsx",
  "src/components/products/BestsellerBundleSection.tsx",
  "src/components/cart/CartUpsell.tsx",
];

// Claims with no evidence anywhere in the catalog or order history.
const FORBIDDEN = [
  /Frequently Bought Together/i,
  /Most customers/i,
  /Best Seller(s)?\b/i,
  /Popular (with|in|picks|this)/i,
  /self-?clean/i,
  /infrared sensor/i,
  /BPA-free/i,
  /non-toxic/i,
  /airline (approved|cabin)/i,
  /tested (to ensure|with|by)/i,
];

describe("Phase 12 — unsupported claims stay out of storefront copy and schema", () => {
  it.each(SURFACES)("%s contains no unsupported claim", (path) => {
    const src = read(path);
    // Strip comments: explanatory notes may quote the removed wording.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const re of FORBIDDEN) {
      expect(code, `${path} must not claim ${re}`).not.toMatch(re);
    }
  });

  it("product FAQs answer policy only, never invented product attributes", () => {
    const src = read("src/components/products/ProductFAQAccordion.tsx");
    expect(src).toContain("DELIVERY_TIME_STANDARD");
    expect(src).toContain("RETURN_WINDOW_DAYS");
    // No category branching that fabricates per-type answers.
    expect(src).not.toContain("isCatTree");
    expect(src).not.toContain("isLitter");
  });
});
