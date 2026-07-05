// P0 regression — analytics-canonical produced 10h=26 visitors but 24h=23
// visitors for the same filters. Impossible: widening a time window can
// only ADD sessions. Root cause: visitor_activity enrichment queries were
// NOT bounded to [since, until], so an out-of-window row with
// is_internal=true retroactively flagged a session as internal, and it
// was then dropped by the `!is_internal` filter. The wider the window,
// the more visitors touched, the more historical internal flags pulled
// in, the fewer sessions survived. Fix: bound both enrichment queries
// with .gte("created_at", since).lte("created_at", until).
//
// This test simulates the enrichment pipeline in pure TS so it locks in
// the invariant without needing a live Supabase.
import { describe, it, expect } from "vitest";

type Session = {
  session_id: string;
  visitor_id: string;
  is_internal: boolean;
  latitude: number | null;
  longitude: number | null;
  country: string;
};

type ActivityRow = {
  visitor_id: string;
  session_id: string;
  is_internal: boolean;
  created_at: string; // ISO
  latitude: number | null;
  longitude: number | null;
  country: string | null;
};

function enrich(
  sessions: Session[],
  activity: ActivityRow[],
  since: string,
  until: string,
  windowBounded: boolean,
) {
  const rows = windowBounded
    ? activity.filter((r) => r.created_at >= since && r.created_at <= until)
    : activity;
  const bySid = new Map<string, ActivityRow[]>();
  const byVid = new Map<string, ActivityRow[]>();
  for (const r of rows) {
    if (r.session_id) {
      const a = bySid.get(r.session_id) ?? [];
      a.push(r);
      bySid.set(r.session_id, a);
    }
    if (r.visitor_id) {
      const a = byVid.get(r.visitor_id) ?? [];
      a.push(r);
      byVid.set(r.visitor_id, a);
    }
  }
  const out: Session[] = sessions.map((s) => ({ ...s }));
  for (const s of out) {
    const bucket = [...(bySid.get(s.session_id) ?? []), ...(byVid.get(s.visitor_id) ?? [])];
    for (const r of bucket) {
      if (r.is_internal === true) s.is_internal = true;
      if (s.latitude == null && r.latitude != null) s.latitude = r.latitude;
      if (s.longitude == null && r.longitude != null) s.longitude = r.longitude;
    }
  }
  return out.filter((s) => !s.is_internal);
}

function makeCanonicalSessions(count: number, prefix: string): Session[] {
  return Array.from({ length: count }).map((_, i) => ({
    session_id: `${prefix}-s-${i}`,
    visitor_id: `${prefix}-v-${i}`,
    is_internal: false,
    latitude: 40 + i * 0.01,
    longitude: -74 - i * 0.01,
    country: "United States",
  }));
}

describe("analytics-canonical time-window monotonicity", () => {
  const nowMs = Date.parse("2026-07-05T20:00:00.000Z");
  const w10h = new Date(nowMs - 10 * 3600_000).toISOString();
  const w24h = new Date(nowMs - 24 * 3600_000).toISOString();
  const until = new Date(nowMs).toISOString();

  const sessions10h = makeCanonicalSessions(26, "recent");
  const sessions24h = [
    ...sessions10h,
    // 3 more visitors that only appear in the 24h window
    ...makeCanonicalSessions(3, "older").map((s, i) => ({
      ...s,
      session_id: `older-s-${i}`,
      visitor_id: `older-v-${i}`,
    })),
  ];

  // Stale historical rows: one is_internal=true row per visitor from 3 days ago.
  const staleInternalRows: ActivityRow[] = sessions24h.map((s) => ({
    visitor_id: s.visitor_id,
    session_id: `stale-${s.session_id}`,
    is_internal: true,
    created_at: new Date(nowMs - 3 * 24 * 3600_000).toISOString(),
    latitude: null,
    longitude: null,
    country: null,
  }));

  it("REPRODUCES the bug when enrichment is not time-bounded (24h < 10h)", () => {
    const clean10h = enrich(sessions10h, staleInternalRows, w10h, until, false);
    const clean24h = enrich(sessions24h, staleInternalRows, w24h, until, false);
    // Every visitor gets wiped by the stale internal flag → both zero,
    // and monotonicity is not restored just because both collapse.
    expect(clean24h.length).toBeLessThan(sessions24h.length);
    expect(clean10h.length).toBeLessThan(sessions10h.length);
  });

  it("FIXES the bug when enrichment is bounded to [since, until]", () => {
    const clean10h = enrich(sessions10h, staleInternalRows, w10h, until, true);
    const clean24h = enrich(sessions24h, staleInternalRows, w24h, until, true);
    expect(clean10h.length).toBe(26);
    expect(clean24h.length).toBe(29);
    // Hard invariant: widening the window can only add sessions.
    expect(clean24h.length).toBeGreaterThanOrEqual(clean10h.length);
  });

  it("preserves geo enrichment across wider windows", () => {
    const clean10h = enrich(sessions10h, staleInternalRows, w10h, until, true);
    const clean24h = enrich(sessions24h, staleInternalRows, w24h, until, true);
    const withGeo10 = clean10h.filter((s) => s.latitude != null && s.longitude != null).length;
    const withGeo24 = clean24h.filter((s) => s.latitude != null && s.longitude != null).length;
    expect(withGeo24).toBeGreaterThanOrEqual(withGeo10);
    expect(withGeo10).toBeGreaterThan(0);
  });
});