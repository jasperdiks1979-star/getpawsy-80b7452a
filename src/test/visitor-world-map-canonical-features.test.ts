import { describe, expect, it } from "vitest";
import type { TruthSession } from "@/hooks/useAnalyticsTruth";
import {
  assertWorldMapRenderInvariant,
  buildWorldMapModel,
  markerFeaturesToGeoJson,
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
});