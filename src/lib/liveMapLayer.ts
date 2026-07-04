// liveMapLayer — pure helpers powering the Visitor World Map Pro live
// rendering layer: source/activity filters, viewport auto-fit, marker
// clustering, selection highlight, live↔canonical overlap. Zero React /
// Mapbox imports so every helper is deterministically unit-testable and
// re-usable by the Pro page (feed, diagnostics) and — later — by the
// Mapbox layer inside VisitorWorldMap.tsx.
//
// This module is presence-only. It never mutates canonical KPIs.
import type { LiveVisitorActivityRow } from "@/lib/liveVisitorTimeline";
import { resolveCanonicalSource, type CanonicalSource } from "@/lib/canonicalSource";

export type LiveSourceFilter = "all" | CanonicalSource;
export type LiveActivityFilter = "all" | "browsing" | "cart" | "checkout";

function classifyActivity(row: LiveVisitorActivityRow): "browsing" | "cart" | "checkout" {
  const t = (row.activity_type || "").toLowerCase();
  if (t === "purchase" || t === "checkout" || t === "begin_checkout") return "checkout";
  if (t === "add_to_cart" || t === "view_cart") return "cart";
  return "browsing";
}

function classifySource(row: LiveVisitorActivityRow): CanonicalSource {
  return resolveCanonicalSource({
    utm_source: row.utm_source ?? null,
    utm_medium: row.utm_medium ?? null,
    utm_campaign: row.utm_campaign ?? null,
    referrer: row.referrer ?? null,
    referrer_category: row.referrer_category ?? null,
    page_path: row.page_path ?? null,
  });
}

/**
 * Apply live-mode filters (source, activity) to a raw live-activity row set.
 * Filtering happens client-side so the WebSocket buffer stays coherent even
 * when the toolbar changes without a network refetch.
 */
export function applyLiveFilters(
  rows: LiveVisitorActivityRow[],
  opts: { source?: LiveSourceFilter; activity?: LiveActivityFilter },
): LiveVisitorActivityRow[] {
  const source = opts.source ?? "all";
  const activity = opts.activity ?? "all";
  return rows.filter((row) => {
    if (activity !== "all" && classifyActivity(row) !== activity) return false;
    if (source !== "all" && classifySource(row) !== source) return false;
    return true;
  });
}

export interface LiveCanonicalOverlap {
  liveSessions: number;
  overlapSession: number;
  overlapVisitor: number;
  overlapAny: number;
}

/**
 * Compute the intersection between the live-presence buffer and the canonical
 * truth session/visitor id sets. Surfaced in the Pro diagnostics panel so
 * operators can see how much realtime presence is already represented in the
 * canonical business truth.
 */
export function computeLiveCanonicalOverlap(
  rows: LiveVisitorActivityRow[],
  canonicalSessionIds: ReadonlySet<string>,
  canonicalVisitorIds: ReadonlySet<string>,
): LiveCanonicalOverlap {
  const sessions = new Set<string>();
  const visitors = new Set<string>();
  for (const row of rows) {
    sessions.add(row.session_id);
    if (row.visitor_id) visitors.add(row.visitor_id);
  }
  let overlapSession = 0;
  let overlapVisitor = 0;
  let overlapAny = 0;
  for (const sid of sessions) {
    if (canonicalSessionIds.has(sid)) overlapSession += 1;
  }
  for (const vid of visitors) {
    if (canonicalVisitorIds.has(vid)) overlapVisitor += 1;
  }
  for (const sid of sessions) {
    const rowsForSession = rows.filter((r) => r.session_id === sid);
    const vids = rowsForSession.map((r) => r.visitor_id).filter(Boolean) as string[];
    if (canonicalSessionIds.has(sid) || vids.some((v) => canonicalVisitorIds.has(v))) {
      overlapAny += 1;
    }
  }
  return {
    liveSessions: sessions.size,
    overlapSession,
    overlapVisitor,
    overlapAny,
  };
}

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Compute a padded Mapbox `fitBounds` box for a marker set. Returns `null`
 * when there are no geo-tagged markers so the caller can skip the fit.
 * The `padDegrees` value keeps a small halo around the outermost markers so
 * they don't sit flush against the viewport edge.
 */
export function computeBoundsForMarkers(
  markers: Array<{ latitude: number | null | undefined; longitude: number | null | undefined }>,
  padDegrees = 2,
): MapBounds | null {
  let west = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let south = Infinity;
  let count = 0;
  for (const m of markers) {
    if (typeof m.latitude !== "number" || typeof m.longitude !== "number") continue;
    if (!Number.isFinite(m.latitude) || !Number.isFinite(m.longitude)) continue;
    count += 1;
    if (m.longitude < west) west = m.longitude;
    if (m.longitude > east) east = m.longitude;
    if (m.latitude < south) south = m.latitude;
    if (m.latitude > north) north = m.latitude;
  }
  if (count === 0) return null;
  return {
    west: Math.max(-180, west - padDegrees),
    south: Math.max(-85, south - padDegrees),
    east: Math.min(180, east + padDegrees),
    north: Math.min(85, north + padDegrees),
  };
}

export interface MapCluster {
  key: string;
  latitude: number;
  longitude: number;
  count: number;
  session_ids: string[];
}

/**
 * Simple grid-based clustering. Buckets markers into `gridDegrees` cells and
 * emits a cluster per non-empty cell with the centroid + member session_ids.
 * Chosen over supercluster to keep the helper dependency-free; the actual
 * Mapbox layer can still use its built-in `cluster: true` — this helper is
 * used for the diagnostics feed and follow-mode look-ups.
 */
export function clusterMarkers(
  markers: Array<{ session_id: string; latitude: number | null | undefined; longitude: number | null | undefined }>,
  gridDegrees = 2,
): MapCluster[] {
  const buckets = new Map<string, { lat: number; lng: number; ids: string[] }>();
  for (const m of markers) {
    if (typeof m.latitude !== "number" || typeof m.longitude !== "number") continue;
    if (!Number.isFinite(m.latitude) || !Number.isFinite(m.longitude)) continue;
    const gx = Math.floor(m.longitude / gridDegrees);
    const gy = Math.floor(m.latitude / gridDegrees);
    const key = `${gx}:${gy}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.lat += m.latitude;
      bucket.lng += m.longitude;
      bucket.ids.push(m.session_id);
    } else {
      buckets.set(key, { lat: m.latitude, lng: m.longitude, ids: [m.session_id] });
    }
  }
  return Array.from(buckets.entries()).map(([key, b]) => ({
    key,
    latitude: b.lat / b.ids.length,
    longitude: b.lng / b.ids.length,
    count: b.ids.length,
    session_ids: b.ids,
  }));
}

/**
 * Selection state helper — returns a marker set annotated with a `selected`
 * flag so the map layer / feed can render a highlight ring without threading
 * the id through every callback.
 */
export function annotateSelection<T extends { session_id: string }>(
  markers: T[],
  selectedSessionId: string | null,
): Array<T & { selected: boolean }> {
  return markers.map((m) => ({ ...m, selected: m.session_id === selectedSessionId }));
}

/**
 * When "follow selected visitor" is enabled, resolve to the coordinate the
 * map should recenter on. Returns null when the selection has no geo.
 */
export function resolveFollowTarget(
  rows: LiveVisitorActivityRow[],
  selectedSessionId: string | null,
): { latitude: number; longitude: number } | null {
  if (!selectedSessionId) return null;
  // Prefer the most recent geo-tagged row for the selection.
  const candidates = rows
    .filter((r) => r.session_id === selectedSessionId && typeof r.latitude === "number" && typeof r.longitude === "number")
    .sort(
      (a, b) =>
        new Date(b.last_seen_at || b.created_at).getTime() -
        new Date(a.last_seen_at || a.created_at).getTime(),
    );
  const first = candidates[0];
  if (!first) return null;
  return { latitude: first.latitude as number, longitude: first.longitude as number };
}

/**
 * Build a polyline (ordered lat/lng pairs) from the visitor's activity trail
 * for the map path overlay. Duplicate consecutive coordinates are collapsed.
 */
export function buildVisitorPolyline(
  rows: LiveVisitorActivityRow[],
  sessionId: string,
): Array<[number, number]> {
  const path: Array<[number, number]> = [];
  const sorted = rows
    .filter((r) => r.session_id === sessionId && typeof r.latitude === "number" && typeof r.longitude === "number")
    .sort(
      (a, b) =>
        new Date(a.last_seen_at || a.created_at).getTime() -
        new Date(b.last_seen_at || b.created_at).getTime(),
    );
  for (const r of sorted) {
    const pt: [number, number] = [r.longitude as number, r.latitude as number];
    const prev = path[path.length - 1];
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) path.push(pt);
  }
  return path;
}