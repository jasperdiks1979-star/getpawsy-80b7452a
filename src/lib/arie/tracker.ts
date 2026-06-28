/**
 * ARIE funnel tracker — thin client that posts every stage transition
 * to the arie-funnel-ingest edge function. Fire-and-forget, never throws.
 */
import { supabase } from "@/integrations/supabase/client";

export type ArieStage =
  | "pin_impression"
  | "pin_click"
  | "landing"
  | "product_view"
  | "gallery_interact"
  | "variant_select"
  | "scroll_depth"
  | "video_interact"
  | "add_to_cart"
  | "cart_view"
  | "coupon_use"
  | "shipping_calc"
  | "checkout_start"
  | "contact_info"
  | "shipping_method"
  | "payment_method"
  | "payment_attempt"
  | "payment_success"
  | "order_created"
  | "purchase"
  | "upsell"
  | "repeat_purchase";

const SESSION_KEY = "arie.sid";
const VISITOR_KEY = "arie.vid";

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function getSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = uid();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return uid();
  }
}

function getVisitorId(): string {
  try {
    let vid = localStorage.getItem(VISITOR_KEY);
    if (!vid) {
      vid = uid();
      localStorage.setItem(VISITOR_KEY, vid);
    }
    return vid;
  } catch {
    return uid();
  }
}

function deviceClass(): string {
  if (typeof window === "undefined") return "unknown";
  const w = window.innerWidth || 0;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function utmFromUrl(): Record<string, string | null> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return {
    source: p.get("utm_source"),
    campaign: p.get("utm_campaign"),
    creative_id: p.get("utm_content") || p.get("creative_id"),
    pin_id: p.get("epik") || p.get("pin_id"),
    tiktok_video_id: p.get("ttclid") || p.get("video_id"),
  };
}

export type ArieEventInput = {
  stage: ArieStage;
  product_id?: string | null;
  value_cents?: number | null;
  currency?: string | null;
  meta?: Record<string, unknown>;
};

export async function trackArie(input: ArieEventInput): Promise<void> {
  try {
    const utm = utmFromUrl();
    const payload = {
      event_id: uid(),
      session_id: getSessionId(),
      visitor_id: getVisitorId(),
      stage: input.stage,
      product_id: input.product_id ?? null,
      source: utm.source,
      campaign: utm.campaign,
      creative_id: utm.creative_id,
      pin_id: utm.pin_id,
      tiktok_video_id: utm.tiktok_video_id,
      device: deviceClass(),
      country: null,
      value_cents: input.value_cents ?? null,
      currency: input.currency ?? "USD",
      meta: input.meta ?? {},
      ts: new Date().toISOString(),
    };
    await supabase.functions.invoke("arie-funnel-ingest", { body: payload });
  } catch {
    /* swallow — tracker must never break UX */
  }
}