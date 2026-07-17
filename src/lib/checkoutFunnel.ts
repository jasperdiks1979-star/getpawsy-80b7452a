/**
 * Client-side checkout funnel tracker.
 *
 * Fires 3 streams in parallel for every checkout step:
 *   1. GA4 (`trackEvent`) — for the existing GA4 funnel
 *   2. TikTok Pixel — standard or custom event
 *   3. Server (`track-checkout-funnel` edge fn) — Postgres mirror that
 *      survives ad-blockers and feeds the admin Klarna funnel report
 */
import { supabase } from '@/integrations/supabase/client';
import { trackEvent } from '@/lib/analytics';
import { ttTrackKlarnaEvent } from '@/lib/tiktok-pixel';
import { resolveUtm } from '@/lib/utmNormalizer';
import { getCanonicalSessionId } from '@/lib/canonicalSession';

export type FunnelStep =
  | 'begin_checkout'
  | 'klarna_message_shown'
  | 'klarna_proceed'
  | 'stripe_redirect'
  | 'complete_payment'
  | 'klarna_purchase'
  | 'checkout_abandoned'
  | 'shipping_country_blocked';

export interface FunnelEvent {
  step: FunnelStep;
  value?: number;
  currency?: string;
  paymentMethod?: string;
  isKlarna?: boolean;
  placement?: 'pdp' | 'checkout';
  stripeSessionId?: string;
  metadata?: Record<string, unknown>;
}

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  // Phase 4A: unified canonical session id so checkout_funnel_events joins
  // with visitor_activity / cci_events / canonical_events. The canonical
  // provider also mirrors the sid back into `gp_funnel_sid` for any legacy
  // reader.
  try { return getCanonicalSessionId(); } catch { return `fs_${Date.now()}`; }
}

/**
 * Collect visitor_id + first/current UTM + cached country so the server can
 * populate checkout_funnel_events.geo_country and metadata.visitor_id even
 * when the funnel session id is the only stable key.
 */
function collectAttribution(): {
  visitorId: string | null;
  country: string | null;
  utm: {
    source: string | null; medium: string | null; campaign: string | null;
    term: string | null; content: string | null;
    first_source: string | null; first_medium: string | null; first_campaign: string | null;
  };
} {
  if (typeof window === 'undefined') {
    return { visitorId: null, country: null, utm: { source: null, medium: null, campaign: null, term: null, content: null, first_source: null, first_medium: null, first_campaign: null } };
  }
  let visitorId: string | null = null;
  try { visitorId = localStorage.getItem('gp_visitor_id'); } catch { /* ignore */ }
  let country: string | null = null;
  try {
    const raw = sessionStorage.getItem('visitor_location');
    if (raw) {
      const loc = JSON.parse(raw);
      if (typeof loc?.country === 'string' && loc.country.length > 0) country = loc.country;
    }
  } catch { /* ignore */ }
  const r = resolveUtm();
  let first: { s?: string; m?: string; c?: string } = {};
  try {
    const cached = sessionStorage.getItem('gp_utm_first');
    if (cached) first = JSON.parse(cached);
  } catch { /* ignore */ }
  return {
    visitorId,
    country,
    utm: {
      source: r.utm_source ?? null,
      medium: r.utm_medium ?? null,
      campaign: r.utm_campaign ?? null,
      term: r.utm_term ?? null,
      content: r.utm_content ?? null,
      first_source: first.s ?? null,
      first_medium: first.m ?? null,
      first_campaign: first.c ?? null,
    },
  };
}

export function trackCheckoutFunnel(evt: FunnelEvent): void {
  const sessionId = getSessionId();
  const attrib = collectAttribution();

  // 1. GA4 mirror
  trackEvent(`funnel_${evt.step}`, {
    value: evt.value,
    currency: evt.currency || 'USD',
    payment_method: evt.paymentMethod,
    is_klarna: !!evt.isKlarna,
    placement: evt.placement,
    funnel_session_id: sessionId,
    ...(evt.metadata || {}),
  });

  // 2. TikTok custom event for Klarna-specific steps
  if (evt.step === 'klarna_message_shown') {
    ttTrackKlarnaEvent('KlarnaMessageShown', {
      value: evt.value,
      currency: evt.currency,
      placement: evt.placement,
    });
  } else if (evt.step === 'klarna_proceed') {
    ttTrackKlarnaEvent('KlarnaProceed', {
      value: evt.value,
      currency: evt.currency,
      placement: evt.placement,
    });
  }

  // 3. Server-side mirror (best-effort, fire-and-forget)
  try {
    void supabase.functions.invoke('track-checkout-funnel', {
      body: {
        step: evt.step,
        sessionId,
        stripeSessionId: evt.stripeSessionId,
        value: evt.value,
        currency: evt.currency || 'usd',
        paymentMethod: evt.paymentMethod,
        isKlarna: !!evt.isKlarna,
        visitorId: attrib.visitorId,
        country: attrib.country,
        metadata: {
          placement: evt.placement,
          visitor_id: attrib.visitorId,
          utm: attrib.utm,
          ...(evt.metadata || {}),
        },
      },
    });
  } catch {
    // never block UX
  }
}
