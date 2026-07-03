import { describe, it, expect } from "vitest";
import {
  classifyKpiSession,
  computeKpiMetrics,
  filterKpiSessions,
  assertKpiEligible,
  assertKpiInputs,
  kpiAuditReport,
  hasLegacyDirectFallback,
  KpiAssertionError,
} from "@/lib/kpiSessionFilter";

describe("classifyKpiSession", () => {
  it("excludes lovable.dev referrers", () => {
    expect(
      classifyKpiSession({ referrer: "https://lovable.dev/projects/x" }),
    ).toBe("excluded_preview");
  });

  it("excludes every preview host variant", () => {
    for (const host of [
      "https://lovable.app/",
      "https://foo.lovableproject.com/",
      "https://gptengineer.app/",
      "https://id-preview--abc.lovable.app/",
    ]) {
      expect(classifyKpiSession({ referrer: host })).toBe("excluded_preview");
    }
  });

  it("classifies no-referrer + no-UTM as unknown (never direct)", () => {
    expect(classifyKpiSession({})).toBe("unknown");
    expect(classifyKpiSession({ referrer: "", utm_source: "" })).toBe("unknown");
  });

  it("flags legacy direct/(none) UTM columns as excluded_legacy_direct", () => {
    expect(
      classifyKpiSession({ utm_source: "direct", utm_medium: "(none)" }),
    ).toBe("excluded_legacy_direct");
    expect(
      classifyKpiSession({ utm_source: "DIRECT", utm_medium: "none" }),
    ).toBe("excluded_legacy_direct");
  });

  it("flags legacy direct/(none) polluted landing_page URLs", () => {
    expect(
      classifyKpiSession({
        landing_page: "/?utm_source=direct&utm_medium=%28none%29",
      }),
    ).toBe("excluded_legacy_direct");
    expect(
      hasLegacyDirectFallback({
        landing_page: "/products/x?utm_source=direct&utm_medium=(none)",
      }),
    ).toBe(true);
  });

  it("includes real external referrers", () => {
    expect(
      classifyKpiSession({ referrer: "https://www.pinterest.com/pin/1" }),
    ).toBe("included");
  });

  it("includes UTM-tagged sessions even without referrer", () => {
    expect(
      classifyKpiSession({ utm_source: "pinterest", utm_medium: "social" }),
    ).toBe("included");
  });
});

describe("computeKpiMetrics", () => {
  const rows = [
    { session_id: "a", referrer: "https://www.pinterest.com/" },
    { session_id: "b", referrer: "https://lovable.dev/x" },
    { session_id: "c" }, // unknown
    { session_id: "d", utm_source: "direct", utm_medium: "(none)" },
    { session_id: "e", utm_source: "tiktok", utm_medium: "paid" },
  ];

  it("produces deterministic bucket counts", () => {
    expect(computeKpiMetrics(rows)).toEqual({
      total: 5,
      included: 2,
      excluded_preview: 1,
      unknown: 1,
      excluded_legacy_direct: 1,
      included_ratio: 0.4,
      unknown_ratio: 0.2,
    });
  });

  it("returns zeroed ratios for empty input", () => {
    expect(computeKpiMetrics([])).toEqual({
      total: 0,
      included: 0,
      excluded_preview: 0,
      unknown: 0,
      excluded_legacy_direct: 0,
      included_ratio: 0,
      unknown_ratio: 0,
    });
  });

  it("filterKpiSessions keeps only included rows", () => {
    const kept = filterKpiSessions(rows);
    expect(kept.map((r) => r.session_id)).toEqual(["a", "e"]);
  });
});

describe("runtime assertions", () => {
  it("assertKpiEligible throws on lovable.dev referrer", () => {
    expect(() =>
      assertKpiEligible({ referrer: "https://lovable.dev/" }),
    ).toThrow(KpiAssertionError);
  });

  it("assertKpiEligible throws on legacy direct/(none)", () => {
    expect(() =>
      assertKpiEligible({ utm_source: "direct", utm_medium: "(none)" }),
    ).toThrow(KpiAssertionError);
  });

  it("assertKpiEligible throws on unknown (no ref + no UTM)", () => {
    expect(() => assertKpiEligible({})).toThrow(KpiAssertionError);
  });

  it("assertKpiEligible is a no-op for included rows", () => {
    expect(() =>
      assertKpiEligible({ referrer: "https://www.pinterest.com/" }),
    ).not.toThrow();
  });

  it("assertKpiInputs throws on the first violation", () => {
    expect(() =>
      assertKpiInputs([
        { referrer: "https://www.pinterest.com/" },
        { referrer: "https://lovable.dev/" },
      ]),
    ).toThrow(KpiAssertionError);
  });
});

describe("kpiAuditReport", () => {
  it("marks report ok=false when preview or legacy-direct sessions leak in", () => {
    const r = kpiAuditReport([
      { referrer: "https://www.pinterest.com/" },
      { referrer: "https://lovable.dev/" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.violations).toBe(1);
    expect(r.excluded_preview).toBe(1);
  });

  it("marks report ok=true when only included + unknown remain", () => {
    const r = kpiAuditReport([
      { referrer: "https://www.pinterest.com/" },
      {}, // unknown
    ]);
    expect(r.ok).toBe(true);
    expect(r.violations).toBe(0);
    expect(r.unknown).toBe(1);
  });
});