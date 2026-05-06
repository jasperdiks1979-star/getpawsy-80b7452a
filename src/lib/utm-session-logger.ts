import { supabase } from "@/integrations/supabase/client";
import { cleanUtmSource, cleanUtmMedium, cleanUtmFreeform, cleanReferrer, cleanString, isBotUserAgent } from "@/lib/eventSanitizer";

const LOG_SENTINEL_KEY = "gp_utm_logged";

function getSessionId(): string | null {
  try {
    let sid = sessionStorage.getItem("visitor_session_id");
    if (!sid) {
      sid = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      sessionStorage.setItem("visitor_session_id", sid);
    }
    return sid;
  } catch {
    return null;
  }
}

function getVisitorId(): string | null {
  try {
    return localStorage.getItem("visitor_id") || sessionStorage.getItem("visitor_id");
  } catch {
    return null;
  }
}

function isInternalTraffic(): boolean {
  try {
    return localStorage.getItem("founder_mode") === "true" || localStorage.getItem("gp_internal") === "true";
  } catch {
    return false;
  }
}

/**
 * Log the first UTM-set per session to utm_session_log.
 * Idempotent: uses a sessionStorage sentinel + DB-level ON CONFLICT DO NOTHING.
 * Safe to call on every page load.
 */
export async function logUtmSession(): Promise<void> {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && isBotUserAgent(navigator.userAgent)) return;

  const sid = getSessionId();
  if (!sid) return;

  // Already logged this session in this tab — skip the DB roundtrip.
  try {
    if (sessionStorage.getItem(LOG_SENTINEL_KEY) === sid) return;
  } catch {
    // ignore storage errors and proceed
  }

  const params = new URLSearchParams(window.location.search);
  const get = (k: string) => {
    const v = params.get(k);
    return v && v.trim() ? v.trim().slice(0, 255) : null;
  };

  // Strict sanitization — anything malformed becomes null. We still log
  // the row so the session is tracked, but spam values are removed.
  const payload = {
    p_session_id: sid,
    p_visitor_id: getVisitorId(),
    p_utm_source: cleanUtmSource(get("utm_source")),
    p_utm_medium: cleanUtmMedium(get("utm_medium")),
    p_utm_campaign: cleanUtmFreeform(get("utm_campaign")),
    p_utm_term: cleanUtmFreeform(get("utm_term")),
    p_utm_content: cleanUtmFreeform(get("utm_content")),
    p_utm_id: cleanUtmFreeform(get("utm_id")),
    p_gclid: cleanString(get("gclid"), 255),
    p_fbclid: cleanString(get("fbclid"), 255),
    p_ttclid: cleanString(get("ttclid"), 255),
    p_referrer: cleanReferrer((document.referrer || "").slice(0, 500) || null),
    p_landing_page: cleanString((window.location.pathname + window.location.search).slice(0, 500), 500),
    p_is_internal: isInternalTraffic(),
  };

  try {
    const { error } = await supabase.rpc("log_utm_session", payload);
    if (error) {
      console.warn("[utm-logger] log_utm_session error:", error.message);
      return;
    }
    try {
      sessionStorage.setItem(LOG_SENTINEL_KEY, sid);
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn("[utm-logger] failed:", e);
  }
}