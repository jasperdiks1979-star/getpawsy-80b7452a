import { describe, it, expect } from "vitest";
import { customerUnitPrice } from "@/lib/customerUnitPrice";
import { canonicalUnitPrice, validateLinePrice } from "../../supabase/functions/_shared/order-state";
import { quickAddUnitPrice } from "@/lib/quickAdd";

// Representative live catalogue shapes (Oct 2026 audit).
const CASES: Array<[string, number, Record<string, unknown> | null, number]> = [
  ["single, raw supplier cost (cat tree)", 103.99, { vid: "a", variantSellPrice: 51.01 }, 1],
  ["single, stale processed price", 114.99, { vid: "a", variantSellPrice: 111.99, variantCostPrice: 44.97 }, 1],
  ["single, equal", 39.99, { vid: "a", variantSellPrice: 39.99, variantCostPrice: 15 }, 1],
  ["single, high-ticket raw cost", 498.99, { vid: "a", variantSellPrice: "210.5" }, 1],
  ["multi, processed option", 96.99, { vid: "b", variantSellPrice: 97.95, variantCostPrice: 40 }, 3],
  ["multi, raw supplier cost option", 72.49, { vid: "b", variantSellPrice: 26.84 }, 2],
  ["no variants", 19.99, null, 0],
];

describe("checkout price authority (client == server)", () => {
  for (const [label, base, v, n] of CASES) {
    it(label, () => {
      const client = customerUnitPrice(base, v as never, n);
      const server = canonicalUnitPrice(base, v as never, n);
      expect(client).toBe(server);
      expect(quickAddUnitPrice(base, v as never, n)).toBe(server);
      expect(validateLinePrice({ clientPrice: client, serverPrice: server }).ok).toBe(true);
    });
  }
  it("single-option products charge the displayed base price", () => {
    expect(canonicalUnitPrice(103.99, { vid: "a", variantSellPrice: 51.01 }, 1)).toBe(103.99);
  });
  it("still rejects a tampered client price (409 protection kept)", () => {
    expect(validateLinePrice({ clientPrice: 51.01, serverPrice: 103.99 }).ok).toBe(false);
  });
  it("create-checkout passes the variant count to the price rule", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("supabase/functions/create-checkout/index.ts", "utf8");
    expect(src).toMatch(/canonicalUnitPrice\(\s*Number\(p\.price\),\s*variant,\s*Array\.isArray\(p\.variants\)/);
    expect(src).toContain('code: "price_mismatch"');
  });
});
