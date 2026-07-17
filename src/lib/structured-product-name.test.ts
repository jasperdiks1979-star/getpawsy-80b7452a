import { describe, it, expect } from "vitest";
import { buildStructuredProductName, STRUCTURED_NAME_MAX } from "./structured-product-name";

describe("buildStructuredProductName", () => {
  it("returns clean name unchanged when short", () => {
    expect(buildStructuredProductName({ name: "Fully Enclosed Cat Litter Box" }))
      .toBe("Fully Enclosed Cat Litter Box");
  });

  it("prefers name_clean over name", () => {
    expect(
      buildStructuredProductName({ name: "Raw supplier junk", name_clean: "Enclosed Cat Litter Box" })
    ).toBe("Enclosed Cat Litter Box");
  });

  it("accepts exactly 150 chars unchanged", () => {
    const s = "a".repeat(150);
    const out = buildStructuredProductName({ name: s });
    expect(out).toBe(s);
    expect([...out].length).toBe(150);
  });

  it("truncates over 150 to <= 150 without splitting a word", () => {
    const long =
      "Fully Enclosed Cat Litter Box with Lid & Drawer Design, Covered Litter Box Anti-Leakage, Anti-Splashing, for Indoor Cats from Kitten to Adult, with Scoop & Mat, Easy Clean, Odor Control, Green";
    const out = buildStructuredProductName({ name: long });
    expect([...out].length).toBeLessThanOrEqual(150);
    // ends in ellipsis, does not end on comma/hyphen/space
    expect(out.endsWith("…")).toBe(true);
    expect(/[\s,;\-–—/|&]…$/.test(out)).toBe(false);
    // no word is split — last real word must appear in the source
    const withoutEllipsis = out.slice(0, -1).trim();
    const lastWord = withoutEllipsis.split(/\s+/).pop() ?? "";
    expect(long).toContain(lastWord);
  });

  it("strips HTML", () => {
    const out = buildStructuredProductName({ name: "<b>Cat</b> <i>Bed</i>" });
    expect(out).toBe("Cat Bed");
  });

  it("normalizes whitespace and control characters", () => {
    const out = buildStructuredProductName({ name: "Cat\t\n  Bed\u0000 Deluxe" });
    expect(out).toBe("Cat Bed Deluxe");
  });

  it("returns safe fallback on empty input", () => {
    expect(buildStructuredProductName({ name: "" })).toBe("GetPawsy pet product");
    expect(buildStructuredProductName({ name: "   " })).toBe("GetPawsy pet product");
    expect(buildStructuredProductName({})).toBe("GetPawsy pet product");
  });

  it("counts code points, not UTF-16 units, and keeps emoji intact", () => {
    const emoji = "🐱".repeat(200); // 200 code points, 400 UTF-16 units
    const out = buildStructuredProductName({ name: emoji });
    expect([...out].length).toBeLessThanOrEqual(STRUCTURED_NAME_MAX);
    // no dangling half-surrogate
    expect(out).not.toMatch(/[\uD800-\uDFFF]$/);
  });

  it("condenses a long supplier keyword dump under the cap", () => {
    const supplier =
      "Premium Deluxe Ultra Large Extra Soft Orthopedic Memory Foam Waterproof Non-Slip Machine Washable Removable Cover Dog Bed for Small Medium Large Extra Large Breed Dogs and Puppies with Bolster Pillow";
    const out = buildStructuredProductName({ name: supplier });
    expect([...out].length).toBeLessThanOrEqual(STRUCTURED_NAME_MAX);
  });
});