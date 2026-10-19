import { describe, it, expect } from "vitest";
import { aggregateSessionEvidence } from "../../supabase/functions/_shared/session-evidence";
import { classifySessionRow } from "../../supabase/functions/_shared/session-shadow-classify";
const row = { session_id: "s", first_landing_path: "/products/example", last_stage: "CANONICAL_PAGE_VIEW", engagement_ms: 0, interaction_count: 0 };
describe("verified crawler evidence and weak browser hints", () => {
  it("verified crawler stays bot even at checkout", () => {
    const hints = aggregateSessionEvidence([], [{ session_id: "s", crawler_verified: true }]);
    expect(classifySessionRow({ ...row, last_stage: "CANONICAL_CHECKOUT" }, hints.get("s")!).traffic_quality).toBe("bot");
  });
  it("unverified crawler stays uncertain", () => {
    const hints = aggregateSessionEvidence([], [{ session_id: "s", crawler_verified: false }]);
    expect(classifySessionRow(row, hints.get("s")!).traffic_quality).toBe("uncertain");
  });
  it("Chrome with weak 800x600 hint stays uncertain", () => {
    const hints = aggregateSessionEvidence([{ session_id: "s", browser: "Chrome", is_bot_suspect: true, bot_suspect_reason: "lighthouse_viewport" }], []);
    expect(classifySessionRow(row, hints.get("s")!).traffic_quality).toBe("uncertain");
  });
  it("strong shopper action overrides weak viewport hint", () => {
    const hints = aggregateSessionEvidence([{ session_id: "s", browser: "Chrome", is_bot_suspect: true, bot_suspect_reason: "lighthouse_viewport" }], []);
    expect(classifySessionRow({ ...row, last_stage: "CANONICAL_ADD_TO_CART" }, hints.get("s")!).traffic_quality).toBe("human");
  });
  it("HeadlessChrome remains bot despite cart action", () => {
    expect(classifySessionRow({ ...row, user_agent: "Mozilla/5.0 HeadlessChrome/141.0", last_stage: "CANONICAL_ADD_TO_CART" }, null).traffic_quality).toBe("bot");
  });
  it("admin hint works even if is_internal is false", () => {
    const hints = aggregateSessionEvidence([{ session_id: "s", is_internal: false, is_admin_path: true }], []);
    expect(classifySessionRow(row, hints.get("s")!).traffic_quality).toBe("internal");
  });
  it("strong bot hint wins regardless of row order", () => {
    const weak = { session_id: "s", is_bot_suspect: true, bot_suspect_reason: "lighthouse_viewport" };
    const strong = { session_id: "s", is_bot_suspect: true, bot_suspect_reason: "headless_browser" };
    expect(aggregateSessionEvidence([weak, strong], []).get("s")?.bot_suspect_reason).toBe("headless_browser");
    expect(aggregateSessionEvidence([strong, weak], []).get("s")?.bot_suspect_reason).toBe("headless_browser");
  });
});
