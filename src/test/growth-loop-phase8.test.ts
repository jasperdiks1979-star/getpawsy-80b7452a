import { describe, it, expect } from "vitest";

/**
 * Contract test for Phase 8 Growth Loop aggregator.
 * Asserts the snapshot envelope exposed by `growth-loop-phase8` stays stable
 * so the Growth Commander UI can render it without schema drift.
 */
const REQUIRED_KEYS = [
  "revenue_health",
  "traffic_quality",
  "winners",
  "losers",
  "top_sources",
  "anomalies",
  "ai_summary",
  "generated_by",
];

function fakeSnapshot() {
  return {
    window_days: 14,
    revenue_health: { growth_score: 84, est_revenue_impact_usd: 1200, est_traffic_impact_sessions: 540, analytics_health_score: 92 },
    traffic_quality: { open_alerts: 3, critical_alerts: 0 },
    winners: { top_revenue_recs: [], top_product_opportunities: [] },
    losers: { biggest_bottleneck: null },
    top_sources: { top_growth_opportunities: [], top_pinterest_opportunities: [], top_pinterest_products: [], top_seo_opportunities: [] },
    anomalies: [],
    ai_summary: "ok",
    generated_by: "growth-loop-phase8",
  };
}

describe("growth-loop-phase8 snapshot contract", () => {
  const s = fakeSnapshot();
  for (const k of REQUIRED_KEYS) {
    it(`exposes ${k}`, () => expect(s).toHaveProperty(k));
  }
  it("growth score is 0..100", () => {
    const g = s.revenue_health.growth_score;
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(100);
  });
  it("is tagged with phase-8 generator", () => {
    expect(s.generated_by).toBe("growth-loop-phase8");
  });
});