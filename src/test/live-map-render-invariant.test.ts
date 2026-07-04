import { describe, it, expect } from "vitest";
import { buildLivePresenceModel } from "@/lib/visitorWorldMapCanonicalFeatures";

// Stage 5b regression invariant: whenever the live buffer contains at least
// one activity row with valid geo, the live presence model MUST emit at
// least one marker feature. If this ever regresses, live visitors silently
// disappear from the map even though the diagnostics panel shows presence.
describe("live map render invariant", () => {
  it("sessions_with_geo > 0 => markerFeatures > 0", () => {
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
      },
    );
    expect(model.diagnostics.liveWithGeo).toBeGreaterThan(0);
    expect(model.markers.length).toBeGreaterThan(0);
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