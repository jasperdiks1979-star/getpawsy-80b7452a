/**
 * Pinterest tracker — captures UTM/referrer once per session, then mirrors
 * funnel events (page_view, add_to_cart, begin_checkout, purchase) into
 * `pinterest_funnel_events` so the Pinterest admin dashboards have data.
 *
 * All calls are fire-and-forget and MUST NEVER throw — analytics breaks
 * silently, never the UI.
 */

const SESSION_KEY = "gp_session_id";
const BOOT_FLAG = "gp_pin_session_booted";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

import { getBotClassification } from "@/lib/botDetection";

/**
 * Returns true when this session matches the Pinterest iOS in-app
 * prefetcher fingerprint (see src/lib/botDetection.ts). Used to suppress
 * outbound-click counting so prefetch hits never inflate
 * `pinterest_pin_performance.clicks`.
 */
function isPrefetchSession(): boolean {
  try {
    // Avoid circular import by reading sessionStorage directly — the cache
    // is written by botDetection.getBotClassification() on first call.
    const raw = sessionStorage.getItem("gp_bot_classification_v1");
    if (!raw) return false;
    const c = JSON.parse(raw) as { bot_reason?: string | null };
    return !!c.bot_reason && /pinterest_ios_prefetch/.test(c.bot_reason);
  } catch {
    return false;
  }
}

function getSessionKey(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `anon_${Date.now()}`;
  }
}

function post(body: Record<string, unknown>): void {
  if (!SUPABASE_URL || !SUPABASE_ANON) return;
  try {
    fetch(`${SUPABASE_URL}/functions/v1/pinterest-track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON}`,
        apikey: SUPABASE_ANON,
      },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function bootstrapPinterestSession(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(BOOT_FLAG)) return;
    sessionStorage.setItem(BOOT_FLAG, "1");
    // Prime the bot classification cache so the page_view event below carries
    // a reliable is_prefetch flag on the very first hit of the session.
    try { getBotClassification(); } catch { /* ignore */ }
    const u = new URL(window.location.href);
    const q = u.searchParams;
    post({
      kind: "session",
      sessionKey: getSessionKey(),
      utm_source: q.get("utm_source"),
      utm_medium: q.get("utm_medium"),
      utm_campaign: q.get("utm_campaign"),
      utm_term: q.get("utm_term"),
      utm_content: q.get("utm_content"),
      utm_id: q.get("utm_id"),
      pin_id: q.get("pin_id") ?? q.get("pinId"),
      pin_mode: q.get("pin_mode"),
      landing_slug: u.pathname.replace(/^\/products\//, ""),
      niche_key: q.get("niche"),
      hook_category: q.get("hook"),
      referrer: document.referrer || null,
      landing_page: u.pathname + u.search,
    });
    // Always fire a page_view event for Pinterest sessions (no-op if not).
    trackPinterestEvent("page_view", { product_slug: u.pathname.replace(/^\/products\//, "") || null });
  } catch {
    /* ignore */
  }
}

export function trackPinterestEvent(
  event_name: "page_view" | "product_view" | "add_to_cart" | "begin_checkout" | "purchase",
  data: {
    product_slug?: string | null;
    product_id?: string | null;
    value?: number | null;
    currency?: string | null;
    pin_id?: string | null;
  } = {}
): void {
  if (typeof window === "undefined") return;
  post({
    kind: "event",
    sessionKey: getSessionKey(),
    event_name,
    product_slug: data.product_slug ?? null,
    product_id: data.product_id ?? null,
    value: data.value ?? null,
    currency: data.currency ?? null,
    pin_id: data.pin_id ?? null,
    // Suppresses pin-click increment when the session is a Pinterest iOS
    // prefetch — keeps pinterest_pin_performance.clicks honest.
    is_prefetch: isPrefetchSession(),
  });
}