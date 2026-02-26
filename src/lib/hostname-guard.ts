/**
 * Hostname Guard — blocks indexing on non-canonical hosts
 * 
 * On lovable.app (or any non-apex host), this:
 * 1. Injects <meta name="robots" content="noindex,nofollow,noarchive">
 * 2. Sets canonical to apex domain
 * 3. Redirects to https://getpawsy.pet (preserving path+query+hash)
 * 
 * Runs synchronously at boot (main.tsx) BEFORE React mounts.
 */

import { SITE_URL } from '@/lib/constants';

const CANONICAL_HOST = 'getpawsy.pet';

export function isCanonicalHost(): boolean {
  if (typeof window === 'undefined') return true;
  return window.location.hostname === CANONICAL_HOST;
}

export function isLovableAppHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('.lovable.app');
}

/**
 * Call at boot. If on lovable.app:
 * - Injects noindex meta (in case redirect doesn't fire fast enough for Googlebot)
 * - Redirects to apex
 */
/**
 * Call at boot. If on a non-canonical host (www or lovable.app):
 * - Injects noindex meta (belt-and-suspenders for Googlebot)
 * - Builds a single normalized target URL (lowercase, no trailing slash, stripped params)
 * - Redirects in ONE hop (no double redirect from hostname + normalizer)
 */
export function enforceCanonicalHost(): void {
  if (typeof window === 'undefined') return;

  const host = window.location.hostname;
  const needsRedirect = host.startsWith('www.') || host.endsWith('.lovable.app');

  if (!needsRedirect) return;

  // Inject noindex immediately (in case redirect doesn't fire before Googlebot snapshots)
  if (host.endsWith('.lovable.app')) {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow, noarchive';
    document.head.appendChild(meta);

    const existingRobots = document.querySelector('meta[name="robots"]');
    if (existingRobots && existingRobots !== meta) {
      existingRobots.setAttribute('content', 'noindex, nofollow, noarchive');
    }

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonical) {
      canonical.href = `${SITE_URL}${window.location.pathname.replace(/\/+$/, '') || ''}`;
    }
  }

  // Build fully normalized target URL in ONE hop:
  // - apex domain
  // - lowercase path
  // - no double slashes
  // - no trailing slash (except root)
  // - stripped tracking params
  let path = window.location.pathname;
  path = path.replace(/\/{2,}/g, '/');          // double slashes
  path = path.toLowerCase();                     // lowercase
  if (path.length > 1 && path.endsWith('/')) {
    path = path.replace(/\/+$/, '');             // trailing slash
  }

  // Strip tracking params
  let search = window.location.search;
  if (search) {
    const STRIP = new Set(['gclid', 'fbclid', 'ref', 'session', 'sort', 'filter', 'variant']);
    const params = new URLSearchParams(search);
    const toDelete: string[] = [];
    params.forEach((_, key) => {
      if (STRIP.has(key) || key.startsWith('utm_')) toDelete.push(key);
    });
    toDelete.forEach(k => params.delete(k));
    const remaining = params.toString();
    search = remaining ? `?${remaining}` : '';
  }

  window.location.replace(`${SITE_URL}${path}${search}${window.location.hash}`);
}

/**
 * Returns the robots.txt content appropriate for the current host.
 * Used by the client-side robots.txt route handler.
 */
export function getRobotsTxtForHost(): string | null {
  if (!isLovableAppHost()) return null; // Use static file on apex

  return `# Robots.txt for non-canonical host
# All indexing blocked — canonical host is https://getpawsy.pet
User-agent: *
Disallow: /
`;
}
