import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression: prie-brain-sync once queried `pinterest_pins.status`, a column that
 * does not exist. PostgREST returned an error, the code swallowed it (`data ?? []`),
 * and creative_score silently froze at its floor value.
 */
describe("prie-brain-sync — Pinterest schema safety", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "supabase/functions/prie-brain-sync/index.ts"),
    "utf8",
  );

  it("never selects a status column from pinterest_pins", () => {
    const pinsSelect = /from\(["']pinterest_pins["']\)\s*\.select\(([^)]*)\)/g;
    for (const m of src.matchAll(pinsSelect)) {
      expect(m[1]).not.toMatch(/status/);
    }
  });

  it("reads pin publish status from pinterest_pin_queue", () => {
    expect(src).toMatch(/from\(["']pinterest_pin_queue["']\)\s*\.select\(["'][^"']*status/);
  });

  it("uses a status value that exists in pinterest_pin_queue", () => {
    const allowed = [
      "draft",
      "queued",
      "posted",
      "paused",
      "failed",
      "rejected",
      "skipped",
      "blocked_legacy_source",
    ];
    const used = [...src.matchAll(/p\.status === ["']([^"']+)["']/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const s of used) expect(allowed).toContain(s);
  });

  it("throws on read errors instead of scoring on empty data", () => {
    expect(src).toContain("prie-brain-sync read failure");
  });
});
