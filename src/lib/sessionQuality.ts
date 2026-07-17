/**
 * Lightweight session-quality collector.
 * Aggregates signals client-side; flushes every 15s and on visibility:hidden.
 * Non-blocking; uses sendBeacon when available.
 */
import { getCanonicalSessionId } from "@/lib/canonicalSession";
const SESSION_KEY = "gp_session_id";
const PROJECT = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
const RETURN_KEY = "gp_returning_visitor_v1";

const state = {
  start: Date.now(),
  visibleStart: Date.now(),
  visibleMs: 0,
  maxScroll: 0,
  mouse: 0,
  touch: 0,
  product: 0,
  cart: 0,
  checkout: 0,
  pages: 1,
};

let installed = false;
function getSessionId(): string {
  try { return getCanonicalSessionId(); } catch { return ""; }
}

function flush() {
  const session_id = getSessionId();
  if (!session_id || !PROJECT) return;
  const now = Date.now();
  if (document.visibilityState === "visible") {
    state.visibleMs += now - state.visibleStart;
    state.visibleStart = now;
  }
  const total = now - state.start;
  const body = JSON.stringify({
    session_id,
    visitor_id: localStorage.getItem("gp_visitor_id"),
    time_on_page_ms: total,
    max_scroll_pct: state.maxScroll,
    mouse_events: state.mouse,
    touch_events: state.touch,
    product_interactions: state.product,
    cart_interactions: state.cart,
    checkout_interactions: state.checkout,
    visible_ratio: total > 0 ? Math.min(1, state.visibleMs / total) : 0,
    page_count: state.pages,
    return_visit: localStorage.getItem(RETURN_KEY) === "1",
    signals: {},
  });
  const url = `https://${PROJECT}.supabase.co/functions/v1/analytics-session-quality`;
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {}
  try { void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }); } catch {}
}

export function installSessionQuality(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  try {
    if (localStorage.getItem(RETURN_KEY) === "1") {/* keep */} else {
      localStorage.setItem(RETURN_KEY, "pending");
      setTimeout(() => { try { localStorage.setItem(RETURN_KEY, "1"); } catch {} }, 30000);
    }

    const onScroll = () => {
      const h = document.documentElement;
      const pct = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / Math.max(1, h.scrollHeight)) * 100));
      if (pct > state.maxScroll) state.maxScroll = pct;
    };
    const onMouse = () => { state.mouse++; };
    const onTouch = () => { state.touch++; };
    const onVis = () => {
      const now = Date.now();
      if (document.visibilityState === "visible") state.visibleStart = now;
      else { state.visibleMs += now - state.visibleStart; flush(); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    setInterval(flush, 15000);
  } catch { /* never throw */ }
}

export const sessionQualitySignals = {
  product: () => { state.product++; },
  cart:    () => { state.cart++; },
  checkout:() => { state.checkout++; },
  page:    () => { state.pages++; },
};