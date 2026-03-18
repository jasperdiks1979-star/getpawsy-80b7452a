/**
 * Hostname Guard — utility functions for canonical host detection.
 *
 * IMPORTANT: All hostname redirects (www → apex, lovable.app → apex) are
 * handled exclusively by Cloudflare 301 rules and public/_redirects.
 * This module must NOT perform any window.location redirects.
 *
 * Retained utilities:
 * - isCanonicalHost(): used by URL normalizer
 * - isLovableAppHost(): used by HostnameGuard component (noindex meta)
 * - getRobotsTxtForHost(): used by client-side robots.txt route
 */

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
