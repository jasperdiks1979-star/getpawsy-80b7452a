import { useEffect, useCallback } from 'react';
import { PRODUCTION_DOMAINS } from '@/lib/constants';
import { getConsent, isMarketingAllowed } from '@/lib/cookieConsent';

// Pinterest Tag ID — exposed via env var (publishable, safe to ship in client bundle).
// Canonical value MUST match the advertiser-owned conversion tag on ad account
// 549770199501 (GetPawsy). Tag 2612897117846 was stale/foreign (403 on this
// ad account) and produced unattributable conversions — do not restore it.
const PINTEREST_TAG_ID: string =
  (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.VITE_PINTEREST_TAG_ID) ||
  '2612820116727';


const IS_DEV: boolean =
  typeof import.meta !== 'undefined' && !!(import.meta as ImportMeta).env?.DEV;

const dlog = (...args: unknown[]) => {
  if (IS_DEV) console.log('[Pinterest]', ...args);
};

// Check if we're on a production domain
const isProductionDomain = (): boolean => {
  if (typeof window === 'undefined') return false;
  return PRODUCTION_DOMAINS.includes(window.location.hostname);
};

// Declare Pinterest tag on window
declare global {
  interface Window {
    pintrk: ((...args: unknown[]) => void) & {
      queue?: unknown[];
      version?: string;
      loaded?: boolean;
    };
    _pinterestAsyncInit?: () => void;
  }
}

let pinterestInitialized = false;
let lastEventName: string | null = null;
let lastEventAt: string | null = null;

// Initialize Pinterest Tag
const initPinterestTag = () => {
  if (typeof window === 'undefined' || pinterestInitialized || window.pintrk) return;
  if (!isMarketingAllowed(getConsent())) return; // consent gate

  pinterestInitialized = true;

  // Create pintrk function
  window.pintrk = function (...args: unknown[]) {
    window.pintrk.queue = window.pintrk.queue || [];
    window.pintrk.queue.push(args);
  };

  // Load Pinterest script
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://s.pinimg.com/ct/core.js';
  script.onload = () => {
    if (window.pintrk) {
      window.pintrk.loaded = true;
      window.pintrk.version = '3.0';
    }
    dlog('core.js loaded');
  };
  script.onerror = () => {
    dlog('core.js failed to load (likely blocked by ad blocker / CSP)');
  };
  document.head.appendChild(script);

  // Initialize with tag ID
  window.pintrk.queue = window.pintrk.queue || [];
  window.pintrk.version = '3.0';
  window.pintrk('load', PINTEREST_TAG_ID);
  window.pintrk('page');
  dlog('Tag initialized:', PINTEREST_TAG_ID);
};

// Pinterest event types
type PinterestEventType = 
  | 'pagevisit'
  | 'viewcategory'
  | 'viewcontent'
  | 'addtocart'
  | 'checkout'
  | 'custom'
  | 'signup'
  | 'lead'
  | 'search'
  | 'watchvideo';

interface PinterestEventData {
  event_id?: string;
  event_name?: string;
  value?: number;
  currency?: string;
  order_quantity?: number;
  product_name?: string;
  product_id?: string;
  product_category?: string;
  product_price?: number;
  line_items?: Array<{
    product_name?: string;
    product_id?: string;
    product_price?: number;
    product_quantity?: number;
    product_category?: string;
  }>;
  search_query?: string;
  [key: string]: unknown;
}

// ── Readiness-aware event buffer ────────────────────────────────────────────
// Pinterest bootstraps asynchronously (idle callback + consent gate), while the
// commerce events themselves fire the moment the product resolves or the user
// clicks Add to Cart. On iOS/WebKit the tag was frequently not present yet, so
// `viewcontent` / `addtocart` were dropped on the floor. Application events are
// now recorded immediately and flushed once the tag is ready.
//
// Rules: bounded (MAX_QUEUE), time-boxed (MAX_AGE_MS — a stale event is
// semantically wrong, so it is discarded, never sent late), dispatched exactly
// once per event_id, and never able to break the storefront.
const MAX_QUEUE = 25;
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
const FLUSH_INTERVAL_MS = 300;
const MAX_FLUSH_ATTEMPTS = 60; // ~18s, then the queue is abandoned (no infinite loop)

interface QueuedEvent {
  event: PinterestEventType;
  data: PinterestEventData & { event_id: string };
  ts: number;
}

const pendingEvents: QueuedEvent[] = [];
const dispatchedEventIds = new Set<string>();
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushAttempts = 0;

const tagReady = (): boolean =>
  typeof window !== 'undefined' && typeof window.pintrk === 'function';

/** Dispatch to pintrk exactly once per event_id. Never throws. */
const dispatch = (item: QueuedEvent): void => {
  if (dispatchedEventIds.has(item.data.event_id)) return;
  dispatchedEventIds.add(item.data.event_id);
  // Bound the dedupe ledger — a long session must not grow it without limit.
  if (dispatchedEventIds.size > 200) {
    const oldest = dispatchedEventIds.values().next().value as string | undefined;
    if (oldest) dispatchedEventIds.delete(oldest);
  }
  try {
    window.pintrk('track', item.event, item.data);
    lastEventName = item.event;
    lastEventAt = new Date().toISOString();
    dlog('Event tracked:', item.event, item.data);
  } catch (e) {
    dlog('dispatch failed (non-fatal)', e);
  }
};

const stopFlushLoop = () => {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
};

/** Flush queued events when the tag is ready and consent still allows it. */
const flushQueue = (): void => {
  if (pendingEvents.length === 0) {
    stopFlushLoop();
    return;
  }
  // Drop events that have aged out — sending them now would misrepresent
  // when the user actually performed the action.
  const now = Date.now();
  for (let i = pendingEvents.length - 1; i >= 0; i--) {
    if (now - pendingEvents[i].ts > MAX_AGE_MS) pendingEvents.splice(i, 1);
  }
  // Consent must hold at dispatch time, not only at record time.
  if (!isMarketingAllowed(getConsent())) return;
  if (!tagReady()) return;
  while (pendingEvents.length > 0) {
    dispatch(pendingEvents.shift()!);
  }
  stopFlushLoop();
};

const startFlushLoop = (): void => {
  if (flushTimer !== null || typeof window === 'undefined') return;
  flushAttempts = 0;
  flushTimer = setInterval(() => {
    flushAttempts++;
    if (flushAttempts > MAX_FLUSH_ATTEMPTS) {
      // Give up quietly — analytics fails open, the storefront is unaffected.
      pendingEvents.length = 0;
      stopFlushLoop();
      return;
    }
    // Consent may have been granted after the action (geo auto-grant on iOS
    // arrives a few hundred ms after boot) — retry initialization each tick.
    try { initPinterestTag(); } catch { /* ignore */ }
    flushQueue();
  }, FLUSH_INTERVAL_MS);
};

// Track Pinterest event
const trackPinterestEvent = (event: PinterestEventType, data?: PinterestEventData) => {
  if (typeof window === 'undefined' || !isProductionDomain()) return;

  // Generate unique event ID for deduplication — created once, at record time,
  // and preserved across queueing/flushing so a replay can never duplicate.
  const eventData = {
    ...data,
    event_id: data?.event_id || `${event}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  };

  if (dispatchedEventIds.has(eventData.event_id)) return;
  if (pendingEvents.some((p) => p.data.event_id === eventData.event_id)) return;

  // Consent is still fully honored: nothing leaves the browser until consent
  // allows marketing. Without consent we buffer locally only (same posture the
  // TikTok pixel already uses via grantTikTokConsentWhenReady).
  const consentOk = isMarketingAllowed(getConsent());
  if (consentOk && !tagReady()) {
    try { initPinterestTag(); } catch { /* ignore */ }
  }

  if (consentOk && tagReady()) {
    dispatch({ event, data: eventData, ts: Date.now() });
    return;
  }

  pendingEvents.push({ event, data: eventData, ts: Date.now() });
  if (pendingEvents.length > MAX_QUEUE) pendingEvents.shift();
  startFlushLoop();
};


// Health snapshot used by the public Pinterest tag status page.
export interface PinterestTagHealth {
  tagId: string;
  initialized: boolean;
  scriptLoaded: boolean;
  queueDepth: number;
  consentGranted: boolean;
  productionDomain: boolean;
  hostname: string;
  lastEventName: string | null;
  lastEventAt: string | null;
  status: 'ok' | 'degraded' | 'awaiting_consent' | 'non_production';
}

export const getPinterestTagHealth = (): PinterestTagHealth => {
  const w = typeof window !== 'undefined' ? window : (undefined as unknown as Window);
  const pintrk = w?.pintrk;
  const consentGranted = isMarketingAllowed(getConsent());
  const productionDomain = isProductionDomain();
  const scriptLoaded = !!(pintrk && pintrk.loaded);
  let status: PinterestTagHealth['status'] = 'ok';
  if (!productionDomain) status = 'non_production';
  else if (!consentGranted) status = 'awaiting_consent';
  else if (!pinterestInitialized || !scriptLoaded) status = 'degraded';
  return {
    status,
    tagId: PINTEREST_TAG_ID,
    initialized: pinterestInitialized,
    scriptLoaded,
    queueDepth: Array.isArray(pintrk?.queue) ? pintrk!.queue!.length : 0,
    consentGranted,
    productionDomain,
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'ssr',
    lastEventName,
    lastEventAt,
  };
};

/**
 * Hook for Pinterest conversion tracking
 * Automatically initializes the Pinterest tag and provides tracking functions
 */
export const usePinterestTracking = () => {
  // Initialize tag on mount
  useEffect(() => {
    if (isProductionDomain()) {
      initPinterestTag();
    }
  }, []);

  // Track page visit
  const trackPageVisit = useCallback(() => {
    trackPinterestEvent('pagevisit');
  }, []);

  // Track category view
  const trackViewCategory = useCallback((categoryName: string) => {
    trackPinterestEvent('viewcategory', {
      product_category: categoryName,
    });
  }, []);

  // Track add to cart
  const trackAddToCart = useCallback((product: {
    id: string;
    name: string;
    price: number;
    category?: string;
    quantity?: number;
    event_id?: string;
  }) => {
    trackPinterestEvent('addtocart', {
      event_id: product.event_id,
      value: product.price * (product.quantity || 1),
      currency: 'USD',
      order_quantity: product.quantity || 1,
      product_name: product.name,
      product_id: product.id,
      product_category: product.category,
      product_price: product.price,
      line_items: [{
        product_name: product.name,
        product_id: product.id,
        product_price: product.price,
        product_quantity: product.quantity || 1,
        product_category: product.category,
      }],
    });
  }, []);

  // Track checkout
  const trackCheckout = useCallback((order: {
    value: number;
    items: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      category?: string;
    }>;
    orderId?: string;
  }) => {
    trackPinterestEvent('checkout', {
      event_id: order.orderId,
      value: order.value,
      currency: 'USD',
      order_quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
      line_items: order.items.map(item => ({
        product_name: item.name,
        product_id: item.id,
        product_price: item.price,
        product_quantity: item.quantity,
        product_category: item.category,
      })),
    });
  }, []);

  // Track search
  const trackSearch = useCallback((query: string) => {
    trackPinterestEvent('search', {
      search_query: query,
    });
  }, []);

  // Track newsletter signup
  const trackSignup = useCallback(() => {
    trackPinterestEvent('signup');
  }, []);

  return {
    trackPageVisit,
    trackViewCategory,
    trackAddToCart,
    trackCheckout,
    trackSearch,
    trackSignup,
    isProductionDomain: isProductionDomain(),
  };
};

// Export standalone functions for use outside React components
export { trackPinterestEvent, initPinterestTag, isProductionDomain };
