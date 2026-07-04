import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("analytics-canonical US geo filter", () => {
  const source = readFileSync("supabase/functions/analytics-canonical/index.ts", "utf8");

  it("does not apply a strict pre-enrichment country=US query filter", () => {
    expect(source).not.toMatch(/\.eq\(\s*["']country["']\s*,\s*["']US["']\s*\)/);
    expect(source).toContain("Geo filtering is applied after enrichment on the per-session truth set");
  });

  it("hydrates canonical session country/city from visitor_activity before US filtering", () => {
    expect(source).toContain("session_id,visitor_id,latitude,longitude,country,city,is_internal");
    expect(source).toContain("visitor_id,latitude,longitude,country,city,is_internal");
    expect(source).toContain("allSessionsArr.filter((s) => isUS(s.country))");
  });
});