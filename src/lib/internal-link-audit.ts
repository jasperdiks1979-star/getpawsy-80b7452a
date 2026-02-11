/**
 * Internal Link Audit Engine (Read-Only Diagnostic)
 * 
 * Performs full internal link structure audit:
 * - Simulated crawl from known routes + guide index
 * - Broken link detection (404s, redirect chains)
 * - Orphan page validation
 * - Authority distribution analysis
 * - Cornerstone validation
 * - Sitemap consistency check
 */

import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';
import { analyzeInternalLinks, type LinkAnalysis } from './internal-link-matrix';
import { getAnchorText } from './anchor-text-helper';

// ============= TYPES =============

export interface CrawledPage {
  url: string;
  slug: string;
  type: 'static' | 'guide' | 'product' | 'blog' | 'collection' | 'utility' | 'admin';
  inboundLinks: InternalLink[];
  outboundLinks: InternalLink[];
  inSitemap: boolean;
  isIndexable: boolean; // false for noindex/utility pages
}

export interface InternalLink {
  sourcePage: string;
  targetPage: string;
  anchorText: string;
  relAttribute: string;
  httpStatus: number;
  redirectChain: string[];
}

export interface BrokenLink {
  sourcePage: string;
  targetPage: string;
  anchorText: string;
  statusCode: number;
  issue: 'not_found' | 'server_error' | 'redirect_chain' | 'canonical_mismatch';
}

export interface OrphanPage {
  slug: string;
  url: string;
  type: string;
  reason: string;
  linkedFromHomepage: boolean;
  linkedFromHub: boolean;
}

export interface AuthorityPage {
  slug: string;
  url: string;
  type: string;
  role: string;
  inboundCount: number;
  outboundCount: number;
  exactAnchorPercent: number;
  partialAnchorPercent: number;
  semanticAnchorPercent: number;
  overOptimized: boolean; // >45% exact
  underLinked: boolean;   // <3 inbound
  utilityWithExcessiveInbound: boolean;
}

export interface CornerstoneStatus {
  slug: string;
  inboundLinks: number;
  homepageLinkPresent: boolean;
  hubLinksPresent: boolean;
  anchorDistribution: {
    exact: number;
    partial: number;
    semantic: number;
    branded: number;
  };
  healthy: boolean;
  issues: string[];
}

export interface SitemapMismatch {
  url: string;
  issue: 'in_sitemap_not_crawlable' | 'crawlable_not_in_sitemap' | 'non_canonical_in_sitemap';
}

export interface LinkAuditReport {
  totalPagesCrawled: number;
  totalInternalLinks: number;
  brokenLinks: BrokenLink[];
  brokenLinksCount: number;
  redirectIssues: BrokenLink[];
  canonicalMismatches: BrokenLink[];
  orphanPages: OrphanPage[];
  orphanCount: number;
  authorityDistribution: AuthorityPage[];
  cornerstoneStatus: CornerstoneStatus[];
  sitemapMismatches: SitemapMismatch[];
  sitemapMismatchCount: number;
  utilityAuthorityLeakStatus: 'clean' | 'leaking';
  summary: {
    totalPagesCrawled: number;
    totalInternalLinks: number;
    brokenLinksCount: number;
    orphanCount: number;
    cornerstoneHealthy: number;
    cornerstoneTotal: number;
    utilityAuthorityLeakStatus: string;
    sitemapMismatchCount: number;
    overOptimizedCount: number;
    underLinkedCount: number;
  };
}

// ============= KNOWN ROUTES =============

const STATIC_PAGES = [
  { slug: '/', type: 'static' as const, indexable: true },
  { slug: '/products', type: 'static' as const, indexable: true },
  { slug: '/bestsellers', type: 'static' as const, indexable: true },
  { slug: '/blog', type: 'static' as const, indexable: true },
  { slug: '/about', type: 'static' as const, indexable: true },
  { slug: '/contact', type: 'static' as const, indexable: true },
  { slug: '/faq', type: 'static' as const, indexable: true },
  { slug: '/shipping', type: 'static' as const, indexable: true },
  { slug: '/privacy', type: 'static' as const, indexable: true },
  { slug: '/terms', type: 'static' as const, indexable: true },
  { slug: '/returns', type: 'static' as const, indexable: true },
  { slug: '/guides', type: 'static' as const, indexable: true },
  { slug: '/about-the-author', type: 'static' as const, indexable: true },
  { slug: '/editorial-guidelines', type: 'static' as const, indexable: true },
  { slug: '/how-we-test-products', type: 'static' as const, indexable: true },
  { slug: '/affiliate-disclosure', type: 'static' as const, indexable: true },
  { slug: '/security', type: 'static' as const, indexable: true },
  { slug: '/install', type: 'static' as const, indexable: true },
  { slug: '/live-map', type: 'static' as const, indexable: true },
  { slug: '/google-review', type: 'utility' as const, indexable: false },
];

const UTILITY_PAGES = [
  { slug: '/auth', type: 'utility' as const, indexable: false },
  { slug: '/cart', type: 'utility' as const, indexable: false },
  { slug: '/checkout', type: 'utility' as const, indexable: false },
  { slug: '/track', type: 'utility' as const, indexable: false },
  { slug: '/cookies', type: 'utility' as const, indexable: false },
  { slug: '/profile', type: 'utility' as const, indexable: false },
  { slug: '/orders', type: 'utility' as const, indexable: false },
  { slug: '/wishlist', type: 'utility' as const, indexable: false },
  { slug: '/payment-success', type: 'utility' as const, indexable: false },
  { slug: '/my-claims', type: 'utility' as const, indexable: false },
  { slug: '/unsubscribe', type: 'utility' as const, indexable: false },
  { slug: '/newsletter-preferences', type: 'utility' as const, indexable: false },
];

const ADMIN_PAGES = [
  { slug: '/admin', type: 'admin' as const, indexable: false },
  { slug: '/admin/guides-dashboard', type: 'admin' as const, indexable: false },
  { slug: '/admin/crawler-analytics', type: 'admin' as const, indexable: false },
];

// Sitemap-included page patterns
const SITEMAP_SLUGS = new Set([
  '/', '/products', '/bestsellers', '/blog', '/about', '/contact',
  '/faq', '/shipping', '/privacy', '/terms', '/returns', '/guides',
  '/about-the-author', '/editorial-guidelines', '/how-we-test-products',
  '/affiliate-disclosure', '/security', '/install', '/live-map',
]);

// ============= CRAWL ENGINE =============

function buildCrawledPages(): CrawledPage[] {
  const pages: CrawledPage[] = [];

  // Static pages
  for (const p of STATIC_PAGES) {
    pages.push({
      url: `https://getpawsy.pet${p.slug}`,
      slug: p.slug,
      type: p.type,
      inboundLinks: [],
      outboundLinks: [],
      inSitemap: SITEMAP_SLUGS.has(p.slug),
      isIndexable: p.indexable,
    });
  }

  // Utility pages
  for (const p of UTILITY_PAGES) {
    pages.push({
      url: `https://getpawsy.pet${p.slug}`,
      slug: p.slug,
      type: p.type,
      inboundLinks: [],
      outboundLinks: [],
      inSitemap: false,
      isIndexable: false,
    });
  }

  // Admin pages
  for (const p of ADMIN_PAGES) {
    pages.push({
      url: `https://getpawsy.pet${p.slug}`,
      slug: p.slug,
      type: p.type,
      inboundLinks: [],
      outboundLinks: [],
      inSitemap: false,
      isIndexable: false,
    });
  }

  // Guide pages from scaling guide index
  for (const guide of SCALING_GUIDES) {
    const slug = `/guides/${guide.slug}`;
    pages.push({
      url: `https://getpawsy.pet${slug}`,
      slug,
      type: 'guide',
      inboundLinks: [],
      outboundLinks: [],
      inSitemap: true, // All guides should be in sitemap
      isIndexable: true,
    });
  }

  return pages;
}

// ============= LINK GRAPH FROM GUIDE DATA =============

function buildLinkGraph(pages: CrawledPage[]): void {
  const pageMap = new Map(pages.map(p => [p.slug, p]));

  // Build links from guide linksTo data
  for (const guide of SCALING_GUIDES) {
    const sourceSlug = `/guides/${guide.slug}`;
    const sourcePage = pageMap.get(sourceSlug);
    if (!sourcePage) continue;

    for (const targetGuideSlug of guide.linksTo) {
      const targetSlug = `/guides/${targetGuideSlug}`;
      const targetPage = pageMap.get(targetSlug);

      const targetGuide = SCALING_GUIDES.find(g => g.slug === targetGuideSlug);
      const anchor = targetGuide?.primaryKW || targetGuideSlug;

      const link: InternalLink = {
        sourcePage: sourceSlug,
        targetPage: targetSlug,
        anchorText: anchor,
        relAttribute: '',
        httpStatus: targetPage ? 200 : 404,
        redirectChain: [],
      };

      sourcePage.outboundLinks.push(link);
      if (targetPage) {
        targetPage.inboundLinks.push(link);
      }
    }

    // Each guide links to cornerstone (homepage link simulation)
    const homepageLink: InternalLink = {
      sourcePage: sourceSlug,
      targetPage: '/',
      anchorText: 'GetPawsy',
      relAttribute: '',
      httpStatus: 200,
      redirectChain: [],
    };
    sourcePage.outboundLinks.push(homepageLink);
    const hp = pageMap.get('/');
    if (hp) hp.inboundLinks.push(homepageLink);
  }

  // Homepage links to guides index
  const hp = pageMap.get('/');
  const guidesPage = pageMap.get('/guides');
  if (hp && guidesPage) {
    const link: InternalLink = {
      sourcePage: '/',
      targetPage: '/guides',
      anchorText: 'Pet Guides',
      relAttribute: '',
      httpStatus: 200,
      redirectChain: [],
    };
    hp.outboundLinks.push(link);
    guidesPage.inboundLinks.push(link);
  }

  // Homepage → cornerstone guides (Popular Guides + mid-page sections)
  const cornerstoneGuides = [
    'best-cat-litter-box-2026',
    'best-dog-bed-2026',
    'best-cat-litter-box-furniture-enclosures-2026',
  ];
  if (hp) {
    // Hero insert links (partial anchors)
    for (const slug of cornerstoneGuides) {
      const targetSlug = `/guides/${slug}`;
      const targetPage = pageMap.get(targetSlug);
      const link: InternalLink = {
        sourcePage: '/',
        targetPage: targetSlug,
        anchorText: getAnchorText(slug, 'hero-insert'),
        relAttribute: '',
        httpStatus: targetPage ? 200 : 404,
        redirectChain: [],
      };
      hp.outboundLinks.push(link);
      if (targetPage) targetPage.inboundLinks.push(link);
    }
    // Mid-page cornerstone links (semantic anchors)
    for (const slug of cornerstoneGuides) {
      const targetSlug = `/guides/${slug}`;
      const targetPage = pageMap.get(targetSlug);
      const link: InternalLink = {
        sourcePage: '/',
        targetPage: targetSlug,
        anchorText: getAnchorText(slug, 'mid-page-cornerstone'),
        relAttribute: '',
        httpStatus: targetPage ? 200 : 404,
        redirectChain: [],
      };
      hp.outboundLinks.push(link);
      if (targetPage) targetPage.inboundLinks.push(link);
    }
  }

  // Homepage → hub guides (mid-page grid)
  const hubGuides = [
    'how-many-litter-boxes-per-cat',
    'best-orthopedic-dog-bed',
    'best-cat-trees-small-apartments',
  ];
  if (hp) {
    for (const slug of hubGuides) {
      const targetSlug = `/guides/${slug}`;
      const targetPage = pageMap.get(targetSlug);
      const link: InternalLink = {
        sourcePage: '/',
        targetPage: targetSlug,
        anchorText: getAnchorText(slug, 'mid-page-hub'),
        relAttribute: '',
        httpStatus: targetPage ? 200 : 404,
        redirectChain: [],
      };
      hp.outboundLinks.push(link);
      if (targetPage) targetPage.inboundLinks.push(link);
    }
  }

  // Footer → guide pages (branded/semantic anchors)
  const footerGuides = [
    { slug: 'best-cat-litter-box-2026', anchor: 'Litter Box Buying Guide' },
    { slug: 'best-cat-litter-box-furniture-enclosures-2026', anchor: 'Litter Box Furniture Picks' },
    { slug: 'best-litter-boxes-multi-cat', anchor: 'Multi-Cat Litter Solutions' },
    { slug: 'best-extra-large-litter-boxes', anchor: 'Jumbo Litter Box Picks' },
    { slug: 'how-many-litter-boxes-per-cat', anchor: 'The N+1 Litter Box Rule' },
  ];
  if (hp) {
    for (const { slug, anchor } of footerGuides) {
      const targetSlug = `/guides/${slug}`;
      const targetPage = pageMap.get(targetSlug);
      const link: InternalLink = {
        sourcePage: '/',
        targetPage: targetSlug,
        anchorText: anchor,
        relAttribute: '',
        httpStatus: targetPage ? 200 : 404,
        redirectChain: [],
      };
      hp.outboundLinks.push(link);
      if (targetPage) targetPage.inboundLinks.push(link);
    }
  }

  // Navbar/footer → static pages (global navigation, simulated from homepage)
  const globalNavTargets = [
    { target: '/products', anchor: 'Shop' },
    { target: '/bestsellers', anchor: 'Bestsellers' },
    { target: '/blog', anchor: 'Blog' },
    { target: '/about', anchor: 'About Us' },
    { target: '/contact', anchor: 'Contact' },
    { target: '/shipping', anchor: 'Shipping' },
    { target: '/returns', anchor: 'Returns' },
    { target: '/faq', anchor: 'FAQ' },
    { target: '/about-the-author', anchor: 'About the Author' },
    { target: '/editorial-guidelines', anchor: 'Editorial Guidelines' },
    { target: '/how-we-test-products', anchor: 'How We Test Products' },
    { target: '/affiliate-disclosure', anchor: 'Affiliate Disclosure' },
    { target: '/privacy', anchor: 'Privacy Policy' },
    { target: '/terms', anchor: 'Terms of Service' },
    { target: '/guides', anchor: 'Guides' },
  ];
  if (hp) {
    for (const { target, anchor } of globalNavTargets) {
      const targetPage = pageMap.get(target);
      if (!targetPage) continue;
      // Skip if already linked (e.g., /guides was added above)
      if (hp.outboundLinks.some(l => l.targetPage === target)) continue;
      const link: InternalLink = {
        sourcePage: '/',
        targetPage: target,
        anchorText: anchor,
        relAttribute: '',
        httpStatus: 200,
        redirectChain: [],
      };
      hp.outboundLinks.push(link);
      targetPage.inboundLinks.push(link);
    }
  }

  // Guides index links to all guide pages (simulated)
  if (guidesPage) {
    for (const guide of SCALING_GUIDES) {
      const targetSlug = `/guides/${guide.slug}`;
      const targetPage = pageMap.get(targetSlug);
      if (!targetPage) continue;

      const link: InternalLink = {
        sourcePage: '/guides',
        targetPage: targetSlug,
        anchorText: guide.title,
        relAttribute: '',
        httpStatus: 200,
        redirectChain: [],
      };
      guidesPage.outboundLinks.push(link);
      targetPage.inboundLinks.push(link);
    }
  }
}

// ============= BROKEN LINK DETECTION =============

function detectBrokenLinks(pages: CrawledPage[]): { broken: BrokenLink[]; redirects: BrokenLink[]; canonical: BrokenLink[] } {
  const pageSlugSet = new Set(pages.map(p => p.slug));
  const broken: BrokenLink[] = [];
  const redirects: BrokenLink[] = [];
  const canonical: BrokenLink[] = [];

  for (const page of pages) {
    for (const link of page.outboundLinks) {
      // Check if target exists
      if (!pageSlugSet.has(link.targetPage)) {
        broken.push({
          sourcePage: link.sourcePage,
          targetPage: link.targetPage,
          anchorText: link.anchorText,
          statusCode: 404,
          issue: 'not_found',
        });
      }

      // Check redirect chains
      if (link.redirectChain.length > 1) {
        redirects.push({
          sourcePage: link.sourcePage,
          targetPage: link.targetPage,
          anchorText: link.anchorText,
          statusCode: 301,
          issue: 'redirect_chain',
        });
      }
    }
  }

  // Check for links to non-canonical URLs (e.g., bestseller pages linking as primary)
  for (const page of pages) {
    for (const link of page.outboundLinks) {
      if (link.targetPage.startsWith('/bestseller/')) {
        canonical.push({
          sourcePage: link.sourcePage,
          targetPage: link.targetPage,
          anchorText: link.anchorText,
          statusCode: 200,
          issue: 'canonical_mismatch',
        });
      }
    }
  }

  return { broken, redirects, canonical };
}

// ============= ORPHAN DETECTION =============

function detectOrphanPages(pages: CrawledPage[]): OrphanPage[] {
  const orphans: OrphanPage[] = [];
  const hubSlugs = new Set(
    SCALING_GUIDES.filter(g => g.role === 'hub').map(g => `/guides/${g.slug}`)
  );

  for (const page of pages) {
    if (!page.isIndexable) continue; // Skip utility/admin pages
    if (page.slug === '/') continue; // Homepage can't be orphan

    const hasInbound = page.inboundLinks.length > 0;
    const linkedFromHomepage = page.inboundLinks.some(l => l.sourcePage === '/');
    const linkedFromHub = page.inboundLinks.some(l => hubSlugs.has(l.sourcePage));
    const linkedFromGuidesIndex = page.inboundLinks.some(l => l.sourcePage === '/guides');

    if (!hasInbound) {
      orphans.push({
        slug: page.slug,
        url: page.url,
        type: page.type,
        reason: 'No inbound links at all',
        linkedFromHomepage: false,
        linkedFromHub: false,
      });
    } else if (page.type === 'guide' && !linkedFromGuidesIndex && !linkedFromHub) {
      orphans.push({
        slug: page.slug,
        url: page.url,
        type: page.type,
        reason: 'Not linked from guides index or any hub',
        linkedFromHomepage,
        linkedFromHub: false,
      });
    }
  }

  return orphans;
}

// ============= AUTHORITY DISTRIBUTION =============

function analyzeAuthorityDistribution(pages: CrawledPage[]): AuthorityPage[] {
  return pages
    .filter(p => p.isIndexable)
    .map(page => {
      const guide = SCALING_GUIDES.find(g => `/guides/${g.slug}` === page.slug);
      const role = guide?.role || (page.type === 'static' ? 'page' : page.type);

      // Anchor text classification (heuristic)
      const anchors = page.inboundLinks.map(l => l.anchorText.toLowerCase());
      const primaryKW = guide?.primaryKW?.toLowerCase() || '';
      const secondaryKWs = (guide?.secondaryKWs || []).map(k => k.toLowerCase());

      let exact = 0, partial = 0, semantic = 0, branded = 0;
      for (const anchor of anchors) {
        if (!anchor) continue;
        if (anchor === primaryKW) {
          exact++;
        } else if (primaryKW && anchor.includes(primaryKW.split(' ')[0])) {
          partial++;
        } else if (anchor.includes('getpawsy') || anchor.includes('pawsy')) {
          branded++;
        } else if (secondaryKWs.some(kw => anchor.includes(kw.split(' ')[0]))) {
          semantic++;
        } else {
          partial++; // Default to partial
        }
      }

      const total = anchors.length || 1;
      const exactPct = Math.round((exact / total) * 100);
      const partialPct = Math.round((partial / total) * 100);
      const semanticPct = Math.round((semantic / total) * 100);

      const isUtility = page.type === 'utility';

      return {
        slug: page.slug,
        url: page.url,
        type: page.type,
        role,
        inboundCount: page.inboundLinks.length,
        outboundCount: page.outboundLinks.length,
        exactAnchorPercent: exactPct,
        partialAnchorPercent: partialPct,
        semanticAnchorPercent: semanticPct,
        overOptimized: exactPct > 30,
        underLinked: page.inboundLinks.length < 3 && page.type === 'guide',
        utilityWithExcessiveInbound: isUtility && page.inboundLinks.length > 10,
      };
    })
    .sort((a, b) => b.inboundCount - a.inboundCount);
}

// ============= CORNERSTONE VALIDATION =============

function validateCornerstones(pages: CrawledPage[]): CornerstoneStatus[] {
  const cornerstones = SCALING_GUIDES.filter(g => g.role === 'cornerstone');

  return cornerstones.map(cs => {
    const slug = `/guides/${cs.slug}`;
    const page = pages.find(p => p.slug === slug);
    const inboundLinks = page?.inboundLinks || [];

    const homepageLinkPresent = inboundLinks.some(l => l.sourcePage === '/');
    const hubSlugs = new Set(
      SCALING_GUIDES.filter(g => g.role === 'hub' && g.cluster === cs.cluster).map(g => `/guides/${g.slug}`)
    );
    const hubLinksPresent = inboundLinks.some(l => hubSlugs.has(l.sourcePage));

    // Anchor distribution
    const anchors = inboundLinks.map(l => l.anchorText.toLowerCase());
    const primaryKW = cs.primaryKW.toLowerCase();
    let exact = 0, partial = 0, semantic = 0, branded = 0;
    for (const anchor of anchors) {
      if (anchor === primaryKW) exact++;
      else if (anchor.includes('getpawsy') || anchor.includes('pawsy')) branded++;
      else if (primaryKW && anchor.includes(primaryKW.split(' ')[0])) partial++;
      else semantic++;
    }

    const total = anchors.length || 1;
    const issues: string[] = [];

    if (!homepageLinkPresent) issues.push('Not linked from homepage');
    if (!hubLinksPresent) issues.push('No hub links in same cluster');
    if (inboundLinks.length < 8) issues.push(`Only ${inboundLinks.length} inbound links (target: 8+)`);
    if (Math.round((exact / total) * 100) > 30) issues.push('Over-optimized anchor distribution (>30% exact)');

    return {
      slug: cs.slug,
      inboundLinks: inboundLinks.length,
      homepageLinkPresent,
      hubLinksPresent,
      anchorDistribution: {
        exact: Math.round((exact / total) * 100),
        partial: Math.round((partial / total) * 100),
        semantic: Math.round((semantic / total) * 100),
        branded: Math.round((branded / total) * 100),
      },
      healthy: issues.length === 0,
      issues,
    };
  });
}

// ============= SITEMAP CONSISTENCY =============

function checkSitemapConsistency(pages: CrawledPage[]): SitemapMismatch[] {
  const mismatches: SitemapMismatch[] = [];

  for (const page of pages) {
    // In sitemap but not indexable
    if (page.inSitemap && !page.isIndexable) {
      mismatches.push({
        url: page.url,
        issue: 'non_canonical_in_sitemap',
      });
    }

    // Indexable but not in sitemap (for guide pages)
    if (page.isIndexable && !page.inSitemap && page.type === 'guide') {
      // All guides should be in sitemap; if not tracked, flag it
      // This is a heuristic—real check would compare to actual sitemap XML
    }

    // Static indexable pages not in sitemap
    if (page.isIndexable && !page.inSitemap && page.type === 'static') {
      mismatches.push({
        url: page.url,
        issue: 'crawlable_not_in_sitemap',
      });
    }
  }

  return mismatches;
}

// ============= MAIN AUDIT =============

export function runInternalLinkAudit(): LinkAuditReport {
  // Step 1: Build page map
  const pages = buildCrawledPages();

  // Step 2: Build link graph
  buildLinkGraph(pages);

  // Step 3: Broken links
  const { broken, redirects, canonical } = detectBrokenLinks(pages);

  // Step 4: Orphans
  const orphans = detectOrphanPages(pages);

  // Step 5: Authority distribution
  const authority = analyzeAuthorityDistribution(pages);

  // Step 6: Cornerstone validation
  const cornerstones = validateCornerstones(pages);

  // Step 7: Sitemap consistency
  const sitemapMismatches = checkSitemapConsistency(pages);

  // Count total links
  const totalLinks = pages.reduce((sum, p) => sum + p.outboundLinks.length, 0);

  // Utility authority leak check
  const utilityPages = authority.filter(a => a.utilityWithExcessiveInbound);
  const utilityLeakStatus = utilityPages.length > 0 ? 'leaking' as const : 'clean' as const;

  return {
    totalPagesCrawled: pages.length,
    totalInternalLinks: totalLinks,
    brokenLinks: broken,
    brokenLinksCount: broken.length,
    redirectIssues: redirects,
    canonicalMismatches: canonical,
    orphanPages: orphans,
    orphanCount: orphans.length,
    authorityDistribution: authority,
    cornerstoneStatus: cornerstones,
    sitemapMismatches,
    sitemapMismatchCount: sitemapMismatches.length,
    utilityAuthorityLeakStatus: utilityLeakStatus,
    summary: {
      totalPagesCrawled: pages.length,
      totalInternalLinks: totalLinks,
      brokenLinksCount: broken.length,
      orphanCount: orphans.length,
      cornerstoneHealthy: cornerstones.filter(c => c.healthy).length,
      cornerstoneTotal: cornerstones.length,
      utilityAuthorityLeakStatus: utilityLeakStatus,
      sitemapMismatchCount: sitemapMismatches.length,
      overOptimizedCount: authority.filter(a => a.overOptimized).length,
      underLinkedCount: authority.filter(a => a.underLinked).length,
    },
  };
}
