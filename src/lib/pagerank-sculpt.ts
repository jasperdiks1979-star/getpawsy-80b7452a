/**
 * PageRank Sculpt Utility
 * 
 * Identifies low-value link targets that waste crawl budget and dilute
 * internal PageRank away from money collections. Used by admin diagnostics
 * and the internal linking engine to prune/nofollow low-value links.
 */

import { MONEY_COLLECTION_SLUGS } from './money-collections';

/** Pages that should receive LESS internal link equity */
export const LOW_VALUE_TARGETS = new Set([
  // Utility / support pages
  '/privacy',
  '/terms',
  '/cookie-policy',
  '/accessibility',
  // Paginated / filtered URLs
  '/blog?page=2',
  '/blog?page=3',
  '/blog?page=4',
  '/products?page=2',
  '/products?page=3',
  // Thin tag pages
  '/tags/',
  // Expired promotions
  '/deals',
  '/flash-sale',
  // Low-intent info pages
  '/sitemap',
  '/careers',
]);

/** URL patterns that should be nofollow when encountered as internal links */
export const NOFOLLOW_PATTERNS: RegExp[] = [
  /[?&]sort=/,
  /[?&]filter=/,
  /[?&]page=[2-9]/,
  /[?&]page=\d{2,}/,
  /\/tags\//,
  /\/search\?/,
];

/** Check if an internal link target is low-value */
export function isLowValueTarget(href: string): boolean {
  if (LOW_VALUE_TARGETS.has(href)) return true;
  return NOFOLLOW_PATTERNS.some(pattern => pattern.test(href));
}

/** Check if a link points to a money collection (high-value) */
export function isMoneyTarget(href: string): boolean {
  for (const slug of MONEY_COLLECTION_SLUGS) {
    if (href === `/collections/${slug}` || href.startsWith(`/collections/${slug}?`)) {
      return true;
    }
  }
  return false;
}

/** Crawl depth map — max click distance from homepage */
export const MAX_CRAWL_DEPTH: Record<string, number> = {
  homepage: 0,
  moneyCollection: 1,
  productPage: 2,
  blogPost: 2,
  supportArticle: 3,
  subCollection: 2,
};

export interface LinkAuditResult {
  totalLinks: number;
  moneyCollectionLinks: number;
  lowValueLinks: number;
  nofollowCandidates: number;
  depthViolations: number;
  sculptScore: number; // 0-100 (100 = perfect sculpting)
}

/** Audit a set of internal link hrefs for PageRank sculpting quality */
export function auditLinkSculpting(hrefs: string[]): LinkAuditResult {
  let moneyCollectionLinks = 0;
  let lowValueLinks = 0;
  let nofollowCandidates = 0;

  for (const href of hrefs) {
    if (isMoneyTarget(href)) moneyCollectionLinks++;
    if (isLowValueTarget(href)) {
      lowValueLinks++;
      nofollowCandidates++;
    }
  }

  const totalLinks = hrefs.length;
  const moneyRatio = totalLinks > 0 ? moneyCollectionLinks / totalLinks : 0;
  const wasteRatio = totalLinks > 0 ? lowValueLinks / totalLinks : 0;

  // Score: maximize money link ratio, minimize waste
  const sculptScore = Math.round(
    Math.min(100, (moneyRatio * 60 + (1 - wasteRatio) * 40) * 100)
  );

  return {
    totalLinks,
    moneyCollectionLinks,
    lowValueLinks,
    nofollowCandidates,
    depthViolations: 0, // requires runtime crawl data
    sculptScore,
  };
}

/** Sitemap priority weights based on page type */
export const SITEMAP_WEIGHTS = {
  homepage: 1.0,
  moneyCollection: 0.95,
  tier1Product: 0.85,
  pillarGuide: 0.90,
  standardCollection: 0.80,
  clusterArticle: 0.75,
  blogPost: 0.65,
  tier2Product: 0.70,
  productPage: 0.55,
  utilityPage: 0.30,
} as const;

/** Get sitemap priority for a URL — revenue-tier aware */
export function getSitemapPriority(url: string): number {
  // Delegate to revenue tier engine for tier-aware priorities
  try {
    const { getRevenueSitemapPriority } = require('./revenue-tier-engine');
    return getRevenueSitemapPriority(url);
  } catch {
    // Fallback to static weights if engine not available
    return getSitemapPriorityFallback(url);
  }
}

/** Static fallback (original logic) */
function getSitemapPriorityFallback(url: string): number {
  if (url === '/' || url === '') return SITEMAP_WEIGHTS.homepage;
  
  for (const slug of MONEY_COLLECTION_SLUGS) {
    if (url === `/collections/${slug}`) return SITEMAP_WEIGHTS.moneyCollection;
  }
  
  if (url.startsWith('/collections/')) return SITEMAP_WEIGHTS.standardCollection;
  if (url.startsWith('/guides/') || url.startsWith('/dog/') || url.startsWith('/cat/')) return SITEMAP_WEIGHTS.pillarGuide;
  if (url.startsWith('/blog/')) return SITEMAP_WEIGHTS.blogPost;
  if (url.startsWith('/products/')) return SITEMAP_WEIGHTS.productPage;
  
  return SITEMAP_WEIGHTS.utilityPage;
}
