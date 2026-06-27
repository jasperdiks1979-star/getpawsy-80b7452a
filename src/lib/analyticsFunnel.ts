/**
 * Thin client wrapper to record a funnel step into analytics_funnel_waterfall
 * via the analytics-funnel-ingest edge function. Non-blocking, never throws.
 */
const SESSION_KEY = "gp_session_id";
const PROJECT = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;

export type FunnelStep =
  | "click" | "redirect" | "landing" | "engagement_start" | "page_view"
  | "scroll" | "view_item" | "add_to_cart" | "begin_checkout" | "payment" | "purchase";

export function recordFunnelStep(step: FunnelStep, extra?: Record<string, unknown>): void {
  try {
    if (typeof window === "undefined" || !PROJECT) return;
    const session_id = sessionStorage.getItem(SESSION_KEY);
    if (!session_id) return;
    const body = JSON.stringify({
      session_id, step,
      visitor_id: localStorage.getItem("gp_visitor_id"),
      landing_page: location.pathname + location.search,
      ...extra,
    });
    const url = `https://${PROJECT}.supabase.co/functions/v1/analytics-funnel-ingest`;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        return;
      }
    } catch {}
    void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* swallow */ }
}