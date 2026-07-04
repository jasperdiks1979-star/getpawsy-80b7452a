// liveVisitorTimeline — pure helpers for the Visitor World Map Pro live
// visitor drawer + timeline. Zero dependency on Supabase or React so the
// logic is fully unit-testable. Consumes raw `visitor_activity` rows for a
// single session_id and returns a compressed navigation timeline plus a
// derived operational profile (device, source, current page, etc.).
//
// This module NEVER touches business KPIs. It is presence-only and mirrors
// the isolation contract already enforced by `buildLivePresenceModel`.

export interface LiveVisitorActivityRow {
  id?: string | null;
  session_id: string;
  visitor_id?: string | null;
  activity_type?: string | null;
  page_path?: string | null;
  product_name?: string | null;
  product_id?: string | null;
  product_category?: string | null;
  order_id?: string | null;
  order_value?: number | null;
  country?: string | null;
  city?: string | null;
  device_type?: string | null;
  browser?: string | null;
  screen_width?: number | null;
  screen_height?: number | null;
  referrer?: string | null;
  referrer_category?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  is_bot_suspect?: boolean | null;
  bot_suspect_reason?: string | null;
  traffic_quality?: string | null;
  geo_confidence?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_internal?: boolean | null;
  created_at: string;
  last_seen_at?: string | null;
}

export interface LiveTimelineStep {
  timestamp: string;
  activity_type: string;
  label: string;
  page_path: string | null;
  product_name: string | null;
  order_id: string | null;
  order_value: number | null;
}

export interface LiveVisitorProfile {
  session_id: string;
  visitor_id: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  screen: string | null;
  landing_page: string | null;
  current_page: string | null;
  previous_page: string | null;
  current_product: string | null;
  current_category: string | null;
  traffic_source: string;
  campaign: string | null;
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    term: string | null;
    content: string | null;
  };
  referrer: string | null;
  first_seen_at: string;
  last_seen_at: string;
  heartbeat_age_seconds: number;
  session_duration_seconds: number;
  page_view_count: number;
  interaction_count: number;
  cart_status: "none" | "add_to_cart" | "view_cart";
  checkout_status: "none" | "begin_checkout";
  purchase_status: "none" | "purchased";
  current_revenue: number;
  bot_suspect: boolean;
  bot_reason: string | null;
  traffic_quality: string | null;
  geo_confidence: string | null;
}

function ts(row: LiveVisitorActivityRow): number {
  return new Date(row.last_seen_at || row.created_at).getTime();
}

function labelFor(row: LiveVisitorActivityRow): string {
  const t = (row.activity_type || "").toLowerCase();
  if (t === "purchase") return row.order_id ? `Purchase · ${row.order_id}` : "Purchase";
  if (t === "begin_checkout" || t === "checkout") return "Checkout";
  if (t === "add_to_cart") return row.product_name ? `Add to cart · ${row.product_name}` : "Add to cart";
  if (t === "view_cart") return "View cart";
  if (t === "product_view") return row.product_name ? `Product · ${row.product_name}` : "Product view";
  if (row.page_path) return row.page_path;
  return t || "activity";
}

/**
 * Compress a series of raw visitor_activity rows into a navigation timeline.
 * Sorted oldest → newest. Consecutive rows with the same activity_type and
 * page_path collapse into a single step (keeps the earliest timestamp).
 */
export function buildLiveTimeline(rows: LiveVisitorActivityRow[]): LiveTimelineStep[] {
  const sorted = [...rows].sort((a, b) => ts(a) - ts(b));
  const steps: LiveTimelineStep[] = [];
  for (const row of sorted) {
    const step: LiveTimelineStep = {
      timestamp: new Date(ts(row)).toISOString(),
      activity_type: (row.activity_type || "browsing").toLowerCase(),
      label: labelFor(row),
      page_path: row.page_path ?? null,
      product_name: row.product_name ?? null,
      order_id: row.order_id ?? null,
      order_value: typeof row.order_value === "number" ? row.order_value : null,
    };
    const prev = steps[steps.length - 1];
    if (
      prev &&
      prev.activity_type === step.activity_type &&
      prev.page_path === step.page_path &&
      prev.product_name === step.product_name
    ) {
      // collapse consecutive dupes
      continue;
    }
    steps.push(step);
  }
  return steps;
}

function classifyTraffic(row: LiveVisitorActivityRow | null): string {
  if (!row) return "direct";
  if (row.utm_source) return row.utm_source;
  if (row.referrer_category) return row.referrer_category;
  if (row.referrer) {
    try {
      return new URL(row.referrer).hostname;
    } catch {
      return "referrer";
    }
  }
  return "direct";
}

/**
 * Derive an operational profile for a single visitor from the row set.
 * `nowMs` is injectable for deterministic tests.
 */
export function buildLiveVisitorProfile(
  rows: LiveVisitorActivityRow[],
  nowMs: number = Date.now(),
): LiveVisitorProfile | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => ts(a) - ts(b));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const firstMs = ts(first);
  const latestMs = ts(latest);

  const pageRows = sorted.filter((r) => (r.activity_type || "").toLowerCase() === "browsing" || !!r.page_path);
  const distinctPages: string[] = [];
  for (const r of pageRows) {
    const p = r.page_path;
    if (p && distinctPages[distinctPages.length - 1] !== p) distinctPages.push(p);
  }

  const has = (t: string) => sorted.some((r) => (r.activity_type || "").toLowerCase() === t);
  const productRow = [...sorted].reverse().find((r) => !!r.product_name || !!r.product_id) ?? null;
  const purchaseRow = [...sorted].reverse().find((r) => (r.activity_type || "").toLowerCase() === "purchase");

  const width = latest.screen_width ?? null;
  const height = latest.screen_height ?? null;

  return {
    session_id: latest.session_id,
    visitor_id: latest.visitor_id ?? null,
    country: latest.country ?? null,
    city: latest.city ?? null,
    device: latest.device_type ?? null,
    browser: latest.browser ?? null,
    screen: width && height ? `${width}×${height}` : null,
    landing_page: first.page_path ?? null,
    current_page: latest.page_path ?? null,
    previous_page: distinctPages.length >= 2 ? distinctPages[distinctPages.length - 2] : null,
    current_product: productRow?.product_name ?? null,
    current_category: productRow?.product_category ?? null,
    traffic_source: classifyTraffic(first),
    campaign: first.utm_campaign ?? null,
    utm: {
      source: first.utm_source ?? null,
      medium: first.utm_medium ?? null,
      campaign: first.utm_campaign ?? null,
      term: first.utm_term ?? null,
      content: first.utm_content ?? null,
    },
    referrer: first.referrer ?? null,
    first_seen_at: new Date(firstMs).toISOString(),
    last_seen_at: new Date(latestMs).toISOString(),
    heartbeat_age_seconds: Math.max(0, Math.round((nowMs - latestMs) / 1000)),
    session_duration_seconds: Math.max(0, Math.round((latestMs - firstMs) / 1000)),
    page_view_count: distinctPages.length,
    interaction_count: sorted.length,
    cart_status: has("add_to_cart") ? "add_to_cart" : has("view_cart") ? "view_cart" : "none",
    checkout_status: has("begin_checkout") || has("checkout") ? "begin_checkout" : "none",
    purchase_status: purchaseRow ? "purchased" : "none",
    current_revenue: typeof purchaseRow?.order_value === "number" ? purchaseRow!.order_value! : 0,
    bot_suspect: !!latest.is_bot_suspect,
    bot_reason: latest.bot_suspect_reason ?? null,
    traffic_quality: latest.traffic_quality ?? null,
    geo_confidence: latest.geo_confidence ?? null,
  };
}

export interface LiveConnectionDiagnostics {
  transport: "websocket" | "polling" | "offline";
  websocketStatus: "connecting" | "open" | "closed" | "error" | "disabled";
  lastHeartbeatAt: string | null;
  lastHeartbeatAgeMs: number | null;
  droppedHeartbeats: number;
  reconnectAttempts: number;
  latencyMs: number | null;
  geoLookupFailures: number;
}

export function computeLatencyMs(sentAtMs: number, receivedAtMs: number): number {
  return Math.max(0, receivedAtMs - sentAtMs);
}

/**
 * A live heartbeat is considered "stale" (i.e. the visitor is no longer live)
 * when the most recent last_seen_at is older than 120 seconds — matches the
 * live-mode fetch window in VisitorWorldMap.
 */
export const LIVE_HEARTBEAT_TTL_SECONDS = 120;

export function isLiveHeartbeatFresh(lastSeenAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const ageSec = (nowMs - new Date(lastSeenAt).getTime()) / 1000;
  return ageSec >= 0 && ageSec <= LIVE_HEARTBEAT_TTL_SECONDS;
}