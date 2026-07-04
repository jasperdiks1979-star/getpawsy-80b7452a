import { describe, it, expect } from "vitest";
import {
  applyLiveFilters,
  computeLiveCanonicalOverlap,
  computeBoundsForMarkers,
  clusterMarkers,
  annotateSelection,
  resolveFollowTarget,
  buildVisitorPolyline,
} from "@/lib/liveMapLayer";
import type { LiveVisitorActivityRow } from "@/lib/liveVisitorTimeline";

const now = new Date().toISOString();
const earlier = new Date(Date.now() - 60_000).toISOString();

function row(overrides: Partial<LiveVisitorActivityRow>): LiveVisitorActivityRow {
  return {
    session_id: "s",
    created_at: now,
    last_seen_at: now,
    ...overrides,
  };
}

describe("applyLiveFilters", () => {
  const rows: LiveVisitorActivityRow[] = [
    row({ session_id: "a", activity_type: "browsing", utm_source: "pinterest" }),
    row({ session_id: "b", activity_type: "add_to_cart", utm_source: "google" }),
    row({ session_id: "c", activity_type: "purchase", utm_source: "direct" }),
  ];

  it("passes through when both filters are 'all'", () => {
    expect(applyLiveFilters(rows, {}).length).toBe(3);
  });

  it("filters by activity classification", () => {
    const cart = applyLiveFilters(rows, { activity: "cart" });
    expect(cart.map((r) => r.session_id)).toEqual(["b"]);
    const checkout = applyLiveFilters(rows, { activity: "checkout" });
    expect(checkout.map((r) => r.session_id)).toEqual(["c"]);
    const browsing = applyLiveFilters(rows, { activity: "browsing" });
    expect(browsing.map((r) => r.session_id)).toEqual(["a"]);
  });
});

describe("computeLiveCanonicalOverlap", () => {
  it("counts intersection via session_id and visitor_id", () => {
    const rows: LiveVisitorActivityRow[] = [
      row({ session_id: "s1", visitor_id: "v1" }),
      row({ session_id: "s2", visitor_id: "v2" }),
      row({ session_id: "s3", visitor_id: "v3" }),
    ];
    const overlap = computeLiveCanonicalOverlap(
      rows,
      new Set(["s1"]),
      new Set(["v2"]),
    );
    expect(overlap.liveSessions).toBe(3);
    expect(overlap.overlapSession).toBe(1);
    expect(overlap.overlapVisitor).toBe(1);
    expect(overlap.overlapAny).toBe(2);
  });

  it("returns zeros when the canonical sets are empty", () => {
    const overlap = computeLiveCanonicalOverlap(
      [row({ session_id: "a" })],
      new Set(),
      new Set(),
    );
    expect(overlap).toEqual({ liveSessions: 1, overlapSession: 0, overlapVisitor: 0, overlapAny: 0 });
  });
});

describe("computeBoundsForMarkers", () => {
  it("returns null when no valid coordinates", () => {
    expect(computeBoundsForMarkers([{ latitude: null, longitude: null }])).toBeNull();
  });

  it("returns padded bounds and clamps to world limits", () => {
    const bounds = computeBoundsForMarkers(
      [
        { latitude: 30, longitude: -97 },
        { latitude: 40, longitude: -75 },
      ],
      2,
    );
    expect(bounds).toEqual({ west: -99, south: 28, east: -73, north: 42 });
  });
});

describe("clusterMarkers", () => {
  it("groups nearby markers into a single cluster", () => {
    const clusters = clusterMarkers(
      [
        { session_id: "a", latitude: 30.1, longitude: -97.1 },
        { session_id: "b", latitude: 30.5, longitude: -97.3 },
        { session_id: "c", latitude: 40.0, longitude: -75.0 },
      ],
      2,
    );
    expect(clusters.length).toBe(2);
    const big = clusters.find((c) => c.count === 2);
    expect(big?.session_ids.sort()).toEqual(["a", "b"]);
  });
});

describe("annotateSelection", () => {
  it("marks only the matching session as selected", () => {
    const out = annotateSelection([{ session_id: "a" }, { session_id: "b" }], "b");
    expect(out.map((m) => m.selected)).toEqual([false, true]);
  });
});

describe("resolveFollowTarget", () => {
  it("returns latest geo-tagged coord for the selected session", () => {
    const rows: LiveVisitorActivityRow[] = [
      row({ session_id: "a", latitude: 30, longitude: -97, last_seen_at: earlier }),
      row({ session_id: "a", latitude: 31, longitude: -96, last_seen_at: now }),
      row({ session_id: "b", latitude: 40, longitude: -75, last_seen_at: now }),
    ];
    expect(resolveFollowTarget(rows, "a")).toEqual({ latitude: 31, longitude: -96 });
    expect(resolveFollowTarget(rows, null)).toBeNull();
  });
});

describe("buildVisitorPolyline", () => {
  it("builds an ordered polyline and collapses duplicates", () => {
    const rows: LiveVisitorActivityRow[] = [
      row({ session_id: "a", latitude: 30, longitude: -97, last_seen_at: earlier }),
      row({ session_id: "a", latitude: 30, longitude: -97, last_seen_at: now }),
      row({ session_id: "a", latitude: 31, longitude: -96, last_seen_at: now }),
    ];
    const path = buildVisitorPolyline(rows, "a");
    expect(path).toEqual([[-97, 30], [-96, 31]]);
  });
});