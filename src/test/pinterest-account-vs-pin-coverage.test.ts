import { describe, it, expect } from "vitest";
import { summarize } from "@/components/admin/PinterestAccountVsPinCoveragePanel";

describe("Pinterest account vs pin coverage summarize", () => {
  const rows = [
    { day: "2026-09-10", impressions: 100, outbound_clicks: 1, data_status: "READY" },
    { day: "2026-09-24", impressions: 0, outbound_clicks: 0, data_status: "PROCESSING" },
    { day: "2026-09-01", impressions: 999, outbound_clicks: 9, data_status: "READY" },
  ];
  it("sums only rows in window and flags non-final days", () => {
    const t = summarize(rows, "2026-09-05", "data_status");
    expect(t.impressions).toBe(100);
    expect(t.outbound).toBe(1);
    expect(t.pending).toBe(1);
    expect(t.days).toBe(2);
  });
  it("treats nulls as zero, never invents", () => {
    expect(summarize([{ day: "2026-09-10", impressions: null }], "2026-09-01").impressions).toBe(0);
  });
});
