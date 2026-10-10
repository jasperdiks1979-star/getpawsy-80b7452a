import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import USProductDescription from "@/components/products/USProductDescription";
import { readFileSync } from "node:fs";

describe("USProductDescription spec parser", () => {
  it("keeps decimals and hyphenated words intact", () => {
    const { container } = render(
      <USProductDescription productName="Litter Box" description="Material: non-sticky anti-leak stainless steel. Weight: 15.9 lb. Package size: 60 x 45 x 20 cm." />,
    );
    const t = container.textContent || "";
    expect(t).toContain("15.9 lb");
    expect(t).toContain("non-sticky anti-leak stainless steel");
    expect(t).toMatch(/Package size: 60 x 45 x 20 cm/);
  });
  it("homepage cat toys tile links to the cat-toys collection", () => {
    const f = readFileSync("src/components/v2/storefront/V2HomePage.tsx", "utf8");
    expect(f).toContain("href: '/collections/cat-toys', title: 'Cat toys'");
    expect(f).not.toContain("commercial range");
  });
});
