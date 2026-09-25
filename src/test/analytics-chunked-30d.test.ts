import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  bucketAggregateFromPartial,
  emptyPartial,
  enrichedSessions,
  foldEvents,
  foldVisitorActivity,
  mergePartials,
  productViewKeyCount,
  sliceCountFor,
  sliceWindow,
} from "../../supabase/functions/_shared/canonicalIngest";
import { aggregateBuckets, totalsFromAggregate } from "../../supabase/functions/_shared/canonicalV2Buckets";
import { freshMsFor, maxStaleMsFor, evaluateCacheFreshness } from "@/lib/analyticsCacheFreshness";

// Deterministic pseudo-random generator.
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}
const STAGES = ["CANONICAL_PAGE_VIEW", "CANONICAL_PRODUCT_VIEW", "CANONICAL_ADD_TO_CART", "CANONICAL_CART", "CANONICAL_CHECKOUT", "CANONICAL_PURCHASE"];
const T0 = Date.parse("2026-08-26T00:00:00Z");
const T1 = T0 + 30 * 86400_000;

function makeData() {
  const r = rng(42);
  const events: any[] = [];
  const va: any[] = [];
  for (let i = 0; i < 4000; i++) {
    const sess = Math.floor(r() * 600);
    const hasSid = r() > 0.05;
    const t = T0 + Math.floor(r() * (T1 - T0));
    events.push({
      canonical_name: STAGES[Math.floor(r() * STAGES.length)],
      occurred_at: new Date(t).toISOString(),
      session_id: hasSid ? `s${sess}` : null,
      visitor_id: r() > 0.1 ? `v${sess % 450}` : null,
      country: r() > 0.3 ? (r() > 0.5 ? "US" : "SE") : null,
      city: r() > 0.5 ? "X" : null,
      utm_source: r() > 0.7 ? "pinterest" : null,
      utm_medium: null, utm_campaign: null,
      utm_content: r() > 0.8 ? "c" : null,
      referrer: null, device: r() > 0.5 ? "mobile" : "desktop",
      page_path: "/", landing_page: r() > 0.6 ? `/lp${i}` : null,
      is_internal: r() > 0.97, technical_path: r() > 0.98, is_bot: r() > 0.9, bot_confidence: r(),
      traffic_quality: ["human", "uncertain", "bot"][Math.floor(r() * 3)],
      classification_version: r() > 0.5 ? "v2" : null,
    });
  }
  for (let i = 0; i < 1500; i++) {
    const sess = Math.floor(r() * 700);
    va.push({
      created_at: new Date(T0 + Math.floor(r() * (T1 - T0))).toISOString(),
      session_id: r() > 0.3 ? `s${sess}` : `other-${sess}`,
      visitor_id: `v${sess % 450}`,
      latitude: r() > 0.4 ? r() * 90 : null,
      longitude: r() > 0.4 ? r() * 90 : null,
      country: r() > 0.5 ? "US" : null, city: null,
      is_internal: r() > 0.95, utm_campaign: r() > 0.8 ? "camp" : null,
      order_value: r() > 0.9 ? Math.round(r() * 100) : 0,
    });
  }
  const desc = (k: string) => (a: any, b: any) => (a[k] < b[k] ? 1 : a[k] > b[k] ? -1 : 0);
  events.sort(desc("occurred_at"));
  va.sort(desc("created_at"));
  return { events, va };
}
const src = (r: any) => (r.utm_source ? "pinterest" : "direct");
let n = 0;
const rid = () => `rid-${n++}`;

function single(events: any[], va: any[]) {
  const p = emptyPartial(new Date(T0).toISOString(), new Date(T1).toISOString());
  for (let i = 0; i < events.length; i += 1000) foldEvents(p, events.slice(i, i + 1000), src, rid);
  foldVisitorActivity(p, va);
  return p;
}
function chunked(events: any[], va: any[], slices: number) {
  const ws = sliceWindow(T0, T1, slices);
  return mergePartials(ws.map((w) => {
    const inW = (t: string) => t >= w.since && (w.closed ? t <= w.until : t < w.until);
    const p = emptyPartial(w.since, w.until);
    // JSON round-trip: slices travel over HTTP.
    foldEvents(p, events.filter((e) => inW(e.occurred_at)), src, rid);
    foldVisitorActivity(p, va.filter((v) => inW(v.created_at)));
    p.atc = {};
    return JSON.parse(JSON.stringify(p));
  }));
}
const strip = (m: Map<string, any>) => [...m.entries()].sort().map(([k, v]) => [k, v]);

describe("chunked 30d ingest", () => {
  const { events, va } = makeData();

  it("slices cover the window exactly once, newest first", () => {
    const ws = sliceWindow(T0, T1, sliceCountFor(720));
    expect(ws).toHaveLength(6);
    expect(ws[0].until).toBe(new Date(T1).toISOString());
    expect(ws[ws.length - 1].since).toBe(new Date(T0).toISOString());
    for (let i = 0; i < ws.length - 1; i++) expect(ws[i].since).toBe(ws[i + 1].until);
    expect(ws.filter((w) => w.closed)).toHaveLength(1);
    const total = ws.reduce((s, w) => s + events.filter((e) => e.occurred_at >= w.since && (w.closed ? e.occurred_at <= w.until : e.occurred_at < w.until)).length, 0);
    expect(total).toBe(events.length);
  });

  it("merged slices reproduce the single-pass sessions exactly (all KPI fields)", () => {
    const a = single(events, va);
    for (const k of [2, 6, 11]) {
      const b = chunked(events, va, k);
      expect(strip(enrichedSessions(b))).toEqual(strip(enrichedSessions(a)));
      expect(productViewKeyCount(b)).toBe(productViewKeyCount(a));
      expect(b.raw_events).toBe(a.raw_events);
      expect(b.sample_event).toEqual(a.sample_event);
    }
  });

  it("v2 buckets equal aggregateBuckets over raw rows, with and without ATC", () => {
    const b = chunked(events, va, 6);
    const atc: Record<string, string> = { s1: "human", s2: "bot", s3: "prefetch", s4: "crawler" };
    const raw = events.map((e) => ({ ...e, atc_traffic_type: e.session_id ? atc[e.session_id] ?? null : null }));
    const exp = totalsFromAggregate(aggregateBuckets(raw, ""));
    const got = totalsFromAggregate(bucketAggregateFromPartial(b, atc));
    // Sessionless rows get random ids in both paths; totals must still match.
    expect(got).toEqual(exp);
  });

  it("server wires chunking for 30d+ windows and compact warmer acks", () => {
    const fn = readFileSync("supabase/functions/analytics-canonical/index.ts", "utf8");
    expect(fn).toMatch(/opts\.hours >= CHUNKED_MIN_HOURS/);
    expect(fn).toMatch(/mode === "slice"/);
    expect(fn).toMatch(/if \(!internalTrusted\) return json\(\{ ok: false, error: "forbidden" \}, 403\)/);
    expect(fn).toMatch(/last_refresh_attempt_at: nowIso/);
    const warmer = readFileSync("supabase/functions/analytics-canonical-warmer/index.ts", "utf8");
    expect(warmer).toMatch(/ack: "compact"/);
  });
});

describe("warmer cadence vs freshness thresholds", () => {
  it("each window's fresh threshold covers its cron cadence plus one missed run", () => {
    const cadenceMin: Record<number, number> = { 1: 5, 24: 5, 168: 10, 336: 30, 720: 60 };
    for (const [h, c] of Object.entries(cadenceMin)) {
      expect(freshMsFor(Number(h))).toBe(c * 2 * 60_000);
      expect(maxStaleMsFor(Number(h))).toBeGreaterThan(freshMsFor(Number(h)));
    }
  });
  it("a 13-day-old 30d snapshot is never current", () => {
    const now = Date.parse("2026-09-25T09:00:00Z");
    const v = evaluateCacheFreshness({ hours: 720, generatedAt: "2026-09-11T17:53:07Z", now });
    expect(v.state).toBe("fallback");
    expect(v.isCurrent).toBe(false);
  });
});
