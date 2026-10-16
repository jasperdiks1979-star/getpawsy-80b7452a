import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { classifyTraffic, aggregateSessionQuality } from "../../supabase/functions/_shared/traffic-classifier";

const HEADLESS = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36";
const REAL = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const base = { page_path: "/products/x", engagement_ms: 20000, interaction_count: 0, pageviews: 2, has_atc: true };

describe("shadow classifier: headless add-to-cart", () => {
  it("HeadlessChrome with ATC stays bot at session level", () => {
    const c = classifyTraffic({ ...base, user_agent: HEADLESS });
    expect(c.is_bot).toBe(true);
    expect(aggregateSessionQuality([c], true)).toBe("bot");
  });
  it("real shopper with ATC stays human", () => {
    const c = classifyTraffic({ ...base, user_agent: REAL });
    expect(c.traffic_quality).toBe("human");
    expect(aggregateSessionQuality([c], true)).toBe("human");
  });
  it("weak bot hint is still overridden by a real converter", () => {
    expect(aggregateSessionQuality([{ traffic_quality: "bot", bot_confidence: 0.85 }], true)).toBe("human");
  });
  it("function reads UA from canonical_sessions and uses existing columns", () => {
    const src = readFileSync("supabase/functions/analytics-shadow-classifier/index.ts", "utf8");
    expect(src).not.toMatch(/from\("visitor_activity"\)\s*\.select\([^)]*user_agent/);
    expect(src).toMatch(/uaBySid/);
    expect(src).not.toMatch(/classification_version: `\$\{CLASSIFIER_VERSION\}-shadow`,\s*\}\)\.eq\("session_id"/);
  });
});
