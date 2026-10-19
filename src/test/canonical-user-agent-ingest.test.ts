import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * User-agent capture chain (provable bot signals only):
 * cci-ingest stores the request UA in cci_events.meta.user_agent →
 * canonical-ingest lifts it into canonical_events.source_user_agent →
 * canonical_session_upsert_recent fills canonical_sessions.user_agent
 * (fill-null only, never overwrites). These are source-wiring assertions,
 * mirroring the style of checkout-price-authority.test.ts.
 */
describe("user-agent capture for provable bot classification", () => {
  it("cci-ingest stores the request user-agent in meta", () => {
    const src = readFileSync("supabase/functions/cci-ingest/index.ts", "utf8");
    expect(src).toMatch(/req\.headers\.get\('user-agent'\)/);
    expect(src).toMatch(/user_agent:\s*userAgent/);
  });

  it("canonical-ingest lifts meta.user_agent into source_user_agent", () => {
    const src = readFileSync("supabase/functions/canonical-ingest/index.ts", "utf8");
    expect(src).toMatch(/source_user_agent:/);
    expect(src).toMatch(/rawMeta\.user_agent/);
  });

  it("session upsert fills user_agent fill-null only (never overwrites)", () => {
    const sql = readFileSync(
      "drizzle/migrations/0017_ua_fill_null_sessions.sql",
      "utf8",
    );
    expect(sql).toMatch(/user_agent\s*=\s*COALESCE\(canonical_sessions\.user_agent, EXCLUDED\.user_agent\)/);
    expect(sql).toMatch(/array_agg\(source_user_agent\)/);
  });
});
