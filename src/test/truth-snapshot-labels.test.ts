import { describe, it, expect } from "vitest";
import { isRowCapped, countLabel, HUMAN_LABEL, SAMPLE_NOTE } from "@/lib/truth-snapshot-labels";

describe("truth snapshot labels", () => {
  it("flags counts at the 1000-row cap as samples", () => {
    expect(isRowCapped(1000)).toBe(true);
    expect(countLabel("Sessions", 1000)).toMatch(/sample/);
    expect(countLabel("Events", 1000)).toMatch(/capped at 1000/);
  });
  it("leaves uncapped counts plain", () => {
    expect(isRowCapped(999)).toBe(false);
    expect(isRowCapped(null)).toBe(false);
    expect(countLabel("Sessions", 240)).toBe("Sessions");
  });
  it("never presents humans as confirmed and unknown as human", () => {
    expect(HUMAN_LABEL).toMatch(/not confirmed/);
    expect(SAMPLE_NOTE).toMatch(/unknown, not human/);
  });
});
