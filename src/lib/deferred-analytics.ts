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
import { reportTikTokPixelValidation } from './tiktok-pixel-config';

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
 * TikTok's pixel.js replaces the queued stubs on `ttq` with the real SDK
 * methods AFTER the script finishes loading. Calling `grantConsent` on the
 * stub just queues a no-op array push — the consent state isn't applied
 * until the SDK has hydrated.
 *
 * This helper polls until the real implementation is in place (or the
 * pixel is otherwise ready) and then calls grantConsent. Falls back to
 * the queued stub call if the SDK never arrives, which is still better
 * than dropping the consent entirely.
 */
export function grantTikTokConsentWhenReady(maxAttempts = 30, intervalMs = 100): void {
  const w = window as any;
  let attempts = 0;

  const tryGrant = () => {
    attempts++;
    const ttq = w.ttq;
    if (!ttq) {
      if (attempts < maxAttempts) setTimeout(tryGrant, intervalMs);
      return;
    }

    // The real SDK exposes `grantConsent` as a function on the loaded
    // instance (ttq._i[<pixelId>]) and replaces the array-stub method
    // on `ttq` itself. We treat "instance has methods" OR "stub queue is
    // gone" as the ready signal.
    const sdkReady =
      typeof ttq.grantConsent === 'function' &&
      // Stub pushes to an array; the real impl does not
      (!Array.isArray(ttq) || attempts >= maxAttempts);

    if (sdkReady) {
      try {
        ttq.grantConsent();
        w.__ttqConsent = 'granted';
        console.log(`[Analytics] TikTok grantConsent applied (attempt ${attempts})`);
      } catch (e) {
        console.warn('[Analytics] TikTok grantConsent threw:', e);
      }
      return;
    }

    if (attempts < maxAttempts) {
      setTimeout(tryGrant, intervalMs);
    } else {
      // Last-ditch: call whatever is there. The queued call will be
      // replayed by the SDK when it eventually loads.
      try {
        ttq.grantConsent && ttq.grantConsent();
        w.__ttqConsent = 'granted';
        console.log('[Analytics] TikTok grantConsent queued (SDK not ready after retries)');
      } catch { /* ignore */ }
    }
  };

  tryGrant();
}

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

    // Validate the configured pixel ID (env var or fallback). Logs a warning
    // and shows a dev-only banner if VITE_TIKTOK_PIXEL_ID is missing/invalid.
    const pixelConfig = reportTikTokPixelValidation();
    const pixelId = pixelConfig.pixelId;

    // Geo-aware consent:
    //   • EU/GDPR visitors → hold until cookie banner grants
    //   • Non-EU (US/etc.) → auto-grant immediately so the pixel fires on
    //     first page view (CCPA opt-out regime, not GDPR opt-in)
    const autoGrant = canAutoGrantConsent();
    if (!autoGrant) {
      ttq.holdConsent && ttq.holdConsent();
      (window as any).__ttqConsent = 'held';
    }

    ttq.load(pixelId);

    if (autoGrant) {
      // Grant must be called AFTER load AND AFTER the SDK has hydrated.
      // Polling helper retries until the real grantConsent is available.
      grantTikTokConsentWhenReady();
    }

    ttq.page();
    ttq._loaded = true;
    console.log(
      `[Analytics] TikTok Pixel loaded — id=${pixelId} (${pixelConfig.source}) — autoGrant: ${autoGrant}`,
    );
    // Diagnostic log — pairs with consentLog so we can verify the very
    // first page event fires under the expected consent state.
    void import('./consentLog')
      .then(({ logTikTokEvent }) => logTikTokEvent('page', { trigger: 'pixel-init' }))
      .catch(() => { /* logging must never break analytics */ });
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
    // Set default consent BEFORE loading scripts.
    // Geo-aware: EU/GDPR visitors → denied until banner grants. Non-EU
    // (US/CCPA opt-out regime) → granted on first hit so attribution is
    // not lost. Resolved SYNCHRONOUSLY via timezone (no network race).
    const autoGrantConsent = canAutoGrantConsent();
    const defaultState = autoGrantConsent ? 'granted' : 'denied';
    gtag('consent', 'default', {
      'analytics_storage': defaultState,
      'ad_storage': defaultState,
      'ad_user_data': defaultState,
      'ad_personalization': defaultState,
      'wait_for_update': 500,
    });

    // Load the main gtag script
    await loadScript('https://www.googletagmanager.com/gtag/js?id=G-5WYL8RJDZF');

    // Configure all properties.
    // NOTE: GT-5D48HPG2 (Google Tag container) was removed on 2026-06-16.
    // That container had a destination configured for a legacy GA4 property
    // (G-SK5PC3KTHJ) and was causing every page_view / event to be sent to
    // TWO GA4 properties simultaneously. Canonical property is G-5WYL8RJDZF.
    // Google Ads (AW-381705659) is configured directly below — the GT
    // container is not required for Ads conversions.
    gtag('js', new Date());
    // IMPORTANT: send_page_view:false — SafeGlobalVisitorTracker fires the
    // canonical SPA page_view on mount AND every route change. Without this,
    // the first hit produces TWO page_view events (one from config, one from
    // the tracker) corrupting engagement + bounce metrics.
    gtag('config', 'G-5WYL8RJDZF', { send_page_view: false });
    gtag('config', 'AW-381705659', { send_page_view: false });

    // Load TikTok Pixel alongside Google scripts
    initTikTokPixel();

    console.log('[Analytics] Deferred analytics loaded successfully');
  } catch (e) {
    // Analytics must NEVER crash the app
    console.warn('[Analytics] Init error (non-fatal):', e);
  }
}
