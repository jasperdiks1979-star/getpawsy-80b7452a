/**
 * Deferred Analytics Loader
 * 
 * Loads Google Analytics, Google Ads, and GTM scripts AFTER React mounts
 * to prevent "Cannot access uninitialized variable" TDZ errors on iOS Safari.
 * 
 * Previously these scripts were in index.html <head> and could interfere
 * with ES module evaluation order.
 */

import { canAutoGrantConsent } from './geoConsent';

// Ensure dataLayer exists safely before any gtag call
if (typeof window !== 'undefined') {
  (window as any).dataLayer = (window as any).dataLayer || [];
}

function gtag(...args: any[]) {
  (window as any).dataLayer.push(arguments);
}

/**
 * Load a script tag dynamically, returns a promise
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      console.warn('[Analytics] Failed to load:', src);
      resolve(); // Don't reject — analytics failure must never block the app
    };
    document.head.appendChild(script);
  });
}

let initialized = false;

/**
 * Initialize TikTok Pixel — loaded deferred to avoid blocking render.
 * Pixel ID: D7KDRMBC77U9EB7RJROG (GetPawsy Pixel)
 */
function initTikTokPixel(): void {
  try {
    const w = window as any;
    if (w.ttq && w.ttq._loaded) return;

    w.TiktokAnalyticsObject = 'ttq';
    const ttq = (w.ttq = w.ttq || []);
    ttq.methods = ['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];
    ttq.setAndDefer = function(t: any, e: string) {
      t[e] = function() { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); };
    };
    for (let i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function(t: string) {
      const e = ttq._i[t] || [];
      for (let n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
      return e;
    };
    ttq.load = function(e: string, n?: any) {
      const r = 'https://analytics.tiktok.com/i18n/pixel/events.js';
      ttq._i = ttq._i || {};
      ttq._i[e] = [];
      ttq._i[e]._u = r;
      ttq._t = ttq._t || {};
      ttq._t[e] = +new Date();
      ttq._o = ttq._o || {};
      ttq._o[e] = n || {};
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.src = r + '?sdkid=' + e + '&lib=ttq';
      const first = document.getElementsByTagName('script')[0];
      first.parentNode?.insertBefore(script, first);
    };

    // Geo-aware consent:
    //   • EU/GDPR visitors → hold until cookie banner grants
    //   • Non-EU (US/etc.) → auto-grant immediately so the pixel fires on
    //     first page view (CCPA opt-out regime, not GDPR opt-in)
    const autoGrant = canAutoGrantConsent();
    if (!autoGrant) {
      ttq.holdConsent && ttq.holdConsent();
      (window as any).__ttqConsent = 'held';
    }

    ttq.load('D7KDRMBC77U9EB7RJROG');

    if (autoGrant) {
      // Grant must be called AFTER load (per TikTok docs)
      ttq.grantConsent && ttq.grantConsent();
      (window as any).__ttqConsent = 'granted';
    }

    ttq.page();
    ttq._loaded = true;
    console.log('[Analytics] TikTok Pixel loaded — autoGrant:', autoGrant);
  } catch (e) {
    console.warn('[Analytics] TikTok Pixel init error (non-fatal):', e);
  }
}

/**
 * Initialize all Google analytics/ads scripts.
 * Safe to call multiple times — only runs once.
 * Should be called AFTER React has mounted successfully.
 */
export async function initDeferredAnalytics(): Promise<void> {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  initialized = true;

  try {
    // Set default consent BEFORE loading scripts (GDPR)
    gtag('consent', 'default', {
      'analytics_storage': 'denied',
      'ad_storage': 'denied',
      'ad_user_data': 'denied',
      'ad_personalization': 'denied',
      'wait_for_update': 500,
    });

    // Load the main gtag script
    await loadScript('https://www.googletagmanager.com/gtag/js?id=G-5WYL8RJDZF');

    // Configure all properties
    gtag('js', new Date());
    gtag('config', 'G-5WYL8RJDZF');
    gtag('config', 'AW-381705659');
    gtag('config', 'GT-5D48HPG2');

    // Load TikTok Pixel alongside Google scripts
    initTikTokPixel();

    console.log('[Analytics] Deferred analytics loaded successfully');
  } catch (e) {
    // Analytics must NEVER crash the app
    console.warn('[Analytics] Init error (non-fatal):', e);
  }
}
