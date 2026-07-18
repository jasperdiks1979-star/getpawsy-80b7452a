import { describe, it, expect, vi } from "vitest";
import { getCanonicalAnalyticsMetrics } from "@/lib/analyticsV2Adapter";

const baseTotals = {
  visitors: 221,
  sessions: 221,
  page_views: 500,
  product_views: 40,
  add_to_cart: 5,
  view_cart: 3,
  checkout_started: 2,
  purchases: 1,
  revenue: 49.9,
  currency: "EUR",
  conversion_rate: 0.45,
};

const v2Payload = {
  human_sessions: 117,
  uncertain_sessions: 0,
  commercial_sessions: 117,
  crawler_sessions: 43,
  bot_sessions: 0,
  technical_sessions: 0,
  internal_sessions: 0,
  legacy_unclassified_sessions: 61,
  raw_sessions: 221,
  human_visitors: 117,
  uncertain_visitors: 0,
  commercial_visitors: 117,
  crawler_visitors: 43,
  bot_visitors: 0,
  technical_visitors: 0,
  internal_visitors: 0,
  legacy_unclassified_visitors: 61,
  raw_visitors: 221,
  classification_coverage_pct: 72.4,
  classification_version: "v2.phase4a+atc",
  atc_sessions_matched: 160,
  atc_sessions_scanned: 221,
};

function makeResp(overrides: Partial<any> = {}) {
  return {
    ok: true,
    totals: baseTotals,
    v2_gate: { envelope_resolved: "v2" },
    v2: v2Payload,
    ...overrides,
  } as any;
}

describe("getCanonicalAnalyticsMetrics", () => {
  it("returns null for null response", () => {
    expect(getCanonicalAnalyticsMetrics(null)).toBeNull();
  });

  it("chooses v2 when v2_gate resolves to v2 and v2 payload present", () => {
    const m = getCanonicalAnalyticsMetrics(makeResp())!;
    expect(m.envelope_resolved).toBe("v2");
    expect(m.human_sessions).toBe(117);
    expect(m.commercial_sessions).toBe(117);
    expect(m.legacy_unclassified_sessions).toBe(61);
  });

  it("falls back to v1 when v2 payload missing", () => {
    const m = getCanonicalAnalyticsMetrics(
      makeResp({ v2: undefined, v2_gate: { envelope_resolved: "v1" } }),
    )!;
    expect(m.envelope_resolved).toBe("v1");
    expect(m.human_sessions).toBeNull();
    expect(m.legacy_unclassified_sessions).toBeNull();
    expect(m.v1_visitors).toBe(221);
  });

  it("falls back to v1 when envelope_resolved is v1 even if v2 exists", () => {
    const m = getCanonicalAnalyticsMetrics(
      makeResp({ v2_gate: { envelope_resolved: "v1" } }),
    )!;
    expect(m.envelope_resolved).toBe("v1");
    expect(m.human_sessions).toBeNull();
  });

  it("commercial = human + uncertain (invariant)", () => {
    const m = getCanonicalAnalyticsMetrics(
      makeResp({
        v2: { ...v2Payload, human_sessions: 100, uncertain_sessions: 17, commercial_sessions: 117 },
      }),
    )!;
    expect(m.commercial_sessions).toBe(m.human_sessions! + m.genuine_uncertain_sessions!);
  });

  it("warns when server violates commercial invariant", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    getCanonicalAnalyticsMetrics(
      makeResp({
        v2: { ...v2Payload, human_sessions: 50, uncertain_sessions: 0, commercial_sessions: 117 },
      }),
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("legacy_unclassified is never counted as commercial", () => {
    const m = getCanonicalAnalyticsMetrics(makeResp())!;
    expect(m.commercial_sessions).toBe(117);
    expect(m.legacy_unclassified_sessions).toBe(61);
    expect(m.commercial_sessions).not.toBe(m.raw_sessions);
  });

  it("preserves order/revenue regardless of envelope", () => {
    const v2m = getCanonicalAnalyticsMetrics(makeResp())!;
    const v1m = getCanonicalAnalyticsMetrics(
      makeResp({ v2: undefined, v2_gate: { envelope_resolved: "v1" } }),
    )!;
    expect(v2m.purchases).toBe(1);
    expect(v1m.purchases).toBe(1);
    expect(v2m.revenue).toBe(49.9);
    expect(v1m.revenue).toBe(49.9);
  });
});
