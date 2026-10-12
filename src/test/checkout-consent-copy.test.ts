import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(__dirname, "../pages/Checkout.tsx"), "utf8");

describe("checkout consent copy", () => {
  it("terms consent starts unchecked", () => {
    expect(src).toMatch(/useState\(false\);\s*\/\/ explicit, never pre-checked consent/);
  });
  it("contains no liability disclaimer", () => {
    expect(src).not.toMatch(/not the manufacturer/i);
    expect(src).not.toMatch(/full responsibility/i);
  });
  it("keeps Terms, Privacy and Return links on desktop and mobile", () => {
    for (const p of ["/terms", "/privacy", "/returns"]) {
      expect(src.split(`to="${p}"`).length - 1).toBeGreaterThanOrEqual(2);
    }
  });
  it("pay button stays gated on consent", () => {
    expect(src).toContain("isProcessing || !acceptedTerms");
  });
});
