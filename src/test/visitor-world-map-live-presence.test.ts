import { describe, it, expect } from "vitest";
import {
  buildLivePresenceModel,
  livePresenceMarkersToGeoJson,
  type CanonicalFunnelFlags,
  type LivePresenceActivity,
} from "@/lib/visitorWorldMapCanonicalFeatures";

function flags(overrides: Partial<CanonicalFunnelFlags> = {}): CanonicalFunnelFlags {
  return { has_add_to_cart: false, has_view_cart: false, has_checkout: false, has_purchase: false, ...overrides };
}

function activity(overrides: Partial<LivePresenceActivity>): LivePresenceActivity {
  return {
    session_id: "s",
    visitor_id: null,
    latitude: null,
    longitude: null,
    country: null,
    city: null,
    created_at: "2026-07-04T10:00:00.000Z",
    last_seen_at: "2026-07-04T10:00:00.000Z",
    ...overrides,
  };
}

describe("Live presence model", () => {
  it("only renders markers with valid geo, dedupes by session, cart/checkout badges require canonical funnel", () => {
    const activities: LivePresenceActivity[] = [
      // Session A: geo + canonical cart -> cart marker
      activity({ session_id: "a", visitor_id: "va", latitude: 40, longitude: -74, last_seen_at: "2026-07-04T10:00:00.000Z" }),
      activity({ session_id: "a", visitor_id: "va", latitude: 40, longitude: -74, last_seen_at: "2026-07-04T10:01:00.000Z", page_path: "/cart" }),
      // Session B: geo, NOT in canonical -> browsing marker even if activity looks cart-like
      activity({ session_id: "b", visitor_id: "vb", latitude: 41, longitude: -75 }),
      // Session C: no geo -> no marker, but counted in activeLiveVisitors
      activity({ session_id: "c", visitor_id: "vc" }),
      // Session D: geo + canonical checkout via visitor_id match -> checkout marker
      activity({ session_id: "d", visitor_id: "vd", latitude: 42, longitude: -76 }),
    ];

    const canonicalBySession = new Map<string, CanonicalFunnelFlags>([
      ["a", flags({ has_add_to_cart: true })],
    ]);
    const canonicalByVisitor = new Map<string, CanonicalFunnelFlags>([
      ["vd", flags({ has_checkout: true, has_purchase: true })],
    ]);
    const canonicalSessionIds = new Set(["a"]);
    const canonicalVisitorIds = new Set(["va", "vd"]);

    const model = buildLivePresenceModel(activities, {
      canonicalBySession,
      canonicalByVisitor,
      canonicalSessionIds,
      canonicalVisitorIds,
    });

    expect(model.diagnostics.liveActivityRows).toBe(5);
    expect(model.diagnostics.activeLiveVisitors).toBe(4);
    expect(model.diagnostics.liveWithGeo).toBe(3);
    expect(model.diagnostics.liveMarkersRendered).toBe(3);
    expect(model.diagnostics.overlapSession).toBe(1);
    expect(model.diagnostics.overlapVisitor).toBe(2);

    const bySession = new Map(model.markers.map((m) => [m.session_id, m]));
    expect(bySession.get("a")?.activity_type).toBe("cart");
    expect(bySession.get("a")?.isCanonical).toBe(true);
    expect(bySession.get("a")?.canonicalMatchBy).toBe("session");
    // dedupe kept the latest last_seen_at
    expect(bySession.get("a")?.last_seen_at).toBe("2026-07-04T10:01:00.000Z");
    expect(bySession.get("b")?.activity_type).toBe("browsing");
    expect(bySession.get("b")?.isCanonical).toBe(false);
    expect(bySession.get("d")?.activity_type).toBe("checkout");
    expect(bySession.get("d")?.canonicalMatchBy).toBe("visitor");

    expect(model.counts).toEqual({ browsing: 1, cart: 1, checkout: 1 });
    expect(model.totalLiveVisitors).toBe(4);
  });

  it("serializes GeoJSON with mode=live and canonical flag reflecting truth intersection", () => {
    const activities: LivePresenceActivity[] = [
      activity({ session_id: "x", latitude: 10, longitude: 20 }),
    ];
    const model = buildLivePresenceModel(activities, {
      canonicalBySession: new Map(),
      canonicalByVisitor: new Map(),
      canonicalSessionIds: new Set(),
      canonicalVisitorIds: new Set(),
    });
    const geojson = livePresenceMarkersToGeoJson(model.markers);
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].properties?.mode).toBe("live");
    expect(geojson.features[0].properties?.canonical).toBe(false);
    expect(geojson.features[0].geometry.coordinates).toEqual([20, 10]);
  });
});
