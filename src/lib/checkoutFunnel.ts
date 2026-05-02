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

export type FunnelStep =
  | 'begin_checkout'
  | 'klarna_message_shown'
  | 'klarna_proceed'
  | 'stripe_redirect'
  | 'complete_payment'
  | 'klarna_purchase'
  | 'checkout_abandoned';

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
  try {
    let id = sessionStorage.getItem('gp_funnel_sid');
    if (!id) {
      id = `fs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem('gp_funnel_sid', id);
    }
    return id;
  } catch {
    return `fs_${Date.now()}`;
  }
}

export function trackCheckoutFunnel(evt: FunnelEvent): void {
  const sessionId = getSessionId();

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
        metadata: { placement: evt.placement, ...(evt.metadata || {}) },
      },
    });
  } catch {
    // never block UX
  }
}
