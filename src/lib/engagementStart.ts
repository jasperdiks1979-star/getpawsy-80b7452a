/**
 * Engagement Start — the TRUE start of a human visit.
 *
 * Fires once per session when ALL conditions hold:
 *   - DOMContentLoaded
 *   - document.visibilityState === "visible"
 *   - page active (visible) ≥ 2000 ms
 *   - not prerender / prefetch / bot
 *
 * Non-blocking. Never throws. Idempotent per session.
 */
import { classifyTraffic, detectDevice } from "@/lib/trafficClassifier";
import { resolveUtm } from "@/lib/utmNormalizer";
import { getCanonicalSessionId } from "@/lib/canonicalSession";

const STORAGE_KEY = "gp_engagement_started_v1";
const SESSION_KEY = "gp_session_id";
const PROJECT = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;

function getSessionId(): string {
  try { return getCanonicalSessionId(); } catch { return `anon_${Date.now()}`; }
}

async function postEngagementStart(payload: Record<string, unknown>) {
  if (!PROJECT) return;
  const url = `https://${PROJECT}.supabase.co/functions/v1/analytics-engagement-start`;
  const body = JSON.stringify(payload);
  const SAFE_TYPE = "text/plain;charset=UTF-8";
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: SAFE_TYPE });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    }
  } catch { /* fall through to fetch */ }
  try {
    await fetch(url, {
      method: "POST", headers: { "Content-Type": SAFE_TYPE },
      body, keepalive: true,
    });
  } catch { /* swallow */ }
}

export function armEngagementStart(): void {
  try {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;

    const cls = classifyTraffic();
    if (cls.type !== "human") {
      // Still report classification so dashboards see prefetch/bot rows
      void postEngagementStart({
        session_id: getSessionId(),
        user_agent: navigator.userAgent,
        is_prerendering: cls.type === "prerender",
        classification_hint: cls.type,
      });
      sessionStorage.setItem(STORAGE_KEY, "1");
      return;
    }

    let visibleMs = 0;
    let lastTick = Date.now();
    let fired = false;

    const tick = () => {
      if (fired) return;
      const now = Date.now();
      if (document.visibilityState === "visible") {
        visibleMs += now - lastTick;
      }
      lastTick = now;
      if (visibleMs >= 2000) {
        fired = true;
        sessionStorage.setItem(STORAGE_KEY, "1");
        const utm = (() => {
          try { return resolveUtm({ search: window.location.search }); } catch { return {} as any; }
        })();
        const dev = detectDevice();
        void postEngagementStart({
          session_id: getSessionId(),
          visitor_id: localStorage.getItem("gp_visitor_id"),
          utm_source: (utm as any).utm_source ?? null,
          utm_medium: (utm as any).utm_medium ?? null,
          utm_campaign: (utm as any).utm_campaign ?? null,
          utm_term: (utm as any).utm_term ?? null,
          utm_content: (utm as any).utm_content ?? null,
          ttclid: new URLSearchParams(location.search).get("ttclid"),
          fbclid: new URLSearchParams(location.search).get("fbclid"),
          gclid: new URLSearchParams(location.search).get("gclid"),
          landing_page: location.pathname + location.search,
          referrer: document.referrer || null,
          device: dev.device, browser: dev.browser, os: dev.os,
          user_agent: navigator.userAgent,
          was_hidden: false,
        });
        clearInterval(interval);
        document.removeEventListener("visibilitychange", onVis);
      }
    };

    const onVis = () => { lastTick = Date.now(); };
    document.addEventListener("visibilitychange", onVis);
    const interval = setInterval(tick, 500);
  } catch {
    /* never break UX */
  }
}