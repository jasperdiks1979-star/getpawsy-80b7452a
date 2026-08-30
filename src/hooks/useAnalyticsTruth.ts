// useAnalyticsTruth — the ONE analytics reader.
//
// Wraps the `analytics-canonical` edge function and exposes the full truth
// envelope: totals, per-session detail, per-country breakdown, per-source
// classification. Every counter-producing surface (World Map counters,
// cart/checkout badges, CSV export, Summary export, Clean Analytics Panel)
// MUST consume this hook — nothing else may re-query `visitor_activity` or
// `canonical_events` for those metrics.
//
// Certification: enforced by `src/test/analytics-truth-parity.test.ts` —
// any drift between UI counters, CSV totals, and Summary totals for the
// same (hours, geo, filters) fails CI.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TruthSession {
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
  utm_content?: string | null;
  referrer: string | null;
  page_path: string | null;
  /** First-touch full landing URL incl. query string (paid click evidence). */
  landing_page?: string | null;
  has_product_view: boolean;
  has_add_to_cart: boolean;
  has_view_cart: boolean;
  has_checkout: boolean;
  has_purchase: boolean;
  order_value: number;
  is_internal: boolean;
}

export interface TruthTotals {
  visitors: number;
  sessions: number;
  page_views: number;
  product_views: number;
  add_to_cart: number;
  view_cart: number;
  checkout_started: number;
  purchases: number;
  revenue: number;
  currency: string;
  conversion_rate: number;
  human_visitors?: number;
  raw_sessions_all?: number;
}

export interface TrafficQualityBreakdown {
  raw_sessions: number;
  commercial_sessions: number;
  excluded_internal: number;
  excluded_bot: number;
  excluded_technical: number;
  excluded_commercial_flag: number;
  excluded_low_quality: number;
  unknown_country: number;
}

export interface TruthResponse {
  ok: boolean;
  window: { hours: number; since: string; until: string };
  filter: { geo: "US" | "all"; clean: boolean; source: string };
  totals: TruthTotals;
  funnel: Array<{ stage: string; count: number }>;
  countries: Array<{
    country: string;
    visitors: number;
    sessions: number;
    page_views: number;
    add_to_cart: number;
    checkout_started: number;
    purchases: number;
  }>;
  sources: Array<{ source: string; sessions: number }>;
  sessions: TruthSession[];
  sample_event: unknown;
  generated_at: string;
  cached?: boolean;
  error?: string;
  traffic_quality_breakdown?: TrafficQualityBreakdown;
  /** Precomputed-cache metadata (see `analytics-canonical` cache layer). */
  cache_status?: "hit" | "miss" | "stale";
  cache_generated_at?: string | null;
  cache_age_seconds?: number | null;
  cache_stale?: boolean;
  cache_max_lag_seconds?: number;
}

export interface UseAnalyticsTruthOptions {
  hours?: number;
  geo?: "US" | "all";
  refetchIntervalMs?: number;
  enabled?: boolean;
}

/** Hard cap on attempts per query instance (initial + bounded retries). */
export const ANALYTICS_TRUTH_MAX_ATTEMPTS = 3;
/** Per-attempt deadline; a cold window that exceeds this is retried, not awaited forever. */
export const ANALYTICS_TRUTH_ATTEMPT_TIMEOUT_MS = 45_000;

export class AnalyticsWarmingTimeoutError extends Error {
  constructor(ms: number) {
    super(`analytics-canonical did not respond within ${Math.round(ms / 1000)}s (cache still warming)`);
    this.name = "AnalyticsWarmingTimeoutError";
  }
}

async function withAttemptTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AnalyticsWarmingTimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}


/**
 * Sole entry point for canonical analytics. Returns totals + per-session
 * detail. Every derived number (counters, badges, CSV rows, Summary lines,
 * marker set) MUST be computed from this response — never from a parallel
 * table read.
 */
export function useAnalyticsTruth(opts: UseAnalyticsTruthOptions = {}) {
  const hours = opts.hours ?? 24;
  const geo = opts.geo ?? "all";
  // Large windows (>= 72h) are backed by a 5-minute server cache and cost
  // tens of seconds cold. Polling them every 60s only produces overlapping
  // in-flight requests and a permanently "loading" UI on mobile, so align
  // the client poll with the server cache TTL.
  // Align the client poll with the server-side warmer cadence per window
  // (hot 5 min, 14d 10 min, 30d 15 min, 90d 30 min). Polling faster than the
  // data can change only produces overlapping in-flight requests.
  const defaultInterval =
    hours >= 2160 ? 1_800_000 :
    hours >= 720 ? 900_000 :
    hours >= 336 ? 600_000 :
    hours >= 72 ? 300_000 : 60_000;
  return useQuery<TruthResponse>({
    queryKey: ["analytics-truth", hours, geo],
    enabled: opts.enabled ?? true,
    staleTime: hours >= 72 ? Math.min(defaultInterval, 900_000) : 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: opts.refetchIntervalMs ?? defaultInterval,
    // Bounded retries: a cold cache legitimately needs a second attempt, but a
    // panel must never sit in the "warming" state forever. After
    // ANALYTICS_TRUTH_MAX_ATTEMPTS attempts the query fails and the UI shows an
    // explicit "Still warming — Retry now" surface instead of a spinner.
    retry: ANALYTICS_TRUTH_MAX_ATTEMPTS - 1,
    retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 8_000),
    queryFn: async () => {
      const { data, error } = await withAttemptTimeout(
        supabase.functions.invoke("analytics-canonical", {
          body: { hours, geo },
        }),
        ANALYTICS_TRUTH_ATTEMPT_TIMEOUT_MS,
      );
      if (error) throw new Error(error.message || "analytics-canonical failed");
      if (!data?.ok) throw new Error(data?.error || "analytics-canonical not ok");
      // Backward-compat: older cached responses may lack `sessions[]`. Coerce
      // to an empty array so consumers don't crash while the cache warms.
      if (!Array.isArray(data.sessions)) data.sessions = [];
      return data as TruthResponse;
    },
  });
}


// -------------------------------------------------------------------------
// Client-side derived aggregates. Every dashboard that filters the truth
// response (e.g. by activity type, source) MUST use these helpers so the
// numbers reported everywhere reconcile. Applying a filter on `sessions[]`
// and then serializing it is guaranteed to match Map counters == CSV totals
// == Summary totals for the same filter set.
// -------------------------------------------------------------------------

export interface DerivedCounters {
  visitors: number;
  sessions: number;
  page_views: number;
  add_to_cart: number;
  view_cart: number;
  checkout_started: number;
  purchases: number;
  revenue: number;
}

/** Deterministic aggregation over a filtered session list. */
export function countersFromSessions(rows: TruthSession[]): DerivedCounters {
  const visitors = new Set<string>();
  let page_views = 0;
  let atc = 0, viewCart = 0, checkout = 0, purchase = 0;
  let revenue = 0;
  for (const s of rows) {
    visitors.add(s.visitor_id || s.session_id);
    page_views += s.page_views;
    if (s.has_add_to_cart) atc++;
    if (s.has_view_cart) viewCart++;
    if (s.has_checkout) checkout++;
    if (s.has_purchase) purchase++;
    revenue += s.order_value;
  }
  return {
    visitors: visitors.size,
    sessions: rows.length,
    page_views,
    add_to_cart: atc,
    view_cart: viewCart,
    checkout_started: checkout,
    purchases: purchase,
    revenue: Number(revenue.toFixed(2)),
  };
}