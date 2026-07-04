/**
 * PR-2 certification: every named dashboard surface MUST mount the single
 * canonical truth strip (CanonicalKpiStrip -> useCanonicalFunnel ->
 * analytics-canonical). If a page loses this import, the dashboard is
 * drifting from the single source of truth and CI must fail.
 *
 * This is a static contract test; live-parity is enforced separately by
 * scripts/analytics-truth-parity-probe.mjs (PR-3).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

const PR2_SURFACES: Array<{ label: string; path: string }> = [
  { label: "Funnel Health",            path: "src/pages/admin/FunnelHealthCenter.tsx" },
  { label: "Conversion War Room",      path: "src/pages/admin/ConversionWarRoomPage.tsx" },
  { label: "Customer Journey Center",  path: "src/pages/admin/CustomerJourneyCenterPage.tsx" },
  { label: "Sales Commander",          path: "src/pages/admin/SalesCommanderPage.tsx" },
  { label: "Pinterest Attribution",    path: "src/pages/admin/PinterestAttributionHealthPage.tsx" },
  { label: "Organic Intelligence",     path: "src/pages/admin/OrganicIntelligencePage.tsx" },
];

describe("PR-2 — canonical truth surface parity", () => {
  for (const s of PR2_SURFACES) {
    it(`${s.label} imports and renders CanonicalKpiStrip`, () => {
      const src = fs.readFileSync(s.path, "utf-8");
      expect(src, `${s.path} must import CanonicalKpiStrip`).toMatch(
        /from ["']@\/components\/admin\/CanonicalKpiStrip["']/,
      );
      expect(src, `${s.path} must render <CanonicalKpiStrip`).toMatch(/<CanonicalKpiStrip/);
    });
  }

  it("Revenue Forensics is surfaced via War Room (which mounts the strip)", () => {
    const war = fs.readFileSync("src/pages/admin/ConversionWarRoomPage.tsx", "utf-8");
    expect(war).toMatch(/RevenueForensicsPanel/);
    expect(war).toMatch(/<CanonicalKpiStrip/);
  });
});