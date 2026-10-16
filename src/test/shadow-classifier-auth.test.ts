import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("analytics-shadow-classifier auth gate", () => {
  const src = readFileSync("supabase/functions/analytics-shadow-classifier/index.ts", "utf8");
  it("rejects requests without a matching x-internal-secret before any work", () => {
    const gate = src.indexOf('error: "unauthorized" }, 401');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(src.indexOf("createClient(SUPABASE_URL"));
    expect(src).toMatch(/filter\(\(s\) => s\.length > 0\)/);
  });
});
