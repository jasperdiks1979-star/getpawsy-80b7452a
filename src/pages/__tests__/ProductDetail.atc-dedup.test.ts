import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for the ATC dedup fix.
 *
 * Production smoke (2026-06-29) showed `add_to_cart_click` firing twice per
 * tap when geo was unsupported (one base call + one geo-region call). The fix
 * folds geo metadata into a SINGLE `trackCci('add_to_cart_click', ...)` call
 * inside `handleAddToCart`. This test enforces that contract by static-
 * analyzing the function body so any future regression that re-introduces a
 * second click emission inside the handler fails CI.
 *
 * It also asserts that `add_to_cart_success` emission is preserved.
 */
describe("ProductDetail.handleAddToCart — ATC dedup regression", () => {
  const SRC = readFileSync(
    resolve(__dirname, "..", "ProductDetail.tsx"),
    "utf8",
  );

  // Extract the body of handleAddToCart by brace-matching from its declaration.
  const extractHandlerBody = (src: string): string => {
    const sig = "const handleAddToCart = () => {";
    const start = src.indexOf(sig);
    expect(start, "handleAddToCart not found in ProductDetail.tsx").toBeGreaterThan(-1);
    let depth = 0;
    let i = start + sig.length - 1; // points at the opening `{`
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return src.slice(start, i + 1);
      }
    }
    throw new Error("Could not brace-match handleAddToCart body");
  };

  const body = extractHandlerBody(SRC);

  it("emits add_to_cart_click exactly once per invocation", () => {
    const clicks = body.match(/trackCci\(\s*['"]add_to_cart_click['"]/g) ?? [];
    expect(
      clicks.length,
      `Expected a single add_to_cart_click emission in handleAddToCart, found ${clicks.length}. ` +
        `Fold any geo/region metadata into the single trackCci call instead of emitting a second one.`,
    ).toBe(1);
  });

  it("still emits add_to_cart_success (success path untouched)", () => {
    const successes = body.match(/trackCci\(\s*['"]add_to_cart_success['"]/g) ?? [];
    expect(successes.length).toBeGreaterThanOrEqual(1);
  });

  it("preserves geo_lookup_failed soft signal for unknown country", () => {
    expect(body).toMatch(/trackCci\(\s*['"]geo_lookup_failed['"]/);
  });

  it("never blocks ATC with an early return on geo state", () => {
    // The only allowed early return is the out-of-stock guard.
    const earlyReturns = body.match(/return\s*;/g) ?? [];
    // out_of_stock branch is the single legitimate early return.
    expect(body).toMatch(/reason:\s*['"]out_of_stock['"]/);
    expect(
      earlyReturns.length,
      "handleAddToCart must not early-return for geo reasons — cart writes are unconditional.",
    ).toBeLessThanOrEqual(1);
  });
});