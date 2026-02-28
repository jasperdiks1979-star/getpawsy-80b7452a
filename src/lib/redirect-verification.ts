/**
 * Redirect Verification Utility
 * 
 * Runs a lightweight runtime check to verify that www -> apex redirects
 * are returning 301 (permanent) not 302 (temporary).
 * 
 * Only runs in development/preview or when explicitly triggered via
 * ?verifyRedirects=1 query param.
 */

const CANONICAL_HOST = 'getpawsy.pet';
const REDIRECT_VARIANTS = [
  { label: 'www -> apex', from: 'https://www.getpawsy.pet/', expected: 301 },
];

interface RedirectCheckResult {
  variant: string;
  status: 'pass' | 'fail' | 'skip' | 'error';
  detail: string;
}

/**
 * Verify redirect status codes. Returns results array.
 * Note: Browser fetch cannot inspect redirect status codes for cross-origin
 * requests (opaque redirect). This utility logs the check intent and provides
 * curl commands for manual verification.
 */
export function getRedirectVerificationCommands(): string[] {
  return [
    `curl -sI https://www.getpawsy.pet/ | grep -E "HTTP|Location"`,
    `curl -sI https://getpawsy.lovable.app/ | grep -E "HTTP|Location"`,
    `curl -sI https://getpawsy.pet/robots.txt | grep -E "HTTP|Cache-Control"`,
    `curl -sI https://getpawsy.pet/sitemap.xml | grep -E "HTTP|Cache-Control"`,
  ];
}

/**
 * Runtime redirect health check.
 * Logs warnings if on non-canonical host without proper redirect.
 */
export function checkRedirectHealth(): RedirectCheckResult[] {
  if (typeof window === 'undefined') return [];
  
  const results: RedirectCheckResult[] = [];
  const host = window.location.hostname;
  
  // Check 1: Are we on canonical host?
  if (host === CANONICAL_HOST) {
    results.push({
      variant: 'canonical-host',
      status: 'pass',
      detail: `Running on canonical host: ${CANONICAL_HOST}`,
    });
  } else if (host.startsWith('www.')) {
    // We're on www — redirect should have happened
    results.push({
      variant: 'www-redirect',
      status: 'fail',
      detail: `Still on www host (${host}). Platform redirect may be 302 instead of 301. Check _redirects file and Cloudflare config.`,
    });
    console.warn(`[SEO-REDIRECT] ⚠️ www redirect did not fire or is 302. Current host: ${host}. Expected: ${CANONICAL_HOST}`);
  } else if (host.endsWith('.lovable.app')) {
    results.push({
      variant: 'lovable-redirect',
      status: 'fail',
      detail: `Still on lovable.app host (${host}). Platform redirect may not be configured.`,
    });
    console.warn(`[SEO-REDIRECT] ⚠️ lovable.app redirect did not fire. Current host: ${host}`);
  } else {
    results.push({
      variant: 'canonical-host',
      status: 'pass',
      detail: `Running on host: ${host}`,
    });
  }
  
  // Check 2: Charset meta is first in head
  const firstMeta = document.querySelector('head > :first-child');
  if (firstMeta?.tagName === 'META' && 
      (firstMeta as HTMLMetaElement).getAttribute('charset')?.toUpperCase() === 'UTF-8') {
    results.push({
      variant: 'charset-position',
      status: 'pass',
      detail: 'meta charset="UTF-8" is first element in <head>',
    });
  } else {
    results.push({
      variant: 'charset-position',
      status: 'fail',
      detail: `First <head> element is ${firstMeta?.tagName || 'unknown'}, not meta charset`,
    });
  }
  
  return results;
}

/**
 * Log redirect verification to console (dev/preview only).
 */
export function logRedirectVerification(): void {
  if (typeof window === 'undefined') return;
  
  const isDev = import.meta.env.DEV;
  const hasParam = new URLSearchParams(window.location.search).has('verifyRedirects');
  
  if (!isDev && !hasParam) return;
  
  const results = checkRedirectHealth();
  const commands = getRedirectVerificationCommands();
  
  console.group('[SEO-REDIRECT] Redirect & Header Verification');
  results.forEach(r => {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
    console.log(`${icon} ${r.variant}: ${r.detail}`);
  });
  console.log('\n📋 Verify 301 status with curl:');
  commands.forEach(cmd => console.log(`  ${cmd}`));
  console.groupEnd();
}
