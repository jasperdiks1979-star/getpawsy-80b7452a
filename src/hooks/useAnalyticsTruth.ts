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
  referrer: string | null;
  page_path: string | null;
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
}

export interface UseAnalyticsTruthOptions {
  hours?: number;
  geo?: "US" | "all";
  refetchIntervalMs?: number;
  enabled?: boolean;
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
  return useQuery<TruthResponse>({
    queryKey: ["analytics-truth", hours, geo],
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
    refetchInterval: opts.refetchIntervalMs ?? 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("analytics-canonical", {
        body: { hours, geo },
      });
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