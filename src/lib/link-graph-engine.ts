/**
 * Link Graph Engine v1
 * 
 * Crawl-based internal link graph builder + orphan detector + impression lift planner.
 * Runs in-browser against the deployed site.
 */

export interface LinkNode {
  url: string;
  slug: string;
  pageType: 'product' | 'blog' | 'guide' | 'collection' | 'static' | 'hub' | 'unknown';
  inlinks: string[];
  outlinks: string[];
  inSitemap: boolean;
  isIndexable: boolean;
}

export interface LinkGraphResult {
  nodes: LinkNode[];
  totalPages: number;
  totalEdges: number;
  orphans: OrphanPage[];
  orphansByType: Record<string, number>;
}

export interface OrphanPage {
  slug: string;
  url: string;
  pageType: string;
  inlinkCount: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
}

export interface NearWinPage {
  url: string;
  slug: string;
  pageType: string;
  impressions: number;
  position: number;
  clicks: number;
  suggestedLinkSources: string[];
  suggestedLinkCount: number;
}

export interface ImpressionLiftPlan {
  nearWinPages: NearWinPage[];
  totalLinkPatches: number;
  expectedCandidatesIn28d: number;
}

const CANONICAL_HOST = 'https://getpawsy.pet';

const NOINDEX_PATHS = [
  '/auth', '/cookies', '/track', '/cart', '/checkout', '/profile',
  '/orders', '/payment-success', '/wishlist', '/unsubscribe',
  '/newsletter-preferences', '/admin', '/dashboard', '/google-review',
  '/security', '/install', '/live-map', '/my-claims', '/slow-feeder-offer',
  '/download-ads', '/technical-declaration', '/appeal-response',
  '/privacy-policy-iframe', '/terms-iframe',
];

function classifyUrl(path: string): LinkNode['pageType'] {
  if (path === '/' || path === '') return 'hub';
  if (path.startsWith('/products/') || path.startsWith('/product-')) return 'product';
  if (path.startsWith('/blog/') || path === '/blog') return 'blog';
  if (path.startsWith('/guides/') || path === '/guides') return 'guide';
  if (path.startsWith('/collections/') || path.startsWith('/c/')) return 'collection';
  if (path === '/cats' || path === '/dogs' || path.startsWith('/cats/') || path.startsWith('/dogs/')) return 'hub';
  if (['/about', '/contact', '/faq', '/shipping', '/privacy', '/terms', '/returns', '/bestsellers', '/products'].includes(path)) return 'static';
  return 'unknown';
}

function normalizePath(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.origin !== CANONICAL_HOST && url.origin !== base) return null;
    // Strip trailing slash, utm params
    let path = url.pathname.replace(/\/$/, '') || '/';
    return path;
  } catch {
    return null;
  }
}

function isNoindex(path: string): boolean {
  return NOINDEX_PATHS.some(r => path === r || path.startsWith(r + '/'));
}

/**
 * Build link graph from known pages (database-driven, not live crawl).
 * This avoids CORS issues with in-browser fetching.
 */
export function buildLinkGraphFromData(
  pages: Array<{ slug: string; type: string; url: string; outlinks?: string[] }>,
  sitemapSlugs: Set<string>
): LinkGraphResult {
  const nodeMap = new Map<string, LinkNode>();

  // Create nodes
  for (const page of pages) {
    const path = '/' + page.slug;
    nodeMap.set(path, {
      url: page.url,
      slug: page.slug,
      pageType: page.type as LinkNode['pageType'],
      inlinks: [],
      outlinks: page.outlinks || [],
      inSitemap: sitemapSlugs.has(page.slug),
      isIndexable: !isNoindex(path),
    });
  }

  // Build edges
  let totalEdges = 0;
  for (const [path, node] of nodeMap) {
    for (const target of node.outlinks) {
      const targetNode = nodeMap.get(target);
      if (targetNode) {
        targetNode.inlinks.push(path);
        totalEdges++;
      }
    }
  }

  // Find orphans
  const orphans: OrphanPage[] = [];
  for (const [path, node] of nodeMap) {
    if (!node.isIndexable) continue;
    
    const contextualInlinks = node.inlinks.filter(src => {
      // Exclude sitemap-only or pagination-only sources
      return src !== '/sitemap.xml' && !src.includes('?page=');
    });

    if (contextualInlinks.length === 0) {
      const severity = node.pageType === 'guide' || node.pageType === 'product' ? 'critical'
        : node.pageType === 'collection' ? 'high'
        : node.pageType === 'blog' ? 'medium'
        : 'low';

      orphans.push({
        slug: node.slug,
        url: node.url,
        pageType: node.pageType,
        inlinkCount: 0,
        severity,
        reason: contextualInlinks.length === 0 ? 'Zero contextual inlinks' : 'Only sitemap/pagination links',
      });
    }
  }

  // Group orphans by type
  const orphansByType: Record<string, number> = {};
  for (const o of orphans) {
    orphansByType[o.pageType] = (orphansByType[o.pageType] || 0) + 1;
  }

  return {
    nodes: Array.from(nodeMap.values()),
    totalPages: nodeMap.size,
    totalEdges,
    orphans,
    orphansByType,
  };
}

/**
 * Select "Near-Win" pages: position 10–25, impressions 5–29.
 * Then suggest link sources from strongest pages.
 */
export function buildImpressionLiftPlan(
  gscPages: Array<{ url: string; slug: string; impressions: number; clicks: number; position: number; pageType: string }>,
  strongPages: Array<{ slug: string; impressions: number }>
): ImpressionLiftPlan {
  // Filter near-win candidates
  const nearWin = gscPages.filter(p =>
    p.position >= 10 && p.position <= 25 &&
    p.impressions >= 5 && p.impressions < 30 &&
    !isNoindex('/' + p.slug)
  );

  // Sort strong pages by impressions desc for link source selection
  const sorted = [...strongPages].sort((a, b) => b.impressions - a.impressions);
  const topSources = sorted.slice(0, 20).map(p => p.slug);

  let totalPatches = 0;
  const nearWinPages: NearWinPage[] = nearWin.map(p => {
    // Suggest 6-12 link sources based on page type
    const linkCount = p.pageType === 'product' ? 8 : p.pageType === 'guide' ? 10 : 6;
    const sources = topSources
      .filter(s => s !== p.slug)
      .slice(0, linkCount);
    totalPatches += sources.length;

    return {
      url: p.url,
      slug: p.slug,
      pageType: p.pageType,
      impressions: p.impressions,
      position: p.position,
      clicks: p.clicks,
      suggestedLinkSources: sources,
      suggestedLinkCount: sources.length,
    };
  });

  return {
    nearWinPages,
    totalLinkPatches: totalPatches,
    expectedCandidatesIn28d: Math.ceil(nearWinPages.length * 0.4), // Conservative 40% lift estimate
  };
}

/**
 * Guide Index Report: audit all guide slugs for indexability.
 */
export interface GuideIndexEntry {
  slug: string;
  url: string;
  hasCanonical: boolean;
  inSitemap: boolean;
  internalLinksCount: number;
  status: 'indexed' | 'likely_indexed' | 'not_indexed';
  issues: string[];
}

export function buildGuideIndexReport(
  guideSlugs: string[],
  sitemapSlugs: Set<string>,
  internalLinksMap: Map<string, number>
): GuideIndexEntry[] {
  return guideSlugs.map(slug => {
    const url = `${CANONICAL_HOST}/guides/${slug}`;
    const inSitemap = sitemapSlugs.has(`guides/${slug}`);
    const internalLinksCount = internalLinksMap.get(`guides/${slug}`) || 0;
    const issues: string[] = [];

    if (!inSitemap) issues.push('Missing from sitemap');
    if (internalLinksCount === 0) issues.push('Zero internal links pointing to this guide');
    if (internalLinksCount < 3) issues.push('Fewer than 3 internal links');

    const status = inSitemap && internalLinksCount >= 2 ? 'likely_indexed'
      : inSitemap ? 'likely_indexed'
      : 'not_indexed';

    return {
      slug,
      url,
      hasCanonical: true, // GuidePage always sets canonical
      inSitemap,
      internalLinksCount,
      status,
      issues,
    };
  });
}
