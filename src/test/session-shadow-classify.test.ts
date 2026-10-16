import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { classifySessionRow } from "../../supabase/functions/_shared/session-shadow-classify";

const HEADLESS = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const base = { session_id: "s1", first_landing_path: "/products/x", engagement_ms: 20000, interaction_count: 3 };

describe("per-session shadow classification", () => {
  it("HeadlessChrome session is bot, even after add-to-cart", () => {
    const l = classifySessionRow({ ...base, user_agent: HEADLESS, last_stage: "CANONICAL_ADD_TO_CART" }, null);
    expect(l.traffic_quality).toBe("bot");
    expect(l.is_bot).toBe(true);
  });
  it("real iPhone shopper with add-to-cart is human", () => {
    const l = classifySessionRow({ ...base, user_agent: IPHONE, last_stage: "CANONICAL_ADD_TO_CART" }, null);
    expect(l.traffic_quality).toBe("human");
    expect(l.is_bot).toBe(false);
  });
  it("real shopper with weak bot hint and checkout stays human", () => {
    const l = classifySessionRow({ ...base, user_agent: IPHONE, last_stage: "CANONICAL_CHECKOUT" }, { is_bot_suspect: true, bot_suspect_reason: "weak_pattern" });
    expect(l.traffic_quality).toBe("human");
  });
  it("browse-only real browser is not labelled bot", () => {
    const l = classifySessionRow({ ...base, user_agent: IPHONE, last_stage: "CANONICAL_PAGE_VIEW" }, null);
    expect(l.is_bot).toBe(false);
  });
  it("job never touches raw events and uses lease + keyset batches", () => {
    const src = readFileSync("supabase/functions/analytics-shadow-classifier/index.ts", "utf8");
    expect(src).not.toMatch(/from\("canonical_events"\)/);
    expect(src).toMatch(/\.lt\("locked_until"/);
    expect(src).toMatch(/\.gt\("session_id", cursor\)/);
    expect(src).not.toMatch(/interaction_count:\s*0/);
  });
});
