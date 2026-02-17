/**
 * Deferred Analytics Loader
 * 
 * Loads Google Analytics, Google Ads, and GTM scripts AFTER React mounts
 * to prevent "Cannot access uninitialized variable" TDZ errors on iOS Safari.
 * 
 * Previously these scripts were in index.html <head> and could interfere
 * with ES module evaluation order.
 */

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

    console.log('[Analytics] Deferred analytics loaded successfully');
  } catch (e) {
    // Analytics must NEVER crash the app
    console.warn('[Analytics] Init error (non-fatal):', e);
  }
}
