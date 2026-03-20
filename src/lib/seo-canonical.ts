/**
 * SEO Canonical URL Utilities
 * 
 * Centralizes canonical URL generation to ensure:
 * - Always apex domain (https://getpawsy.pet)
 * - No trailing slashes
 * - No query parameters / UTM / tracking params
 * - Single source of truth for canonical logic
 */

import { SITE_URL } from '@/lib/constants';

/**
 * Strip query params, trailing slashes, and enforce apex canonical.
 * Homepage always gets trailing slash per Google convention.
 */
export function buildCanonicalUrl(path: string): string {
  // Remove query string and hash
  const cleanPath = path.split('?')[0].split('#')[0];
  // Normalize: collapse double slashes, lowercase, strip trailing slash
  let normalizedPath = cleanPath.replace(/\/{2,}/g, '/').toLowerCase();
  if (normalizedPath.length > 1) normalizedPath = normalizedPath.replace(/\/+$/, '');
  // Homepage gets trailing slash
  if (normalizedPath === '/' || normalizedPath === '') {
    return `${SITE_URL}/`;
  }
  return `${SITE_URL}${normalizedPath}`;
}

/**
 * Pages that should NEVER be indexed.
 * Used by NoIndexMeta and sitemap generators.
 */
export const NOINDEX_PATHS = new Set([
  '/cart',
  '/compliance',
  '/checkout',
  '/account',
  '/auth',
  '/profile',
  '/orders',
  '/search',
  '/admin',
  '/dashboard',
  '/diagnostics',
  '/wishlist',
  '/payment-success',
  '/thank-you',
  '/track',
  '/my-claims',
  '/unsubscribe',
  '/newsletter-preferences',
  '/live-map',
  '/install',
  '/google-review',
  '/slow-feeder-offer',
  '/download-ads',
  '/technical-declaration',
  '/appeal-response',
  '/security',
  '/privacy-policy-iframe',
  '/terms-iframe',
]);

/**
 * Check if a given path should be noindexed.
 */
export function shouldNoindex(path: string): boolean {
  const cleanPath = path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  
  // Exact match
  if (NOINDEX_PATHS.has(cleanPath)) return true;
  
  // Prefix match (e.g. /admin/*)
  for (const noindexPath of NOINDEX_PATHS) {
    if (cleanPath.startsWith(noindexPath + '/')) return true;
  }
  
  // Any URL with query parameters should be noindex
  if (path.includes('?')) return true;
  
  return false;
}
