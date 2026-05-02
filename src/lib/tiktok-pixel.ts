/**
 * TikTok Pixel — Safe event tracking helpers.
 * Pixel ID: D7KDRMBC77U9EB7RJROG (GetPawsy Pixel)
 *
 * Pixel is loaded deferred via src/lib/deferred-analytics.ts.
 * All track() calls are no-ops if ttq isn't loaded yet — never throws.
 *
 * TikTok standard events: https://business-api.tiktok.com/portal/docs?id=1739585702922241
 */

import { fireMarketingAsync } from './marketingClient';
import { logTikTokEvent } from './consentLog';

type TTQ = {
  track: (event: string, params?: Record<string, unknown>) => void;
  page: () => void;
  identify: (params: Record<string, unknown>) => void;
  grantConsent?: () => void;
  revokeConsent?: () => void;
};

function getTTQ(): TTQ | null {
  if (typeof window === 'undefined') return null;
  const ttq = (window as any).ttq;
  return ttq && typeof ttq.track === 'function' ? (ttq as TTQ) : null;
}

/** Grant cookie/tracking consent (call from cookie banner accept). */
export function ttGrantConsent(): void {
  const ttq = getTTQ();
  ttq?.grantConsent?.();
}

/** Revoke cookie/tracking consent. */
export function ttRevokeConsent(): void {
  const ttq = getTTQ();
  ttq?.revokeConsent?.();
}

/** Manual page view (auto-fires on load; use for SPA route changes). */
export function ttTrackPageView(): void {
  fireMarketingAsync('tiktok:page', () => {
    const ttq = getTTQ();
    ttq?.page();
    logTikTokEvent('page');
  });
}

/** Product detail page view (PDP). */
export function ttTrackViewContent(params: {
  contentId: string;
  contentName: string;
  value: number;
  currency?: string;
}): void {
  fireMarketingAsync('tiktok:ViewContent', () => {
    const ttq = getTTQ();
    ttq?.track('ViewContent', {
      content_type: 'product',
      content_id: params.contentId,
      content_name: params.contentName,
      value: params.value,
      currency: params.currency || 'USD',
    });
    logTikTokEvent('ViewContent', {
      contentId: params.contentId,
      value: params.value,
    });
  });
}

/** Add to cart event. */
export function ttTrackAddToCart(params: {
  contentId: string;
  contentName: string;
  value: number;
  quantity?: number;
  currency?: string;
}): void {
  fireMarketingAsync('tiktok:AddToCart', () => {
    const ttq = getTTQ();
    ttq?.track('AddToCart', {
      content_type: 'product',
      content_id: params.contentId,
      content_name: params.contentName,
      value: params.value,
      quantity: params.quantity || 1,
      currency: params.currency || 'USD',
    });
    logTikTokEvent('AddToCart', {
      contentId: params.contentId,
      value: params.value,
      quantity: params.quantity || 1,
    });
  });
}

/** Begin checkout event. */
export function ttTrackInitiateCheckout(params: {
  value: number;
  currency?: string;
  contents?: Array<{ content_id: string; quantity: number; price: number }>;
}): void {
  fireMarketingAsync('tiktok:InitiateCheckout', () => {
    const ttq = getTTQ();
    ttq?.track('InitiateCheckout', {
      value: params.value,
      currency: params.currency || 'USD',
      contents: params.contents,
    });
    logTikTokEvent('InitiateCheckout', {
      value: params.value,
      itemCount: params.contents?.length ?? 0,
    });
  });
}

/** Purchase / order completed. Fire ONCE per order. */
export function ttTrackPurchase(params: {
  orderId: string;
  value: number;
  currency?: string;
  contents?: Array<{ content_id: string; quantity: number; price: number; content_name?: string }>;
}): void {
  fireMarketingAsync('tiktok:Purchase', () => {
    const ttq = getTTQ();
    ttq?.track('CompletePayment', {
      content_type: 'product',
      value: params.value,
      currency: params.currency || 'USD',
      contents: params.contents,
      description: params.orderId,
      event_id: params.orderId, // dedup with server-side CompletePayment
    });
    logTikTokEvent('CompletePayment', {
      orderId: params.orderId,
      value: params.value,
      itemCount: params.contents?.length ?? 0,
    });
  });
}

/**
 * Custom TikTok event fired when the shopper SELECTS Klarna in Stripe
 * Checkout (proxied via the success URL's payment_method query param when
 * available) or when Klarna messaging is shown. These are tracked as
 * standard TikTok custom events so they can be optimised against in Ads
 * Manager and segmented in Events Manager.
 */
export function ttTrackKlarnaEvent(
  name: 'KlarnaMessageShown' | 'KlarnaProceed' | 'KlarnaPurchase',
  params: {
    value?: number;
    currency?: string;
    orderId?: string;
    placement?: 'pdp' | 'checkout';
  } = {},
): void {
  fireMarketingAsync(`tiktok:${name}`, () => {
    const ttq = getTTQ();
    ttq?.track(name, {
      value: params.value,
      currency: params.currency || 'USD',
      description: params.orderId,
      placement: params.placement,
      event_id: params.orderId
        ? `${name}_${params.orderId}`
        : `${name}_${Date.now()}`,
    });
    logTikTokEvent(name, params);
  });
}