/**
 * SEO Robots Policy — Single source of truth for index/noindex decisions.
 *
 * Every route on getpawsy.pet is classified as either:
 *   - INDEXABLE  → "index, follow, max-image-preview:large, max-snippet:-1"
 *   - NOINDEX    → "noindex, nofollow"
 *   - NOINDEX_FOLLOW → "noindex, follow"  (preserves link equity)
 *
 * Rules:
 *   1. Public SEO pages (products, guides, collections, blog, static) → INDEXABLE
 *   2. Utility/system pages (cart, auth, admin, search, etc.) → NOINDEX
 *   3. Query-string / filter / sort URLs → NOINDEX_FOLLOW
 *   4. Tier C products → handled at component level (noindex, follow)
 *   5. Non-canonical hosts (lovable.app) → handled by HostnameGuard
 */

export type RobotsDirective = 'index' | 'noindex' | 'noindex-follow';

/**
 * Paths that must NEVER be indexed.
 * Prefix-matched: /admin also blocks /admin/foo/bar.
 */
const NOINDEX_PREFIXES: string[] = [
  '/admin',
  '/api',
  '/private',
  '/dashboard',
  '/diagnostics',
  '/debug',
  '/__ops',
  '/healthz',
  '/founder-mode',
  '/cart',
  '/checkout',
  '/account',
  '/auth',
  '/profile',
  '/orders',
  '/search',
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
  '/compliance',
  '/merchant-fix-checklist',
  // Reduce footprint: noindex low-value / duplicate / off-niche pages
  '/bestsellers',
  '/trending-pet-products',
  '/recent-products',
  '/shop',
  '/products',
  '/pet-care-guides',
  '/site-map',
  '/how-we-test-products',
  '/why-trust-our-reviews',
  '/about-the-author',
  '/affiliate-disclosure',
  '/editorial-guidelines',
  '/lp/',
  '/best-cat-litter-box-2026',
  '/best-dog-car-seat-safety',
  '/best-interactive-cat-toys',
  '/best-dog-anxiety-solutions',
  '/best-cat-litter-box-reddit',
  '/best-litter-box-for-smell',
  '/best-litter-box-large-cats',
  '/best-litter-boxes-apartments-2026',
  '/slow-feeder-dog-bowls',
  '/indoor-cat-furniture',
];

/**
 * Specific guide slugs that are off-niche or thin content → noindex.
 */
const NOINDEX_GUIDE_SLUGS: string[] = [
  'how-to-choose-guinea-pig-cage',
  'guinea-pig-cage-vs-playpen',
  'outdoor-dog-games-enrichment',
  'outdoor-dog-games-2026',
  'summer-dog-activities',
  'backyard-enrichment-for-dogs',
  'how-to-tire-out-a-dog-fast',
];

/**
 * Paths that are explicitly INDEXABLE (safety-net allowlist).
 * These override any accidental noindex from shared components.
 */
const INDEXABLE_PREFIXES: string[] = [
  '/product/',
  '/products',
  '/collections/',
  '/guides/',
  '/pet-care-guides',
  '/blog/',
  '/blog',
  '/about',
  '/contact',
  '/faq',
  '/shipping',
  '/returns',
  '/privacy',
  '/terms',
  '/cookies',
  '/policies/',
  '/affiliate-disclosure',
  '/how-we-test-products',
  '/why-trust-our-reviews',
  '/about-the-author',
  '/editorial-guidelines',
  '/bestseller/',
  '/bestsellers',
  '/dog/',
  '/dog',
  '/cat/',
  '/cat',
  '/shop',
  '/site-map',
  '/trending-pet-products',
  '/recent-products',
  '/slow-feeder-dog-bowls',
  '/indoor-cat-furniture',
  '/resources/',
  '/lp/',
  '/best-',
];

/**
 * Determine the robots directive for a given path.
 * @param pathname — e.g. "/guides/best-cat-toys"
 * @param search   — e.g. "?sort=price" (include the "?")
 */
export function getRobotsDirective(pathname: string, search: string = ''): RobotsDirective {
  const clean = pathname.replace(/\/+$/, '') || '/';

  // Query-string pages (filter/sort/tracking) → noindex but follow
  if (search && search !== '?') {
    // Exception: some query params are fine (e.g. page param on blog)
    // But generally, filter/sort/tracking params should be noindex
    const params = new URLSearchParams(search);
    const dominated = ['sort', 'filter', 'variant', 'gclid', 'fbclid', 'ref', 'session'];
    const hasTracking = dominated.some(k => params.has(k)) ||
      Array.from(params.keys()).some(k => k.startsWith('utm_'));
    if (hasTracking) return 'noindex-follow';
  }

  // Exact match: homepage is always indexable
  if (clean === '/') return 'index';

  // NOINDEX prefixes
  for (const prefix of NOINDEX_PREFIXES) {
    if (clean === prefix || clean.startsWith(prefix + '/')) return 'noindex';
  }

  // INDEXABLE prefixes (safety-net)
  for (const prefix of INDEXABLE_PREFIXES) {
    if (clean === prefix || clean.startsWith(prefix)) return 'index';
  }

  // Default: index (public pages should be indexable)
  return 'index';
}

/**
 * Convert directive to robots meta content string.
 */
export function getRobotsContent(directive: RobotsDirective): string {
  switch (directive) {
    case 'index':
      return 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
    case 'noindex':
      return 'noindex, nofollow';
    case 'noindex-follow':
      return 'noindex, follow';
  }
}
