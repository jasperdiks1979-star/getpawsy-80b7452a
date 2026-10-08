import { describe, it, expect } from "vitest";
import { resolveSessionDurationSeconds as r } from "@/lib/sessionDuration";

const t0 = "2026-10-08T06:00:00Z";
describe("resolveSessionDurationSeconds", () => {
  it("prefers effective=119 over reported=0 and equal timestamps", () => {
    expect(r({ effective_duration_seconds: 119, reported_duration_seconds: 0, first_seen_at: t0, last_seen_at: t0 })).toBe(119);
  });
  it("keeps a genuine zero effective value", () => {
    expect(r({ effective_duration_seconds: 0, reported_duration_seconds: 50 })).toBe(0);
  });
  it("falls back to reported, then timestamps when null", () => {
    expect(r({ effective_duration_seconds: null, reported_duration_seconds: 59 })).toBe(59);
    expect(r({ first_seen_at: t0, last_seen_at: "2026-10-08T06:29:36Z" })).toBe(1776);
  });
  it("rejects invalid values", () => {
    expect(r({ effective_duration_seconds: NaN, reported_duration_seconds: -5, first_seen_at: "x", last_seen_at: "y" })).toBe(0);
    expect(r({ effective_duration_seconds: Infinity, reported_duration_seconds: 120 })).toBe(120);
    expect(r({ first_seen_at: "2026-10-08T06:10:00Z", last_seen_at: t0 })).toBe(0);
  });
  it("CSV and summary use the same values (parity)", () => {
    const sessions = [
      { effective_duration_seconds: 59 }, { effective_duration_seconds: 119, reported_duration_seconds: 0 },
      { effective_duration_seconds: 120 }, { effective_duration_seconds: 1776 },
    ];
    const csv = sessions.map(r);
    const mean = Math.round(csv.reduce((a, b) => a + b, 0) / csv.length);
    expect(csv).toEqual([59, 119, 120, 1776]);
    expect(mean).toBe(519);
  });
});
