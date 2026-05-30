import { useEffect, useCallback } from 'react';
import { PRODUCTION_DOMAINS } from '@/lib/constants';
import { getConsent, isMarketingAllowed } from '@/lib/cookieConsent';

// Pinterest Tag ID — exposed via env var (publishable, safe to ship in client bundle).
// Falls back to the canonical GetPawsy production tag if env is missing.
const PINTEREST_TAG_ID: string =
  (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.VITE_PINTEREST_TAG_ID) ||
  '2612897117846';

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
  document.head.appendChild(script);

  // Initialize with tag ID
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
}

// Track Pinterest event
const trackPinterestEvent = (event: PinterestEventType, data?: PinterestEventData) => {
  if (!isProductionDomain() || !isMarketingAllowed(getConsent())) return;
  if (typeof window === 'undefined' || !window.pintrk) return;

  // Generate unique event ID for deduplication
  const eventData = {
    ...data,
    event_id: data?.event_id || `${event}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  };

  window.pintrk('track', event, eventData);
  dlog('Event tracked:', event, eventData);
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
}

export const getPinterestTagHealth = (): PinterestTagHealth => {
  const w = typeof window !== 'undefined' ? window : (undefined as unknown as Window);
  const pintrk = w?.pintrk;
  return {
    tagId: PINTEREST_TAG_ID,
    initialized: pinterestInitialized,
    scriptLoaded: !!(pintrk && pintrk.loaded),
    queueDepth: Array.isArray(pintrk?.queue) ? pintrk!.queue!.length : 0,
    consentGranted: isMarketingAllowed(getConsent()),
    productionDomain: isProductionDomain(),
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'ssr',
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
  }) => {
    trackPinterestEvent('addtocart', {
      value: product.price * (product.quantity || 1),
      currency: 'EUR',
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
      currency: 'EUR',
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
