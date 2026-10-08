import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildConsolidationStub } from "../../vite-plugin-prerender-guides";

describe("legacy /product/<slug> alias stubs", () => {
  const shell = readFileSync("index.html", "utf8");
  const stub = buildConsolidationStub(shell, "/products/automatic-cat-litter-box-self-cleaning-app-control");
  it("raw HTML is noindex,follow with canonical to the /products/ URL", () => {
    expect(stub).toMatch(/<meta name="robots" content="noindex, follow"/);
    expect(stub).toContain('href="https://getpawsy.pet/products/automatic-cat-litter-box-self-cleaning-app-control"');
    expect((stub.match(/rel="canonical"/g) ?? []).length).toBe(1);
    expect(stub).not.toMatch(/<meta name="robots" content="index/);
  });
  it("prerender writes stubs only under /product/ and keeps /products/ pages intact", () => {
    const src = readFileSync("vite-plugin-prerender-products.ts", "utf8");
    expect(src).toContain("path.join(distDir, 'product', slug)");
    expect(src).toContain("buildConsolidationStub(spaHtml, `/products/${slug}`)");
  });
});
