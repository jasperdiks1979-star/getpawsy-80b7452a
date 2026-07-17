/**
 * Thin client wrapper to record a funnel step into analytics_funnel_waterfall
 * via the analytics-funnel-ingest edge function. Non-blocking, never throws.
 */
import { getCanonicalSessionId } from "@/lib/canonicalSession";
import { isTechnicalPath } from "@/lib/technicalRoutes";
const SESSION_KEY = "gp_session_id";
const PROJECT = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;

export type FunnelStep =
  | "click" | "redirect" | "landing" | "engagement_start" | "page_view"
  | "scroll" | "view_item" | "add_to_cart" | "view_cart" | "remove_from_cart"
  | "begin_checkout" | "payment" | "purchase";

/**
 * Lazy-initialize a session_id so funnel steps fired BEFORE the engagement
 * gate runs (e.g. fast add-to-cart from a Pinterest landing) still land in
 * analytics_funnel_waterfall. Without this, the waterfall reports 0 rows
 * for real customers and every downstream decision (FOS, SHIL, AI CEO) is
 * blind. Evidence: 7d funnel had 0 add_to_cart despite 14 real orders.
 */
function ensureSessionId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return getCanonicalSessionId();
  } catch { return null; }
}

export function recordFunnelStep(step: FunnelStep, extra?: Record<string, unknown>): void {
  try {
    if (typeof window === "undefined" || !PROJECT) return;
    try { if (isTechnicalPath(location.pathname)) return; } catch { /* ignore */ }
    const session_id = ensureSessionId();
    if (!session_id) return;
    const body = JSON.stringify({
      session_id, step,
      visitor_id: localStorage.getItem("gp_visitor_id"),
      landing_page: location.pathname + location.search,
      ...extra,
    });
    const url = `https://${PROJECT}.supabase.co/functions/v1/analytics-funnel-ingest`;
    const SAFE_TYPE = "text/plain;charset=UTF-8";
    try {
      if (navigator.sendBeacon) {
        const ok = navigator.sendBeacon(url, new Blob([body], { type: SAFE_TYPE }));
        if (ok) return;
      }
    } catch {}
    void fetch(url, { method: "POST", headers: { "Content-Type": SAFE_TYPE }, body, keepalive: true }).catch(() => {});
  } catch { /* swallow */ }
}