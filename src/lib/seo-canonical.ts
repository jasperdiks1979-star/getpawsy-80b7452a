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
import { ROOT_GUIDE_CONSOLIDATION } from './seo-root-consolidation';

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
  // Root duplicates of an established guide canonicalize to that guide.
  return `${SITE_URL}${ROOT_GUIDE_CONSOLIDATION[normalizedPath] ?? normalizedPath}`;
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
  '/debug',
  '/__ops',
  '/healthz',
  '/founder-mode',
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
  '/merchant-fix-checklist',
  '/api',
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
