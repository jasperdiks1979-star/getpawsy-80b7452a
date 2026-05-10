/**
 * Pinterest Conversion Intelligence (Phase 6)
 *
 * Lightweight client-side helpers to:
 *  - Persist a per-visitor attribution session (cookie-keyed)
 *  - Emit Pinterest-specific custom analytics events to Clarity & GA4
 *  - Forward purchase / ATC events into the `pinterest_capi_outbox` table
 *    so the server-side relay can ship them to the Pinterest Conversion API
 *
 * Only fires when the URL carries `utm_source=pinterest` or a `pin_id`.
 * Anonymous, no PII. Email/phone hashing is left to the relay.
 */
import { supabase } from "@/integrations/supabase/client";

const SESSION_COOKIE = "gp_pin_sess";
const SESSION_TTL_DAYS = 30;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

function writeCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 24 * 3600 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function ensureSessionKey(): string {
  let key = readCookie(SESSION_COOKIE);
  if (!key) {
    key =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    writeCookie(SESSION_COOKIE, key, SESSION_TTL_DAYS);
  }
  return key;
}

function isPinterestVisit(params: URLSearchParams): boolean {
  return (
    params.get("utm_source")?.toLowerCase() === "pinterest" ||
    !!params.get("pin_id") ||
    !!params.get("pin_mode")
  );
}

export interface AttributionContext {
  pin_id?: string | null;
  pin_mode?: string | null;
  landing_slug?: string | null;
  niche_key?: string | null;
  hook_category?: string | null;
}

/**
 * Records (or refreshes) the current Pinterest attribution session and tags
 * Clarity with funnel-step custom events. No-op for non-Pinterest visits.
 */
export async function recordPinterestAttribution(
  ctx: AttributionContext = {},
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (!isPinterestVisit(params)) return null;

  const session_key = ensureSessionKey();
  const row = {
    session_key,
    pin_id: ctx.pin_id ?? params.get("pin_id"),
    pin_mode: ctx.pin_mode ?? params.get("pin_mode"),
    landing_slug: ctx.landing_slug ?? null,
    niche_key: ctx.niche_key ?? null,
    hook_category: ctx.hook_category ?? params.get("intent"),
    utm_source: params.get("utm_source"),
    utm_campaign: params.get("utm_campaign"),
    utm_content: params.get("utm_content"),
    last_seen: new Date().toISOString(),
  };

  try {
    // Upsert by session_key — anonymous insert + update both allowed.
    const { error } = await supabase
      .from("pinterest_attribution_sessions")
      .upsert(row, { onConflict: "session_key" });
    if (error) console.warn("[pin-attr] upsert failed", error.message);
  } catch (e) {
    console.warn("[pin-attr] insert error", (e as Error).message);
  }

  emitClarityEvent("pinterest_quality_visit", {
    pin_mode: row.pin_mode ?? "unknown",
    landing_slug: row.landing_slug ?? "unknown",
  });

  return session_key;
}

/** Send a custom event to Microsoft Clarity + GA4 (best-effort, never throws). */
export function emitClarityEvent(
  name: string,
  tags: Record<string, string | number | undefined> = {},
) {
  try {
    const w = window as unknown as {
      clarity?: (cmd: string, ...args: unknown[]) => void;
      gtag?: (cmd: string, name: string, params: Record<string, unknown>) => void;
    };
    w.clarity?.("event", name);
    for (const [k, v] of Object.entries(tags)) {
      if (v !== undefined && v !== null) w.clarity?.("set", k, String(v));
    }
    w.gtag?.("event", name, tags as Record<string, unknown>);
  } catch {
    /* noop */
  }
}

/**
 * Stage a Pinterest CAPI event (server-side) for the relay drainer to ship.
 * Safe to call on any visit — only enqueues when the visitor has a Pinterest
 * attribution session (i.e. came from a pin).
 */
export async function enqueueCapiEvent(
  event_name: "view_content" | "add_to_cart" | "checkout" | "purchase",
  payload: {
    product_id?: string | null;
    value?: number | null;
    currency?: string | null;
    custom_data?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    const session = readCookie(SESSION_COOKIE);
    if (!session) return; // not a tracked Pinterest visit

    const event_id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${event_name}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const { error } = await supabase.from("pinterest_capi_outbox").insert({
      event_name,
      event_id,
      product_id: payload.product_id ?? null,
      value: payload.value ?? null,
      currency: payload.currency ?? "USD",
      user_data: { client_session: session },
      custom_data: payload.custom_data ?? null,
    });
    if (error) console.warn("[pin-capi] enqueue failed", error.message);
  } catch (e) {
    console.warn("[pin-capi] enqueue error", (e as Error).message);
  }
}
