import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// PR · Pinterest Traffic widget MUST source from analytics-canonical only.
//
// The Pinterest Traffic tile went stale for days because it was reading
// `visitor_activity` (a legacy per-hit table) instead of the canonical
// truth layer (`canonical_sessions` + `canonical_events`) that Visitor
// World Map uses. This test locks the source path so the class of bug
// cannot regress: no legacy table may be referenced by the widget again.

const SRC = readFileSync(
  resolve(__dirname, "../components/admin/widgets/PinterestTrafficWidget.tsx"),
  "utf8",
);

const FORBIDDEN_SOURCES = [
  "visitor_activity",
  "pinterest_attribution_health",
  "pinterest_funnel_events",
  "pinterest_analytics_daily",
];

describe("PinterestTrafficWidget · canonical source lock", () => {
  it("uses the shared commercial reader", () => {
    expect(SRC).toContain('readCommercialFunnel(720)');
  });

  it("derives stage counts from distinct commercial sessions", () => {
    expect(SRC).toContain('commercialSessionCounters(sessions)');
  });

  it("never reads any legacy parallel Pinterest/traffic table", () => {
    for (const t of FORBIDDEN_SOURCES) {
      // Match `.from("<t>")` / `.from('<t>')` — the Supabase read path.
      const re = new RegExp(`\\.from\\(\\s*["']${t}["']\\s*\\)`);
      expect(SRC).not.toMatch(re);
    }
  });

  it("never counts raw event taps as shoppers", () => {
    expect(SRC).not.toMatch(/\.from\(\s*["']canonical_events["']\s*\)/);
  });
});
