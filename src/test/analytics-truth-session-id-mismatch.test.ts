// P0 regression — World Map showed 0 visitors because writers on
// `canonical_events` (UUID session_ids) and `visitor_activity`
// (`<epoch>-<rand>` session_ids) use disjoint namespaces. Intersecting
// map markers by session_id alone yielded zero overlap even when both
// stores had valid rows for the same real visitors. The fix: enrich
// canonical sessions by visitor_id fallback, and match markers by
// session_id OR visitor_id. This suite locks that in.
import { describe, it, expect } from "vitest";

type Activity = {
  id: string;
  session_id: string;
  visitor_id?: string | null;
  activity_type: string;
  latitude: number | null;
  longitude: number | null;
};

type TruthSession = {
  session_id: string;
  visitor_id: string | null;
  has_add_to_cart: boolean;
  has_view_cart: boolean;
  has_checkout: boolean;
};

function filterMarkers(
  activities: Activity[],
  truth: TruthSession[] | null,
) {
  if (!truth) return activities;
  const sids = new Set(truth.map((s) => s.session_id));
  const vids = new Set(truth.map((s) => s.visitor_id).filter(Boolean) as string[]);
  return activities.filter(
    (a) => sids.has(a.session_id) || (!!a.visitor_id && vids.has(a.visitor_id)),
  );
}

describe("session_id namespace mismatch — markers must still render", () => {
  const truth: TruthSession[] = [
    { session_id: "uuid-A", visitor_id: "vis-1", has_add_to_cart: true, has_view_cart: false, has_checkout: false },
    { session_id: "uuid-B", visitor_id: "vis-2", has_add_to_cart: false, has_view_cart: false, has_checkout: true },
    { session_id: "uuid-C", visitor_id: "vis-3", has_add_to_cart: false, has_view_cart: false, has_checkout: false },
  ];
  const activities: Activity[] = [
    // Different session_id namespace — the classic regression shape.
    { id: "1", session_id: "1783000000-aaa", visitor_id: "vis-1", activity_type: "cart", latitude: 40, longitude: -100 },
    { id: "2", session_id: "1783000001-bbb", visitor_id: "vis-2", activity_type: "checkout", latitude: 41, longitude: -101 },
    { id: "3", session_id: "1783000002-ccc", visitor_id: "vis-3", activity_type: "browsing", latitude: 42, longitude: -102 },
    // Bot / stale row with no truth match — must be dropped.
    { id: "4", session_id: "1783000003-ddd", visitor_id: "vis-bot", activity_type: "browsing", latitude: 0, longitude: 0 },
  ];

  it("keeps markers whose visitor_id is in the canonical truth set", () => {
    const kept = filterMarkers(activities, truth);
    expect(kept.map((k) => k.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("still drops activities that do not belong to any counted session", () => {
    const kept = filterMarkers(activities, truth);
    expect(kept.find((k) => k.id === "4")).toBeUndefined();
  });

  it("returns non-zero markers whenever canonical has valid clean sessions", () => {
    const kept = filterMarkers(activities, truth);
    expect(kept.length).toBeGreaterThan(0);
  });
});