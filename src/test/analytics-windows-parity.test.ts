import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ANALYTICS_WINDOWS } from "@/lib/analyticsWindows";

// The backend mirror cannot import from src/, so guard against drift here.
const stripHeader = (s: string) => s.slice(s.indexOf("export type AnalyticsWindowId"));

describe("analytics window definitions", () => {
  it("frontend and edge-function copies are identical", () => {
    const fe = readFileSync("src/lib/analyticsWindows.ts", "utf8");
    const be = readFileSync("supabase/functions/_shared/analyticsWindows.ts", "utf8");
    expect(stripHeader(fe)).toBe(stripHeader(be));
  });

  it("maps the approved intervals to exact hours", () => {
    expect(Object.fromEntries(ANALYTICS_WINDOWS.map((w) => [w.id, w.hours]))).toEqual({
      "1h": 1, "24h": 24, "7d": 168, "14d": 336, "30d": 720, "90d": 2160,
    });
  });
});
