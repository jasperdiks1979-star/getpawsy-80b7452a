import { resolveCanonicalSource, type CanonicalSource } from "@/lib/canonicalSource";
import type { TruthSession } from "@/hooks/useAnalyticsTruth";

export type WorldMapActivityFilter = "all" | "browsing" | "cart" | "checkout";
export type WorldMapSourceFilter = "all" | CanonicalSource;
export type WorldMapActivityType = "browsing" | "cart" | "checkout" | "begin_checkout" | "product_view" | "add_to_cart" | "view_cart" | "purchase";

export interface WorldMapMarkerFeature {
  id: string;
  session_id: string;
  visitor_id?: string | null;
  activity_type: WorldMapActivityType;
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
  created_at: string;
  last_seen_at?: string;
  referrer_category?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
  page_path?: string | null;
  source: string;
  is_internal: boolean;
}

export interface WorldMapDiagnostics {
  canonicalSessions: number;
  sessionsWithGeo: number;
  markerFeatures: number;
  heatmapFeatures: number;
  sessionsWithoutGeo: number;
  filteredOutByUsOnly: number;
  filteredOutByInternalTest: number;
}

export interface WorldMapModel {
  sourceFilterSessions: TruthSession[];
  truthSessions: TruthSession[];
  markerFeatures: WorldMapMarkerFeature[];
  heatmapFeatures: WorldMapMarkerFeature[];
  diagnostics: WorldMapDiagnostics;
}

export function isValidLatLng(latitude: unknown, longitude: unknown): latitude is number {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function isUsTruthSession(session: Pick<TruthSession, "country">): boolean {
  const country = (session.country ?? "").trim().toLowerCase();
  return country === "us" || country === "usa" || country === "united states" || country === "united states of america";
}

export function getTruthActivityType(session: Pick<TruthSession, "has_add_to_cart" | "has_view_cart" | "has_checkout" | "has_purchase">): WorldMapActivityType {
  if (session.has_checkout || session.has_purchase) return "checkout";
  if (session.has_add_to_cart || session.has_view_cart) return "cart";
  return "browsing";
}

export function truthSessionMatchesActivityFilter(session: TruthSession, activityFilter: WorldMapActivityFilter): boolean {
  if (activityFilter === "all") return true;
  return getTruthActivityType(session) === activityFilter;
}

export function truthSessionMatchesSourceFilter(session: TruthSession, sourceFilter: WorldMapSourceFilter): boolean {
  if (sourceFilter === "all") return true;
  const canonical = resolveCanonicalSource({
    utm_source: session.utm_source,
    utm_medium: session.utm_medium,
    utm_campaign: session.utm_campaign,
    referrer: session.referrer,
    referrer_category: null,
    page_path: session.page_path,
  });
  return canonical === sourceFilter;
}

export function canonicalSessionToMarkerFeature(session: TruthSession): WorldMapMarkerFeature | null {
  if (!isValidLatLng(session.latitude, session.longitude)) return null;
  return {
    id: session.session_id,
    session_id: session.session_id,
    visitor_id: session.visitor_id,
    activity_type: getTruthActivityType(session),
    latitude: session.latitude,
    longitude: session.longitude,
    country: session.country,
    city: session.city,
    created_at: session.last_seen_at || session.first_seen_at,
    last_seen_at: session.last_seen_at,
    referrer_category: null,
    utm_source: session.utm_source,
    utm_medium: session.utm_medium,
    utm_campaign: session.utm_campaign,
    referrer: session.referrer,
    page_path: session.page_path,
    source: session.source,
    is_internal: session.is_internal,
  };
}

export function buildWorldMapModel(
  canonicalSessions: TruthSession[],
  opts: {
    activityFilter: WorldMapActivityFilter;
    sourceFilter: WorldMapSourceFilter;
    usOnly: boolean;
    excludeInternal: boolean;
  },
): WorldMapModel {
  const sessionsAfterActivity = canonicalSessions.filter((session) => truthSessionMatchesActivityFilter(session, opts.activityFilter));

  const sourceFilterSessions = sessionsAfterActivity
    .filter((session) => (opts.usOnly ? isUsTruthSession(session) : true))
    .filter((session) => (opts.excludeInternal ? !session.is_internal : true));

  const sessionsAfterActivityAndSource = sessionsAfterActivity.filter((session) => truthSessionMatchesSourceFilter(session, opts.sourceFilter));
  const filteredOutByUsOnly = opts.usOnly
    ? sessionsAfterActivityAndSource.filter((session) => !isUsTruthSession(session)).length
    : 0;
  const sessionsAfterGeo = sessionsAfterActivityAndSource.filter((session) => (opts.usOnly ? isUsTruthSession(session) : true));
  const filteredOutByInternalTest = opts.excludeInternal
    ? sessionsAfterGeo.filter((session) => session.is_internal).length
    : 0;
  const truthSessions = sessionsAfterGeo.filter((session) => (opts.excludeInternal ? !session.is_internal : true));

  const markerFeatures = truthSessions
    .map(canonicalSessionToMarkerFeature)
    .filter(Boolean) as WorldMapMarkerFeature[];
  const heatmapFeatures = markerFeatures;

  return {
    sourceFilterSessions,
    truthSessions,
    markerFeatures,
    heatmapFeatures,
    diagnostics: {
      canonicalSessions: truthSessions.length,
      sessionsWithGeo: markerFeatures.length,
      markerFeatures: markerFeatures.length,
      heatmapFeatures: heatmapFeatures.length,
      sessionsWithoutGeo: truthSessions.length - markerFeatures.length,
      filteredOutByUsOnly,
      filteredOutByInternalTest,
    },
  };
}

export function markerFeaturesToGeoJson(features: WorldMapMarkerFeature[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return markerFeaturesToGeoJsonWithCanonical(features, null);
}

/**
 * Same as `markerFeaturesToGeoJson`, but stamps each feature's `canonical`
 * property against a ground-truth set of canonical session_ids. Any feature
 * whose session_id is NOT in the set is marked `canonical: false` and is an
 * "orphan" — proof of a parallel truth source leaking into the render layer.
 *
 * When `canonicalSessionIds` is `null`, every feature is treated as canonical
 * (used only for backwards compat with the plain export above).
 */
export function markerFeaturesToGeoJsonWithCanonical(
  features: WorldMapMarkerFeature[],
  canonicalSessionIds: ReadonlySet<string> | null,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature" as const,
      properties: {
        id: feature.id,
        session_id: feature.session_id,
        visitor_id: feature.visitor_id ?? "",
        activity_type: feature.activity_type,
        weight: feature.activity_type === "checkout" ? 3 : feature.activity_type === "cart" ? 2 : 1,
        color: feature.activity_type === "checkout" ? "#22c55e" : feature.activity_type === "cart" ? "#f97316" : "#ef4444",
        source: feature.source,
        canonical: canonicalSessionIds ? canonicalSessionIds.has(feature.session_id) : true,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [feature.longitude, feature.latitude],
      },
    })),
  };
}

export interface CanonicalFeatureAudit {
  total: number;
  canonicalCount: number;
  orphanCount: number;
  orphanSessionIds: string[];
  flags: Map<string, boolean>;
}

/**
 * Audits a rendered marker set against the canonical visitor truth session
 * ids. Every feature MUST resolve to `canonical=true` (present in the truth
 * set) or be recorded as an orphan. Zero orphans is the invariant the render
 * layer must uphold.
 */
export function auditCanonicalFeatureFlags(
  features: WorldMapMarkerFeature[],
  canonicalSessionIds: ReadonlySet<string>,
): CanonicalFeatureAudit {
  const flags = new Map<string, boolean>();
  const orphanSessionIds: string[] = [];
  let canonicalCount = 0;
  for (const feature of features) {
    const isCanonical = canonicalSessionIds.has(feature.session_id);
    flags.set(feature.id, isCanonical);
    if (isCanonical) {
      canonicalCount += 1;
    } else {
      orphanSessionIds.push(feature.session_id);
    }
  }
  return {
    total: features.length,
    canonicalCount,
    orphanCount: orphanSessionIds.length,
    orphanSessionIds,
    flags,
  };
}

/**
 * Zero-orphan render invariant: every rendered marker feature must correspond
 * to a canonical truth session. Returns `true` when the invariant holds.
 */
export function assertZeroOrphanFeatures(audit: Pick<CanonicalFeatureAudit, "orphanCount">): boolean {
  return audit.orphanCount === 0;
}

export function assertWorldMapRenderInvariant(diagnostics: Pick<WorldMapDiagnostics, "sessionsWithGeo" | "markerFeatures" | "heatmapFeatures">): boolean {
  return diagnostics.sessionsWithGeo === 0 || (diagnostics.markerFeatures > 0 && diagnostics.heatmapFeatures > 0);
}