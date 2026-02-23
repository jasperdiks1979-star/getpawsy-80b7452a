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
  const h = window.location.hostname;
  return h === CANONICAL_HOST || h === `www.${CANONICAL_HOST}`;
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
export function enforceCanonicalHost(): void {
  if (typeof window === 'undefined') return;

  const host = window.location.hostname;

  // www → apex (already handled in main.tsx, but belt-and-suspenders)
  if (host.startsWith('www.')) {
    window.location.replace(
      `${SITE_URL}${window.location.pathname}${window.location.search}${window.location.hash}`
    );
    return;
  }

  // lovable.app → inject noindex + redirect to apex
  if (host.endsWith('.lovable.app')) {
    // 1) Inject noindex meta immediately
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow, noarchive';
    document.head.appendChild(meta);

    // 2) Override any existing robots meta
    const existingRobots = document.querySelector('meta[name="robots"]');
    if (existingRobots && existingRobots !== meta) {
      existingRobots.setAttribute('content', 'noindex, nofollow, noarchive');
    }

    // 3) Set canonical to apex
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonical) {
      canonical.href = `${SITE_URL}${window.location.pathname.replace(/\/+$/, '') || ''}`;
    }

    // 4) Redirect to apex (preserving path + query + hash)
    window.location.replace(
      `${SITE_URL}${window.location.pathname}${window.location.search}${window.location.hash}`
    );
  }
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
