import { describe, it, expect } from "vitest";
import { buildLivePresenceModel } from "@/lib/visitorWorldMapCanonicalFeatures";

// Live shopper markers and the shopper counter must use identical eligibility.
// Geo-tagged non-shoppers remain available through the forensic marker layer.
describe("live map render invariant", () => {
  it("commercial shopper count equals prominent live markers", () => {
    const now = new Date().toISOString();
    const model = buildLivePresenceModel(
      [
        {
          session_id: "s1",
          visitor_id: "v1",
          latitude: 30,
          longitude: -97,
          country: "US",
          city: "Austin",
          created_at: now,
          last_seen_at: now,
        },
        {
          session_id: "s2",
          visitor_id: null,
          latitude: null,
          longitude: null,
          country: null,
          city: null,
          created_at: now,
          last_seen_at: now,
        },
      ],
      {
        canonicalBySession: new Map(),
        canonicalByVisitor: new Map(),
        canonicalSessionIds: new Set(),
        canonicalVisitorIds: new Set(),
        evidenceBySession: new Map([["s1", { traffic_class: "HUMAN_PROBABLE", country: "US" }]]),
      },
    );
    expect(model.diagnostics.liveWithGeo).toBeGreaterThan(0);
    expect(model.markers.length).toBe(model.commercialLiveVisitors);
    expect(model.diagnostics.liveMarkersRendered).toBe(model.markers.length);
  });

  it("emits zero markers when no rows carry geo", () => {
    const now = new Date().toISOString();
    const model = buildLivePresenceModel(
      [
        {
          session_id: "s1",
          visitor_id: null,
          latitude: null,
          longitude: null,
          country: null,
          city: null,
          created_at: now,
          last_seen_at: now,
        },
      ],
      {
        canonicalBySession: new Map(),
        canonicalByVisitor: new Map(),
        canonicalSessionIds: new Set(),
        canonicalVisitorIds: new Set(),
      },
    );
    expect(model.diagnostics.liveWithGeo).toBe(0);
    expect(model.markers.length).toBe(0);
  });
});