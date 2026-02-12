/**
 * Safety guard to block external Shopify admin links.
 * Redirects all Shopify admin attempts to internal /admin/guides-seo route.
 */

const BLOCKED_PATTERNS = [
  /admin\.shopify\.com/i,
  /shopify.*admin/i,
  /skidzo-store/i,
];

/**
 * Check if a URL is a blocked external Shopify admin link.
 * If so, log a warning and return the internal replacement URL.
 */
export function checkAndBlockShopifyLink(url: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(url)) {
      console.warn(
        `🚫 Blocked external Shopify admin link – use /admin/guides-seo instead\n` +
        `Attempted: ${url}`
      );
      return '/admin/guides-seo';
    }
  }
  return null;
}

/**
 * Wrap window.open to intercept Shopify admin attempts.
 */
export function initShopifyBlocker() {
  const originalOpen = window.open;
  
  window.open = function(url?: string | URL, ...args: any[]) {
    if (typeof url === 'string') {
      const blockedUrl = checkAndBlockShopifyLink(url);
      if (blockedUrl) {
        // Navigate internally instead of opening external link
        window.location.href = blockedUrl;
        return null;
      }
    }
    return originalOpen.call(window, url, ...args);
  };
}

/**
 * Intercept fetch requests to Shopify admin and redirect to internal dashboard.
 */
export function initShopifyFetchBlocker() {
  const originalFetch = window.fetch;
  
  window.fetch = function(input: RequestInfo | URL, ...args: any[]) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    
    if (checkAndBlockShopifyLink(url)) {
      // Return a mock error response for blocked Shopify requests
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: 'External Shopify admin links are blocked. Use /admin/guides-seo instead.',
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
