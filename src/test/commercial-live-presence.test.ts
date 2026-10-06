import { describe, expect, it } from "vitest";
import { classifyLiveSession, isCommercialLiveSession } from "@/lib/commercialLivePresence";
import { buildLivePresenceModel, type LivePresenceActivity } from "@/lib/visitorWorldMapCanonicalFeatures";
import type { LiveSessionEvidence } from "@/lib/commercialLivePresence";

const now = new Date().toISOString();
const empty = {
  canonicalBySession: new Map(),
  canonicalByVisitor: new Map(),
  canonicalSessionIds: new Set<string>(),
  canonicalVisitorIds: new Set<string>(),
};

describe("commercial live presence (6 Oct burst pattern)", () => {
  it("burst of UNKNOWN/VERIFIER, missing geo, zero interaction => 0 shoppers, raw kept", () => {
    const rows: LivePresenceActivity[] = [];
    const ev = new Map<string, LiveSessionEvidence>();
    for (let i = 0; i < 40; i++) {
      const id = `burst-${i}`;
      rows.push({ session_id: id, latitude: null, longitude: null, country: null, city: null, created_at: now, last_seen_at: now, activity_type: "browsing" });
      ev.set(id, { traffic_class: i % 2 ? "VERIFIER" : "UNKNOWN", country: null, interaction_count: 0 });
    }
    const m = buildLivePresenceModel(rows, { ...empty, evidenceBySession: ev });
    expect(m.commercialLiveVisitors).toBe(0);
    expect(m.totalLiveVisitors).toBe(40); // forensic raw view preserved
    expect(m.liveBreakdown).toEqual({ commercial: 0, technical: 20, unverified: 20 });
  });

  it("HUMAN_PROBABLE US session with product interaction => counted", () => {
    const rows: LivePresenceActivity[] = [
      { session_id: "h1", latitude: 40.7, longitude: -74, country: "US", city: "NYC", created_at: now, last_seen_at: now, activity_type: "browsing" },
    ];
    const ev = new Map<string, LiveSessionEvidence>([
      ["h1", { traffic_class: "HUMAN_PROBABLE", country: "US", has_product_view: true, interaction_count: 3 }],
    ]);
    const m = buildLivePresenceModel(rows, { ...empty, evidenceBySession: ev });
    expect(m.commercialLiveVisitors).toBe(1);
  });

  it("UNKNOWN with only a pageview is never promoted to shopper", () => {
    expect(classifyLiveSession({ traffic_class: "UNKNOWN", country: "US", interaction_count: 0 })).toBe("unverified");
    expect(classifyLiveSession({ traffic_class: null, country: "US" })).toBe("unverified");
  });

  it("meaningful commerce events stay visible for UNKNOWN with valid geo", () => {
    for (const k of ["has_product_view", "has_add_to_cart", "has_checkout", "has_purchase"] as const) {
      expect(isCommercialLiveSession({ traffic_class: "UNKNOWN", country: "US", [k]: true })).toBe(true);
    }
    expect(isCommercialLiveSession({ traffic_class: "UNKNOWN", country: null, has_add_to_cart: true })).toBe(false);
  });

  it("technical classes and flags always excluded, even with events", () => {
    for (const c of ["VERIFIER", "AUTOMATION", "BOT_CRAWLER", "BOT_CONFIRMED", "CRAWLER", "INTERNAL_PREVIEW", "TECHNICAL"]) {
      expect(classifyLiveSession({ traffic_class: c, country: "US", has_product_view: true })).toBe("technical");
    }
    expect(classifyLiveSession({ traffic_class: "HUMAN_PROBABLE", country: "US", is_bot_suspect: true })).toBe("technical");
    expect(classifyLiveSession({ traffic_class: "HUMAN_PROBABLE", country: "US", crawler_verified: true })).toBe("technical");
    expect(classifyLiveSession({ traffic_class: "HUMAN_PROBABLE", country: "US", is_internal: true })).toBe("technical");
  });

  it("HUMAN_PROBABLE US browsing without events still counted", () => {
    expect(isCommercialLiveSession({ traffic_class: "HUMAN_PROBABLE", country: "US" })).toBe(true);
    expect(isCommercialLiveSession({ traffic_class: "HUMAN_PROBABLE", country: null })).toBe(false);
  });
});
