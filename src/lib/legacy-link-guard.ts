/**
 * Safety guard to block deprecated external admin links.
 * Redirects all legacy admin attempts to internal /admin/guides-seo route.
 */

const BLOCKED_PATTERNS = [
  /admin\.shopify\.com/i,
  /myshopify\.com/i,
  /legacy-store/i,
];

/**
 * Check if a URL is a blocked legacy external admin link.
 * If so, log a warning and return the internal replacement URL.
 */
export function checkAndBlockLegacyLink(url: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(url)) {
      console.warn(
        `🚫 Blocked legacy admin link (deprecated). Use /dashboard/guides-seo instead.\n` +
        `Attempted: ${url}`
      );
      return '/dashboard/guides-seo';
    }
  }
  return null;
}

/**
 * Wrap window.open to intercept legacy admin attempts.
 */
export function initLegacyLinkGuard() {
  const originalOpen = window.open;
  
  window.open = function(url?: string | URL, ...args: any[]) {
    if (typeof url === 'string') {
      const blockedUrl = checkAndBlockLegacyLink(url);
      if (blockedUrl) {
        window.location.href = blockedUrl;
        return null;
      }
    }
    return originalOpen.call(window, url, ...args);
  };
}

/**
 * Intercept fetch requests to legacy admin endpoints.
 */
export function initLegacyFetchGuard() {
  const originalFetch = window.fetch;
  
  window.fetch = function(input: RequestInfo | URL, ...args: any[]) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    
    if (checkAndBlockLegacyLink(url)) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: 'Legacy admin links are blocked. Use /dashboard/guides-seo instead.',
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );
    }
    
    return originalFetch.call(this, input, ...args);
  };
}
