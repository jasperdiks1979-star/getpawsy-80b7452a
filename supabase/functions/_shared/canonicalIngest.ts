// Chunkable ingest for `analytics-canonical`.
//
// The canonical envelope used to be built from ONE giant array of raw
// canonical_events rows. For the 30-day all-countries window (~105k events)
// that single pass exceeded the edge worker CPU limit and the rebuild was
// killed mid-flight, so the 30d cache never refreshed.
//
// This module turns raw rows into a compact, JSON-serialisable, MERGEABLE
// per-session partial. Rows are folded page-by-page (never retained), and a
// long window can be built as several time slices — each slice in its own
// worker invocation — whose partials are merged newest-first. The merge
// reproduces the single-pass fold exactly (same first-touch / fill-null /
// min / max / OR semantics), so the envelope built from merged slices is
// identical to the envelope built from one pass. Pure logic only: no Deno or
// network APIs, so it is unit-tested directly from vitest.

import { classifyRow, type Bucket, type BucketAggregate, emptyAggregate, type ClassifiableRow } from "./canonicalV2Buckets.ts";

export interface SessionPartial {
  session_id: string;
  visitor_id: string | null;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  first_seen_at: string;
  last_seen_at: string;
  page_views: number;
  source: string;
  device: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  referrer: string | null;
  page_path: string | null;
  landing_page: string | null;
  landing_page_at: string | null;
  has_product_view: boolean;
  has_add_to_cart: boolean;
  has_view_cart: boolean;
  has_checkout: boolean;
  has_purchase: boolean;
  order_value: number;
  is_internal: boolean;
  va_is_internal: boolean;
}

/** v2 bucket state per session key. Indexes into V2_PRECEDENCE (lower = worse). */
export interface V2State {
  /** worst bucket from hard signals (internal / technical / bot) */
  h: number | null;
  /** worst bucket from soft (traffic_quality) signals, rows without hard hit */
  s: number | null;
  /** at least one row had no hard hit (so an ATC verdict applies to it) */
  soft: boolean;
  /** first-encountered visitor for the session */
  v: string;
}

export interface VaAgg {
  lat: number | null;
  lng: number | null;
  country: string | null;
  city: string | null;
  internal: boolean;
  utm_campaign: string | null;
  order_value: number;
}

export interface IngestPartial {
  since: string;
  until: string;
  raw_events: number;
  sample_event: unknown | null;
  sessions: Record<string, SessionPartial>;
  /** visitor ids of CANONICAL_PRODUCT_VIEW rows without a session_id */
  pv_sessionless: string[];
  v2: Record<string, V2State>;
  va_by_sid: Record<string, VaAgg>;
  va_by_vid: Record<string, VaAgg>;
  /** analytics_traffic_classification verdicts; null = not loaded yet */
  atc: Record<string, string> | null;
  truncated: string[];
}

export const V2_PRECEDENCE: Bucket[] = ["internal", "technical", "bot", "crawler", "uncertain", "human", "legacy_unclassified"];

export function emptyPartial(since: string, until: string): IngestPartial {
  return {
    since, until, raw_events: 0, sample_event: null,
    sessions: {}, pv_sessionless: [], v2: {}, va_by_sid: {}, va_by_vid: {},
    atc: null, truncated: [],
  };
}

function hardBucket(r: ClassifiableRow): Bucket | null {
  if (r.is_internal === true) return "internal";
  if (r.technical_path === true || (typeof r.technical_path === "string" && r.technical_path.length > 0)) return "technical";
  if (r.is_bot === true && Number(r.bot_confidence ?? 0) >= 0.7) return "bot";
  return null;
}

const minIdx = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));

/**
 * Fold one page of canonical_events rows (ordered occurred_at DESC, newest
 * first — the same order the single-pass scan used) into the partial.
 */
export function foldEvents(
  p: IngestPartial,
  rows: any[],
  classifySource: (r: any) => string,
  randomId: () => string = () => crypto.randomUUID(),
): void {
  for (const r of rows) {
    if (p.sample_event == null) p.sample_event = r;
    p.raw_events += 1;

    // v2 bucket state (mirrors aggregateBuckets, ATC applied at finalize)
    const v2key = r.session_id || `no-session:${r.visitor_id ?? randomId()}`;
    const hard = hardBucket(r);
    let st = p.v2[v2key];
    if (!st) { st = { h: null, s: null, soft: false, v: r.visitor_id || v2key }; p.v2[v2key] = st; }
    if (hard) st.h = minIdx(st.h, V2_PRECEDENCE.indexOf(hard));
    else {
      st.soft = true;
      st.s = minIdx(st.s, V2_PRECEDENCE.indexOf(classifyRow({ ...r, atc_traffic_type: null }, "")));
    }

    const stage = r.canonical_name;
    const sid = r.session_id;
    if (!sid) {
      if (stage === "CANONICAL_PRODUCT_VIEW" && r.visitor_id) p.pv_sessionless.push(String(r.visitor_id));
      continue;
    }
    let s = p.sessions[sid];
    if (!s) {
      s = {
        session_id: sid,
        visitor_id: r.visitor_id ?? null,
        country: r.country ?? null,
        city: r.city ?? null,
        latitude: null,
        longitude: null,
        first_seen_at: r.occurred_at,
        last_seen_at: r.occurred_at,
        page_views: 0,
        source: classifySource(r),
        device: r.device ?? null,
        utm_source: r.utm_source ?? null,
        utm_medium: r.utm_medium ?? null,
        utm_campaign: r.utm_campaign ?? null,
        utm_content: r.utm_content ?? null,
        referrer: r.referrer ?? null,
        page_path: r.page_path ?? null,
        landing_page: r.landing_page ?? null,
        landing_page_at: r.landing_page ? r.occurred_at : null,
        has_product_view: false,
        has_add_to_cart: false,
        has_view_cart: false,
        has_checkout: false,
        has_purchase: false,
        order_value: 0,
        is_internal: false,
        va_is_internal: false,
      };
      p.sessions[sid] = s;
    }
    if (r.occurred_at < s.first_seen_at) s.first_seen_at = r.occurred_at;
    if (r.occurred_at > s.last_seen_at) s.last_seen_at = r.occurred_at;
    if (r.landing_page && (!s.landing_page || !s.landing_page_at || r.occurred_at < s.landing_page_at)) {
      s.landing_page = r.landing_page;
      s.landing_page_at = r.occurred_at;
    }
    if (stage === "CANONICAL_PAGE_VIEW") s.page_views += 1;
    if (stage === "CANONICAL_PRODUCT_VIEW") s.has_product_view = true;
    if (stage === "CANONICAL_ADD_TO_CART") s.has_add_to_cart = true;
    if (stage === "CANONICAL_CART") s.has_view_cart = true;
    if (stage === "CANONICAL_CHECKOUT") s.has_checkout = true;
    if (stage === "CANONICAL_PURCHASE") s.has_purchase = true;
    if (!s.visitor_id && r.visitor_id) s.visitor_id = r.visitor_id;
    if (!s.country && r.country) s.country = r.country;
    if (!s.city && r.city) s.city = r.city;
    if (!s.utm_content && r.utm_content) s.utm_content = r.utm_content;
  }
}

function foldVaInto(map: Record<string, VaAgg>, key: string, row: any) {
  let a = map[key];
  if (!a) { a = { lat: null, lng: null, country: null, city: null, internal: false, utm_campaign: null, order_value: 0 }; map[key] = a; }
  if (a.lat == null && row.latitude != null) a.lat = Number(row.latitude);
  if (a.lng == null && row.longitude != null) a.lng = Number(row.longitude);
  if (!a.country && row.country) a.country = row.country;
  if (!a.city && row.city) a.city = row.city;
  if (row.is_internal === true) a.internal = true;
  if (!a.utm_campaign && row.utm_campaign) a.utm_campaign = row.utm_campaign;
  const ov = Number(row.order_value || 0);
  if (ov > a.order_value) a.order_value = ov;
}

/** Fold one page of visitor_activity rows (created_at DESC). */
export function foldVisitorActivity(p: IngestPartial, rows: any[]): void {
  for (const row of rows) {
    if (row.session_id) foldVaInto(p.va_by_sid, String(row.session_id), row);
    if (row.visitor_id) foldVaInto(p.va_by_vid, String(row.visitor_id), row);
  }
}

function mergeVa(newer: VaAgg | undefined, older: VaAgg): VaAgg {
  if (!newer) return { ...older };
  return {
    lat: newer.lat ?? older.lat,
    lng: newer.lng ?? older.lng,
    country: newer.country || older.country,
    city: newer.city || older.city,
    internal: newer.internal || older.internal,
    utm_campaign: newer.utm_campaign || older.utm_campaign,
    order_value: Math.max(newer.order_value, older.order_value),
  };
}

function mergeSession(a: SessionPartial, b: SessionPartial): SessionPartial {
  // a = newer slice (its latest event initialised the row), b = older slice.
  const out = { ...a };
  if (b.first_seen_at < out.first_seen_at) out.first_seen_at = b.first_seen_at;
  if (b.last_seen_at > out.last_seen_at) out.last_seen_at = b.last_seen_at;
  if (b.landing_page && (!out.landing_page || !out.landing_page_at || (b.landing_page_at ?? "") < out.landing_page_at)) {
    out.landing_page = b.landing_page;
    out.landing_page_at = b.landing_page_at;
  }
  out.page_views += b.page_views;
  out.has_product_view ||= b.has_product_view;
  out.has_add_to_cart ||= b.has_add_to_cart;
  out.has_view_cart ||= b.has_view_cart;
  out.has_checkout ||= b.has_checkout;
  out.has_purchase ||= b.has_purchase;
  if (!out.visitor_id && b.visitor_id) out.visitor_id = b.visitor_id;
  if (!out.country && b.country) out.country = b.country;
  if (!out.city && b.city) out.city = b.city;
  if (!out.utm_content && b.utm_content) out.utm_content = b.utm_content;
  return out;
}

/** Merge slice partials. `partials` MUST be ordered newest slice first. */
export function mergePartials(partials: IngestPartial[]): IngestPartial {
  if (partials.length === 0) throw new Error("mergePartials: no partials");
  const out = emptyPartial(partials[partials.length - 1].since, partials[0].until);
  out.atc = {};
  for (const p of partials) {
    out.raw_events += p.raw_events;
    if (out.sample_event == null && p.sample_event != null) out.sample_event = p.sample_event;
    for (const [sid, s] of Object.entries(p.sessions)) {
      const cur = out.sessions[sid];
      out.sessions[sid] = cur ? mergeSession(cur, s) : { ...s };
    }
    for (const v of p.pv_sessionless) out.pv_sessionless.push(v);
    for (const [k, st] of Object.entries(p.v2)) {
      const cur = out.v2[k];
      if (!cur) { out.v2[k] = { ...st }; continue; }
      cur.h = minIdx(cur.h, st.h);
      cur.s = minIdx(cur.s, st.s);
      cur.soft ||= st.soft;
    }
    for (const [k, a] of Object.entries(p.va_by_sid)) out.va_by_sid[k] = mergeVa(out.va_by_sid[k], a);
    for (const [k, a] of Object.entries(p.va_by_vid)) out.va_by_vid[k] = mergeVa(out.va_by_vid[k], a);
    if (p.atc == null) out.atc = null;
    else if (out.atc) Object.assign(out.atc, p.atc);
    for (const t of p.truncated) if (!out.truncated.includes(t)) out.truncated.push(t);
  }
  return out;
}

function applyVaAgg(s: SessionPartial, a: VaAgg) {
  if (s.latitude == null && a.lat != null) s.latitude = a.lat;
  if (s.longitude == null && a.lng != null) s.longitude = a.lng;
  if (!s.country && a.country) s.country = a.country;
  if (!s.city && a.city) s.city = a.city;
  if (a.internal) s.va_is_internal = true;
  if (!s.utm_campaign && a.utm_campaign) s.utm_campaign = a.utm_campaign;
  if (a.order_value > s.order_value) s.order_value = a.order_value;
}

/**
 * Build the enriched per-session map: visitor_activity by session_id first,
 * then by visitor_id for sessions still missing lat or lng.
 */
export function enrichedSessions(p: IngestPartial): Map<string, SessionPartial> {
  const m = new Map<string, SessionPartial>();
  for (const [sid, s0] of Object.entries(p.sessions)) {
    const s = { ...s0 };
    const a = p.va_by_sid[sid];
    if (a) applyVaAgg(s, a);
    m.set(sid, s);
  }
  for (const s of m.values()) {
    if (s.latitude != null && s.longitude != null) continue;
    if (!s.visitor_id) continue;
    const a = p.va_by_vid[s.visitor_id];
    if (a) applyVaAgg(s, a);
  }
  return m;
}

/** Raw (ungated) distinct product-view keys — the funnel's PRODUCT_VIEW stage. */
export function productViewKeyCount(p: IngestPartial): number {
  const keys = new Set<string>();
  for (const s of Object.values(p.sessions)) if (s.has_product_view) keys.add(s.session_id);
  for (const v of p.pv_sessionless) keys.add(v);
  return keys.size;
}

/** Rebuild the v2 BucketAggregate (identical to aggregateBuckets over the raw rows). */
export function bucketAggregateFromPartial(p: IngestPartial, atc: Record<string, string>): BucketAggregate {
  const agg = emptyAggregate();
  agg.raw_events = p.raw_events;
  for (const [key, st] of Object.entries(p.v2)) {
    let soft: number | null = null;
    if (st.soft) {
      const t = atc[key];
      soft = t ? V2_PRECEDENCE.indexOf(classifyRow({ atc_traffic_type: t }, "")) : st.s;
    }
    const idx = minIdx(st.h, soft);
    if (idx == null) continue;
    const b = V2_PRECEDENCE[idx];
    agg.sessions[b].add(key);
    agg.visitors[b].add(st.v || key);
  }
  return agg;
}

/**
 * Split [sinceMs, untilMs] into `n` contiguous slices, NEWEST FIRST. Slices
 * are half-open [since, until) except the newest, which is closed at `until`
 * so every row lands in exactly one slice.
 */
export function sliceWindow(sinceMs: number, untilMs: number, n: number): Array<{ since: string; until: string; closed: boolean }> {
  const count = Math.max(1, Math.floor(n));
  const span = (untilMs - sinceMs) / count;
  const out: Array<{ since: string; until: string; closed: boolean }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const s = sinceMs + Math.round(span * i);
    const u = i === count - 1 ? untilMs : sinceMs + Math.round(span * (i + 1));
    out.push({ since: new Date(s).toISOString(), until: new Date(u).toISOString(), closed: i === count - 1 });
  }
  return out;
}

/** Windows at or above this size are built from slices in separate invocations. */
export const CHUNKED_MIN_HOURS = 720;
/** One slice per ~5 days: each slice is cheaper than the 7d window that already fits. */
export function sliceCountFor(hours: number): number {
  return Math.max(1, Math.ceil(hours / 120));
}
