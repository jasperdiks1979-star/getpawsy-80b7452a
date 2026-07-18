import { describe, it, expect } from "vitest";
import { getCanonicalAnalyticsMetrics } from "@/lib/analyticsV2Adapter";

// Purchase semantics — the adapter forwards purchases/revenue verbatim
// from `response.totals`. Server-side rules (see analytics-canonical) now
// exclude smoke-test orders (0 items, non-live gateway, or explicit test
// marker). These tests document the contract from the client's point of
// view so a future regression in the server bleeds through to a failing
// test.

describe("analyticsV2Adapter — purchase semantics contract", () => {
  it("returns genuine purchase count when server has already filtered test orders", () => {
    const m = getCanonicalAnalyticsMetrics({
      totals: {
        visitors: 100, sessions: 120, page_views: 500,
        product_views: 80, add_to_cart: 20, view_cart: 15,
        checkout_started: 10, purchases: 3, revenue: 249.75,
        currency: "eur", conversion_rate: 3,
      } as any,
      v2_gate: { envelope_resolved: "v2" },
      v2: {
        human_sessions: 60, uncertain_sessions: 20, commercial_sessions: 80,
        crawler_sessions: 30, bot_sessions: 5, technical_sessions: 3,
        internal_sessions: 2, legacy_unclassified_sessions: 0,
        raw_sessions: 120,
        human_visitors: 50, uncertain_visitors: 15, commercial_visitors: 65,
        crawler_visitors: 25, bot_visitors: 4, technical_visitors: 3,
        internal_visitors: 2, legacy_unclassified_visitors: 0,
        raw_visitors: 99,
        classification_coverage_pct: 100,
        classification_version: "v2.phase4a+atc",
        atc_sessions_matched: 80, atc_sessions_scanned: 120,
      },
    } as any);
    expect(m?.envelope_resolved).toBe("v2");
    expect(m?.purchases).toBe(3);
    expect(m?.revenue).toBe(249.75);
    // commercial invariant preserved
    expect(m!.commercial_sessions).toBe((m!.human_sessions ?? 0) + (m!.genuine_uncertain_sessions ?? 0));
  });

  it("falls back to v1 legacy when v2 gate is absent", () => {
    const m = getCanonicalAnalyticsMetrics({
      totals: { visitors: 10, sessions: 12, purchases: 1, revenue: 1, currency: "eur" } as any,
    } as any);
    expect(m?.envelope_resolved).toBe("v1");
    expect(m?.human_sessions).toBeNull();
  });

  it("returns null for null response", () => {
    expect(getCanonicalAnalyticsMetrics(null as any)).toBeNull();
  });
});