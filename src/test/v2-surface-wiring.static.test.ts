import { describe, it, expect } from "vitest";
import fs from "fs";

// Static contract: every one of the five internal analytics surfaces MUST
// import the shared V2EnvelopeBadge so admins always see the resolved
// envelope + bucket split. Enforces Phase 4C wiring at build time so no
// future edit silently drops the indicator.

const SURFACES = [
  "src/pages/admin/VisitorWorldMapProPage.tsx",
  "src/pages/admin/FunnelHealthCenter.tsx",
  "src/pages/admin/CustomerJourneyCenterPage.tsx",
  "src/components/admin/CleanAnalyticsPanel.tsx",
  "src/components/admin/VisitorWorldMap.tsx",
];

describe("v2 surface wiring — all five surfaces render V2EnvelopeBadge", () => {
  for (const path of SURFACES) {
    it(`${path} imports and renders V2EnvelopeBadge`, () => {
      const src = fs.readFileSync(path, "utf-8");
      expect(src).toMatch(/V2EnvelopeBadge/);
      expect(src).toMatch(/<V2EnvelopeBadge/);
    });
  }
});