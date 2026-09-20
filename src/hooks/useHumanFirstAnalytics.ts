// useHumanFirstAnalytics — mode-aware reader over the canonical truth envelope.
//
// PERFORMANCE CONTRACT: this hook adds ZERO database work. It reuses
// `useAnalyticsTruth` with the same (hours, geo) React-Query key that the rest
// of the dashboard already uses, so no extra edge invocation, no extra
// canonical scan, no additional polling. All human/bot logic is pure
// client-side reporting over sessions already in memory.

import { useMemo, useState } from "react";
import { useAnalyticsTruth, type TruthResponse, type TruthSession } from "./useAnalyticsTruth";
import {
  buildHumanFirstView,
  DEFAULT_TRAFFIC_MODE,
  type HumanFirstSession,
  type HumanFirstView,
  type TrafficMode,
} from "@/lib/humanFirstAnalytics";

const STORAGE_KEY = "gp_traffic_mode_v1";

function readStoredMode(): TrafficMode {
  if (typeof window === "undefined") return DEFAULT_TRAFFIC_MODE;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "human" || v === "expanded" || v === "raw" ? v : DEFAULT_TRAFFIC_MODE;
  } catch {
    return DEFAULT_TRAFFIC_MODE;
  }
}

/** Persisted segmented-control state. Default is always strict Human. */
export function useTrafficMode(): [TrafficMode, (m: TrafficMode) => void] {
  const [mode, setModeState] = useState<TrafficMode>(readStoredMode);
  const setMode = (m: TrafficMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch { /* private mode — persistence is optional */ }
  };
  return [mode, setMode];
}

export function toHumanFirstSessions(sessions: TruthSession[]): HumanFirstSession[] {
  return sessions.map((s) => ({
    session_id: s.session_id,
    visitor_id: s.visitor_id,
    first_seen_at: s.first_seen_at,
    last_seen_at: s.last_seen_at,
    country: s.country,
    city: s.city,
    device: s.device,
    referrer: s.referrer,
    source: s.source,
    utm_source: s.utm_source,
    utm_medium: s.utm_medium,
    utm_campaign: s.utm_campaign,
    utm_content: s.utm_content ?? null,
    landing_page: s.landing_page ?? s.page_path,
    page_path: s.page_path,
    page_views: s.page_views,
    interaction_count: s.interaction_count ?? null,
    session_duration_seconds: s.effective_duration_seconds ?? s.reported_duration_seconds ?? null,
    has_product_view: s.has_product_view,
    has_add_to_cart: s.has_add_to_cart,
    has_view_cart: s.has_view_cart,
    has_checkout: s.has_checkout,
    has_purchase: s.has_purchase,
    order_value: s.order_value,
    is_internal: s.is_internal,
    classification_reason: s.classification_reason ?? null,
  }));
}

export interface UseHumanFirstAnalyticsOptions {
  hours?: number;
  geo?: "US" | "all";
  mode: TrafficMode;
  enabled?: boolean;
}

export interface HumanFirstResult {
  view: HumanFirstView;
  truth: ReturnType<typeof useAnalyticsTruth>;
  /** Raw envelope totals — diagnostic reference, never mixed into KPIs. */
  envelopeTotals: TruthResponse["totals"] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useHumanFirstAnalytics(opts: UseHumanFirstAnalyticsOptions): HumanFirstResult {
  const truth = useAnalyticsTruth({
    hours: opts.hours ?? 24,
    geo: opts.geo ?? "all",
    enabled: opts.enabled ?? true,
  });

  const sessions = truth.data?.sessions;
  const view = useMemo(
    () => buildHumanFirstView(toHumanFirstSessions(sessions ?? []), opts.mode),
    [sessions, opts.mode],
  );

  return {
    view,
    truth,
    envelopeTotals: truth.data?.totals,
    isLoading: truth.isLoading,
    error: (truth.error as Error) ?? null,
  };
}
