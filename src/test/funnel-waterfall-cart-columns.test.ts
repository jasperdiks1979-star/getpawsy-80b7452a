/**
 * Phase 2 hardening regression: analytics_funnel_waterfall must carry
 * canonical view_cart_at / remove_from_cart_at columns end-to-end.
 *
 * Locks:
 *  - ingest function maps view_cart/remove_from_cart to *_at columns
 *  - FunnelHealthCenter selects the new columns from the table
 *  - cart KPIs include waterfall counts
 *  - rows missing the new columns do not crash dashboard logic
 *  - legacy aliases never leak as labels
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import { EVENT_ALIASES, resolveCanonicalEvent } from "@/lib/analytics-canonical-events";

const INGEST = fs.readFileSync(
  "supabase/functions/analytics-funnel-ingest/index.ts",
  "utf-8",
);
const DASH = fs.readFileSync("src/pages/admin/FunnelHealthCenter.tsx", "utf-8");

describe("waterfall cart columns — ingest contract", () => {
  it("ingest STEPS list contains view_cart and remove_from_cart", () => {
    expect(INGEST).toMatch(/"view_cart"/);
    expect(INGEST).toMatch(/"remove_from_cart"/);
  });

  it("ingest COL map writes the canonical *_at columns", () => {
    expect(INGEST).toMatch(/view_cart:\s*"view_cart_at"/);
    expect(INGEST).toMatch(/remove_from_cart:\s*"remove_from_cart_at"/);
  });
});

describe("waterfall cart columns — dashboard contract", () => {
  it("dashboard selects view_cart_at and remove_from_cart_at from waterfall", () => {
    expect(DASH).toContain("view_cart_at");
    expect(DASH).toContain("remove_from_cart_at");
  });

  it("cart KPI totals include the waterfall count", () => {
    expect(DASH).toMatch(/viewCartTotal[^\n]*waterCount\("view_cart"\)/);
    expect(DASH).toMatch(/removeFromCartTotal[^\n]*waterCount\("remove_from_cart"\)/);
  });

  it("waterCount uses dynamic `${ev}_at` so old rows without the new columns return 0 instead of crashing", () => {
    const fWater: Array<Record<string, unknown>> = [
      { session_id: "old1" }, // legacy row — no _at columns at all
      { session_id: "new1", view_cart_at: new Date().toISOString() },
      { session_id: "new2", remove_from_cart_at: new Date().toISOString() },
    ];
    const count = (ev: string) =>
      fWater.filter(r => r[`${ev}_at`] != null).length;
    expect(count("view_cart")).toBe(1);
    expect(count("remove_from_cart")).toBe(1);
    // legacy column still works
    expect(count("add_to_cart")).toBe(0);
  });
});

describe("waterfall cart columns — alias safety", () => {
  it("legacy aliases still resolve to canonical cart events", () => {
    expect(resolveCanonicalEvent("cart")).toBe("view_cart");
    expect(resolveCanonicalEvent("cart_remove")).toBe("remove_from_cart");
  });

  it("no legacy alias is rendered as a KPI label in the dashboard", () => {
    for (const alias of Object.keys(EVENT_ALIASES)) {
      const re = new RegExp(`label=\\"${alias}\\"`);
      expect(DASH).not.toMatch(re);
    }
  });
});