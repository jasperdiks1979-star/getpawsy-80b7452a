/**
 * Commercial Conversion Intelligence — thin, non-blocking client wrapper.
 * Fires sendBeacon to cci-ingest. Never throws, never blocks render.
 */
import { resolveUtm } from '@/lib/utmNormalizer';

const PROJECT = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
const SESSION_KEY = 'gp_session_id';
const VISITOR_KEY = 'gp_visitor_id';
const UTM_FIRST_KEY = 'gp_utm_first';
const LOCATION_KEY = 'visitor_location';

export type CciEvent =
  | 'page_view'
  | 'homepage_view' | 'collection_view' | 'product_card_click' | 'product_view'
  | 'product_image_view' | 'product_gallery_swipe' | 'product_price_visible'
  | 'shipping_info_visible' | 'returns_info_visible' | 'trust_badge_visible'
  | 'reviews_section_visible' | 'faq_section_visible' | 'sticky_atc_visible'
  | 'add_to_cart_click' | 'add_to_cart_success' | 'add_to_cart_error'
  | 'cart_open' | 'cart_quantity_change' | 'checkout_click' | 'checkout_loaded'
  | 'checkout_error' | 'checkout_abandoned' | 'payment_redirect_started' | 'payment_success'
  | 'purchase_confirmed'
  | 'geo_lookup_failed';

function ensureSessionId(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch { return null; }
}

/**
 * Ensure a stable visitor_id even if useVisitorTracking hasn't mounted yet
 * (CCI events fire on first paint from the router before the tracking hook
 * runs). Uses the same localStorage key as useVisitorTracking so the two
 * writers converge on the same UUID.
 */
function ensureVisitorId(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto?.randomUUID?.() ?? `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch { return null; }
}

/**
 * Resolve UTMs from URL > sessionStorage > referrer/in-app inference via the
 * canonical normalizer, so PDP/ATC/checkout events keep the Pinterest/TikTok
 * attribution even after the query string is stripped by internal navigation.
 */
function readUtm(): {
  source?: string; medium?: string; campaign?: string;
  term?: string; content?: string;
  first_source?: string; first_medium?: string; first_campaign?: string;
} {
  try {
    const r = resolveUtm();
    let first: { s?: string; m?: string; c?: string } = {};
    try {
      const cached = sessionStorage.getItem(UTM_FIRST_KEY);
      if (cached) first = JSON.parse(cached);
      else if (r.utm_source || r.utm_medium || r.utm_campaign) {
        first = { s: r.utm_source ?? undefined, m: r.utm_medium ?? undefined, c: r.utm_campaign ?? undefined };
        sessionStorage.setItem(UTM_FIRST_KEY, JSON.stringify(first));
      }
    } catch { /* ignore */ }
    return {
      source: r.utm_source ?? undefined,
      medium: r.utm_medium ?? undefined,
      campaign: r.utm_campaign ?? undefined,
      term: r.utm_term ?? undefined,
      content: r.utm_content ?? undefined,
      first_source: first.s,
      first_medium: first.m,
      first_campaign: first.c,
    };
  } catch { return {}; }
}

function readCachedCountry(): string | null {
  try {
    const raw = sessionStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const loc = JSON.parse(raw);
    return typeof loc?.country === 'string' && loc.country.length > 0 ? loc.country : null;
  } catch { return null; }
}

function readClickIds(): { epik?: string; ttclid?: string; gclid?: string; fbclid?: string } {
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      epik: p.get('epik') ?? sessionStorage.getItem('gp_epik') ?? undefined,
      ttclid: p.get('ttclid') ?? sessionStorage.getItem('gp_ttclid') ?? undefined,
      gclid: p.get('gclid') ?? sessionStorage.getItem('gp_gclid') ?? undefined,
      fbclid: p.get('fbclid') ?? sessionStorage.getItem('gp_fbclid') ?? undefined,
    };
  } catch { return {}; }
}

function device(): string {
  try {
    const w = window.innerWidth || 0;
    if (w < 640) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  } catch { return 'unknown'; }
}

export function trackCci(event_name: CciEvent, extra?: Record<string, unknown>): void {
  try {
    if (typeof window === 'undefined' || !PROJECT) return;
    const session_id = ensureSessionId();
    if (!session_id) return;
    const utm = readUtm();
    const country = readCachedCountry();
    const clicks = readClickIds();
    const visitor_id = ensureVisitorId();
    const body = JSON.stringify({
      event_name,
      session_id,
      visitor_id,
      page_path: location.pathname,
      landing_page: sessionStorage.getItem('gp_landing_page') || location.pathname + location.search,
      referrer: document.referrer || null,
      device: device(),
      country,
      source: utm.source, medium: utm.medium, campaign: utm.campaign,
      meta: {
        utm_term: utm.term,
        utm_content: utm.content,
        utm_first_source: utm.first_source,
        utm_first_medium: utm.first_medium,
        utm_first_campaign: utm.first_campaign,
        epik: clicks.epik,
        ttclid: clicks.ttclid,
        gclid: clicks.gclid,
        fbclid: clicks.fbclid,
      },
      ...extra,
    });
    const url = `https://${PROJECT}.supabase.co/functions/v1/cci-ingest`;
    // Use CORS-safelisted content type to avoid preflight that Chrome silently drops on sendBeacon.
    const SAFE_TYPE = 'text/plain;charset=UTF-8';
    try {
      if (navigator.sendBeacon) {
        const ok = navigator.sendBeacon(url, new Blob([body], { type: SAFE_TYPE }));
        if (ok) return;
      }
    } catch { /* fall through */ }
    void fetch(url, { method: 'POST', headers: { 'Content-Type': SAFE_TYPE }, body, keepalive: true }).catch(() => {});
  } catch { /* swallow */ }
}