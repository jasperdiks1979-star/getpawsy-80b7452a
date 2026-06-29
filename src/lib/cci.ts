/**
 * Commercial Conversion Intelligence — thin, non-blocking client wrapper.
 * Fires sendBeacon to cci-ingest. Never throws, never blocks render.
 */
const PROJECT = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
const SESSION_KEY = 'gp_session_id';

export type CciEvent =
  | 'homepage_view' | 'collection_view' | 'product_card_click' | 'product_view'
  | 'product_image_view' | 'product_gallery_swipe' | 'product_price_visible'
  | 'shipping_info_visible' | 'returns_info_visible' | 'trust_badge_visible'
  | 'reviews_section_visible' | 'faq_section_visible' | 'sticky_atc_visible'
  | 'add_to_cart_click' | 'add_to_cart_success' | 'add_to_cart_error'
  | 'cart_open' | 'cart_quantity_change' | 'checkout_click' | 'checkout_loaded'
  | 'checkout_error' | 'payment_redirect_started' | 'payment_success'
  | 'purchase_confirmed';

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

function readUtm(): { source?: string; medium?: string; campaign?: string } {
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      source: p.get('utm_source') ?? undefined,
      medium: p.get('utm_medium') ?? undefined,
      campaign: p.get('utm_campaign') ?? undefined,
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
    const body = JSON.stringify({
      event_name,
      session_id,
      visitor_id: localStorage.getItem('gp_visitor_id'),
      page_path: location.pathname,
      landing_page: sessionStorage.getItem('gp_landing_page') || location.pathname + location.search,
      referrer: document.referrer || null,
      device: device(),
      source: utm.source, medium: utm.medium, campaign: utm.campaign,
      ...extra,
    });
    const url = `https://${PROJECT}.supabase.co/functions/v1/cci-ingest`;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        return;
      }
    } catch { /* fall through */ }
    void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* swallow */ }
}