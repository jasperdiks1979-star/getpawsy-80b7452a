import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// PR-2 slice 3 static guard: neither Pinterest admin page may re-derive a
// business KPI from `pinterest_attribution_*` or `pinterest_funnel_events`
// SQL aggregates. Reading those tables for DIAGNOSTIC counters is fine —
// they must just not sit under a business-KPI label. This test locks the
// labels currently on the two pages so any regression is caught at CI.

const FILES = [
  "src/pages/admin/PinterestAttributionHealthPage.tsx",
  "src/pages/admin/PinterestHealth.tsx",
];

// Forbidden business-KPI labels — reserved for canonical only.
const FORBIDDEN_LABELS = [
  ">Sessions<",
  ">Purchases<",
  ">Add To Cart<",
  ">Checkouts<",
  ">Revenue (USD)<",
  ">Conversion rate<",
  ">Avg order value<",
];

describe("Pinterest admin pages · no parallel-truth business KPIs", () => {
  for (const rel of FILES) {
    it(`${rel} uses diagnostic-only labels for Pinterest-scoped counters`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      for (const label of FORBIDDEN_LABELS) {
        expect(src, `forbidden business-KPI label ${label} in ${rel}`).not.toContain(label);
      }
    });
  }
});