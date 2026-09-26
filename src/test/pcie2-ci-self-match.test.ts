import { describe, it, expect } from "vitest";
import { recentExcludingSelf } from "../../supabase/functions/pcie2-creative-intelligence/recent";

// Mirror of the checker's unchanged similarity rule (jaccard, flag when > 60).
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
function jaccard(a: string, b: string) {
  const A = new Set(norm(a).split(" ").filter(Boolean));
  const B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let i = 0; for (const t of A) if (B.has(t)) i++;
  return i / (A.size + B.size - i);
}
const dupScore = (h: string, recent: string[]) =>
  Math.round(Math.max(0, ...recent.map((r) => jaccard(h, r))) * 100);

const H = "Floor-to-Ceiling Cat Tree for Indoor Cats";

describe("PCIE2 duplicate comparison set", () => {
  it("a row does not match itself", () => {
    const recent = recentExcludingSelf([{ id: "self", headline: H }], "self");
    expect(recent).toEqual([]);
    expect(dupScore(H, recent)).toBeLessThanOrEqual(60);
  });

  it("a separate row with an identical title still triggers duplicate protection", () => {
    const recent = recentExcludingSelf([{ id: "self", headline: H }, { id: "other", headline: H }], "self");
    expect(dupScore(H, recent)).toBe(100);
  });

  it("a separate row with a near-identical title still triggers (>60)", () => {
    const recent = recentExcludingSelf([{ id: "other", headline: "Floor to Ceiling Cat Tree for Indoor Cats Today" }], "self");
    expect(dupScore(H, recent)).toBeGreaterThan(60);
  });

  it("unrelated rows are kept in the set and do not trigger", () => {
    const rows = [{ id: "self", headline: H }, { id: "a", headline: "White Cat Litter Box Enclosure with Drawers" }, { id: "b", headline: null }];
    const recent = recentExcludingSelf(rows, "self");
    expect(recent).toEqual(["White Cat Litter Box Enclosure with Drawers"]);
    expect(dupScore(H, recent)).toBeLessThanOrEqual(60);
  });
});
