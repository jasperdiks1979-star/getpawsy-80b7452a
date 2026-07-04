import { describe, expect, it } from "vitest";
import type { TruthSession } from "@/hooks/useAnalyticsTruth";
import {
  assertWorldMapRenderInvariant,
  buildWorldMapModel,
  isUsTruthSession,
  markerFeaturesToGeoJson,
  markerFeaturesToGeoJsonWithCanonical,
  auditCanonicalFeatureFlags,
  assertZeroOrphanFeatures,
  type WorldMapMarkerFeature,
} from "@/lib/visitorWorldMapCanonicalFeatures";

function session(overrides: Partial<TruthSession>): TruthSession {
  return {
    session_id: "s-" + Math.random().toString(36).slice(2),
    visitor_id: null,
    country: "United States",
    city: "New York",
    latitude: null,
    longitude: null,
    first_seen_at: "2026-07-04T10:00:00.000Z",
    last_seen_at: "2026-07-04T10:05:00.000Z",
    page_views: 1,
    source: "direct",
    device: "desktop",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer: null,
    page_path: "/",
    has_product_view: false,
    has_add_to_cart: false,
    has_view_cart: false,
    has_checkout: false,
    has_purchase: false,
    order_value: 0,
    is_internal: false,
    ...overrides,
  };
}

describe("Visitor World Map canonical render features", () => {
  it("recognizes every backend US country spelling used by canonical and geo enrichment", () => {
    expect(isUsTruthSession({ country: "US" } as TruthSession)).toBe(true);
    expect(isUsTruthSession({ country: "USA" } as TruthSession)).toBe(true);
    expect(isUsTruthSession({ country: "United States" } as TruthSession)).toBe(true);
    expect(isUsTruthSession({ country: "United States of America" } as TruthSession)).toBe(true);
    expect(isUsTruthSession({ country: "France" } as TruthSession)).toBe(false);
  });

  it("builds markers and heatmap points directly from canonical sessions with geo", () => {
    const rows = [
      session({ session_id: "geo-1", latitude: 40.7128, longitude: -74.006, page_views: 3 }),
      session({ session_id: "geo-2", latitude: 41.8661, longitude: -88.107, has_add_to_cart: true }),
      session({ session_id: "no-geo", latitude: null, longitude: null, page_views: 2 }),
    ];

    const model = buildWorldMapModel(rows, {
      activityFilter: "all",
      sourceFilter: "all",
      usOnly: false,
      excludeInternal: true,
    });

    expect(model.diagnostics.canonicalSessions).toBe(3);
    expect(model.diagnostics.sessionsWithGeo).toBe(2);
    expect(model.diagnostics.markerFeatures).toBe(2);
    expect(model.diagnostics.heatmapFeatures).toBe(2);
    expect(model.diagnostics.sessionsWithoutGeo).toBe(1);
    expect(assertWorldMapRenderInvariant(model.diagnostics)).toBe(true);
  });

  it("serializes Mapbox point coordinates in lng/lat order", () => {
    const model = buildWorldMapModel([
      session({ session_id: "nyc", latitude: 40.7128, longitude: -74.006 }),
    ], {
      activityFilter: "all",
      sourceFilter: "all",
      usOnly: false,
      excludeInternal: true,
    });

    const geojson = markerFeaturesToGeoJson(model.markerFeatures);
    expect(geojson.features[0].geometry.coordinates).toEqual([-74.006, 40.7128]);
  });

  it("reports explicit filter diagnostics without hiding zeroes", () => {
    const rows = [
      session({ session_id: "us-clean", country: "United States", latitude: 40, longitude: -74 }),
      session({ session_id: "fr-clean", country: "France", latitude: 43.5, longitude: 4.98 }),
      session({ session_id: "us-internal", country: "US", latitude: 41, longitude: -88, is_internal: true }),
    ];

    const model = buildWorldMapModel(rows, {
      activityFilter: "all",
      sourceFilter: "all",
      usOnly: true,
      excludeInternal: true,
    });

    expect(model.diagnostics.canonicalSessions).toBe(1);
    expect(model.diagnostics.sessionsWithGeo).toBe(1);
    expect(model.diagnostics.filteredOutByUsOnly).toBe(1);
    expect(model.diagnostics.filteredOutByInternalTest).toBe(1);
  });

  it("fails the invariant if sessions_with_geo is positive but markerFeatures is zero", () => {
    expect(assertWorldMapRenderInvariant({
      sessionsWithGeo: 1,
      markerFeatures: 0,
      heatmapFeatures: 0,
    })).toBe(false);
  });

  it("stamps canonical=true only for features whose session_id is in the canonical truth set", () => {
    const model = buildWorldMapModel(
      [
        session({ session_id: "truth-1", latitude: 40, longitude: -74 }),
        session({ session_id: "truth-2", latitude: 41, longitude: -75, has_add_to_cart: true }),
      ],
      { activityFilter: "all", sourceFilter: "all", usOnly: false, excludeInternal: true },
    );
    // Inject a synthetic orphan (a feature whose session_id is NOT in the
    // canonical truth envelope) to prove the audit detects parallel truth.
    const orphan: WorldMapMarkerFeature = {
      ...model.markerFeatures[0],
      id: "orphan-x",
      session_id: "orphan-x",
    };
    const features = [...model.markerFeatures, orphan];
    const canonicalIds = new Set(["truth-1", "truth-2"]);

    const audit = auditCanonicalFeatureFlags(features, canonicalIds);
    expect(audit.total).toBe(3);
    expect(audit.canonicalCount).toBe(2);
    expect(audit.orphanCount).toBe(1);
    expect(audit.orphanSessionIds).toEqual(["orphan-x"]);
    expect(assertZeroOrphanFeatures(audit)).toBe(false);

    const geojson = markerFeaturesToGeoJsonWithCanonical(features, canonicalIds);
    const canonicalFlags = geojson.features.map((f) => ({ id: f.properties?.session_id, canonical: f.properties?.canonical }));
    expect(canonicalFlags).toEqual([
      { id: "truth-1", canonical: true },
      { id: "truth-2", canonical: true },
      { id: "orphan-x", canonical: false },
    ]);
  });

  it("zero-orphan invariant holds when every rendered feature comes from the canonical set", () => {
    const model = buildWorldMapModel(
      [
        session({ session_id: "a", latitude: 10, longitude: 20 }),
        session({ session_id: "b", latitude: 11, longitude: 21, has_checkout: true, has_purchase: true }),
      ],
      { activityFilter: "all", sourceFilter: "all", usOnly: false, excludeInternal: true },
    );
    const canonicalIds = new Set(["a", "b"]);
    const audit = auditCanonicalFeatureFlags(model.markerFeatures, canonicalIds);
    expect(audit.orphanCount).toBe(0);
    expect(audit.canonicalCount).toBe(2);
    expect(assertZeroOrphanFeatures(audit)).toBe(true);
    // Default (no set) geojson stamps canonical=true for backward compat.
    const geojson = markerFeaturesToGeoJson(model.markerFeatures);
    for (const f of geojson.features) {
      expect(f.properties?.canonical).toBe(true);
    }
  });
});