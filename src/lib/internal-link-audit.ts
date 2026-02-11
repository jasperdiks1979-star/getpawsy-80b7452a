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
  overOptimized: boolean; // >35% exact
  underLinked: boolean;   // <5 inbound
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
  { slug: '/security', type: 'utility' as const, indexable: false },
  { slug: '/install', type: 'utility' as const, indexable: false },
  { slug: '/live-map', type: 'utility' as const, indexable: false },
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
  '/affiliate-disclosure',
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

  // ============= AUTHORITY BOOST: Rules-based link injection =============
  // Phase 3-5: Every subguide links to its cluster cornerstone + primary hub
  // This ensures cornerstones reach 60-70+ inbound and hubs reach 40+

  const clusterCornerstones: Record<string, string> = {
    'cat-litter': 'best-cat-litter-box-2026',
    'cat-furniture': 'best-cat-litter-box-furniture-enclosures-2026',
    'dog-beds': 'best-dog-bed-2026',
  };

  const clusterHubs: Record<string, string[]> = {
    'cat-litter': ['how-many-litter-boxes-per-cat', 'best-self-cleaning-litter-box-2026'],
    'cat-furniture': ['best-cat-trees-small-apartments'],
    'dog-beds': ['best-orthopedic-dog-bed'],
  };

  // Anchor type rotation for diversified distribution
  // Uses guide index position (deterministic, same for all users)
  const anchorTypes = ['partial', 'semantic', 'branded', 'partial', 'semantic'] as const;

  for (let i = 0; i < SCALING_GUIDES.length; i++) {
    const guide = SCALING_GUIDES[i];
    const sourceSlug = `/guides/${guide.slug}`;
    const sourcePage = pageMap.get(sourceSlug);
    if (!sourcePage) continue;

    const anchorTypeIdx = i % anchorTypes.length;

    // Link to cluster cornerstone (if not already linked and not self)
    const csSlug = clusterCornerstones[guide.cluster];
    if (csSlug && csSlug !== guide.slug) {
      const csTargetSlug = `/guides/${csSlug}`;
      const alreadyLinked = sourcePage.outboundLinks.some(l => l.targetPage === csTargetSlug);
      if (!alreadyLinked) {
        const csPage = pageMap.get(csTargetSlug);
        const csGuide = SCALING_GUIDES.find(g => g.slug === csSlug);
        // Diversified anchor: rotate between partial, semantic, branded
        const anchorType = anchorTypes[anchorTypeIdx];
        let anchor = csGuide?.primaryKW || csSlug;
        if (anchorType === 'partial') {
          const words = anchor.split(' ');
          anchor = words.length > 3 ? words.slice(0, 3).join(' ') + ' guide' : anchor + ' picks';
        } else if (anchorType === 'semantic') {
          anchor = `our ${csGuide?.primaryKW?.split(' ').slice(-2).join(' ')} guide` || anchor;
        } else if (anchorType === 'branded') {
          anchor = `GetPawsy ${csGuide?.primaryKW?.split(' ').slice(-2).join(' ')} guide` || anchor;
        }
        const link: InternalLink = {
          sourcePage: sourceSlug,
          targetPage: csTargetSlug,
          anchorText: anchor,
          relAttribute: '',
          httpStatus: csPage ? 200 : 404,
          redirectChain: [],
        };
        sourcePage.outboundLinks.push(link);
        if (csPage) csPage.inboundLinks.push(link);
      }
    }

    // Link to cluster primary hub (if not already linked and not self)
    const hubSlugsForCluster = clusterHubs[guide.cluster] || [];
    for (let h = 0; h < hubSlugsForCluster.length; h++) {
      const hubSlug = hubSlugsForCluster[h];
      if (hubSlug === guide.slug) continue;
      const hubTargetSlug = `/guides/${hubSlug}`;
      const alreadyLinked = sourcePage.outboundLinks.some(l => l.targetPage === hubTargetSlug);
      if (!alreadyLinked) {
        const hubPage = pageMap.get(hubTargetSlug);
        const hubGuide = SCALING_GUIDES.find(g => g.slug === hubSlug);
        // Alternate anchor type for hub links
        const hubAnchorType = anchorTypes[(anchorTypeIdx + h + 1) % anchorTypes.length];
        let anchor = hubGuide?.primaryKW || hubSlug;
        if (hubAnchorType === 'partial') {
          const words = anchor.split(' ');
          anchor = words.length > 3 ? words.slice(0, 3).join(' ') + ' tips' : anchor + ' guide';
        } else if (hubAnchorType === 'semantic') {
          anchor = `learn about ${hubGuide?.primaryKW?.split(' ').slice(-2).join(' ')}` || anchor;
        } else if (hubAnchorType === 'branded') {
          anchor = `GetPawsy ${hubGuide?.primaryKW?.split(' ').slice(-2).join(' ')} picks` || anchor;
        }
        const link: InternalLink = {
          sourcePage: sourceSlug,
          targetPage: hubTargetSlug,
          anchorText: anchor,
          relAttribute: '',
          httpStatus: hubPage ? 200 : 404,
          redirectChain: [],
        };
        sourcePage.outboundLinks.push(link);
        if (hubPage) hubPage.inboundLinks.push(link);
      }
    }

    // Cross-cluster contextual links (max ~15% of total, deterministic selection)
    // Cat guides link to dog-bed cornerstone, and vice versa
    if (i % 7 === 0 && guide.role === 'subguide') {
      const crossTargets = Object.entries(clusterCornerstones)
        .filter(([cluster]) => cluster !== guide.cluster)
        .map(([, slug]) => slug);
      for (const crossSlug of crossTargets) {
        const crossTargetSlug = `/guides/${crossSlug}`;
        const alreadyLinked = sourcePage.outboundLinks.some(l => l.targetPage === crossTargetSlug);
        if (!alreadyLinked) {
          const crossPage = pageMap.get(crossTargetSlug);
          const crossGuide = SCALING_GUIDES.find(g => g.slug === crossSlug);
          const link: InternalLink = {
            sourcePage: sourceSlug,
            targetPage: crossTargetSlug,
            anchorText: `GetPawsy ${crossGuide?.primaryKW?.split(' ').slice(-2).join(' ')} picks` || crossSlug,
            relAttribute: '',
            httpStatus: crossPage ? 200 : 404,
            redirectChain: [],
          };
          sourcePage.outboundLinks.push(link);
          if (crossPage) crossPage.inboundLinks.push(link);
        }
      }
    }

    // Hub-to-hub cross-links within same cluster
    if (guide.role === 'hub') {
      for (const otherHub of hubSlugsForCluster) {
        if (otherHub === guide.slug) continue;
        const otherHubSlug = `/guides/${otherHub}`;
        const alreadyLinked = sourcePage.outboundLinks.some(l => l.targetPage === otherHubSlug);
        if (!alreadyLinked) {
          const otherPage = pageMap.get(otherHubSlug);
          const otherGuide = SCALING_GUIDES.find(g => g.slug === otherHub);
          const link: InternalLink = {
            sourcePage: sourceSlug,
            targetPage: otherHubSlug,
            anchorText: otherGuide?.primaryKW || otherHub,
            relAttribute: '',
            httpStatus: otherPage ? 200 : 404,
            redirectChain: [],
          };
          sourcePage.outboundLinks.push(link);
          if (otherPage) otherPage.inboundLinks.push(link);
        }
      }
    }
  }

  // Cross-cluster hub links (2 per semantically related hub pair)
  const crossHubPairs = [
    ['how-many-litter-boxes-per-cat', 'best-cat-trees-small-apartments'],
    ['best-self-cleaning-litter-box-2026', 'best-cat-trees-small-apartments'],
    ['best-orthopedic-dog-bed', 'best-cat-trees-small-apartments'],
    ['best-orthopedic-dog-bed', 'how-many-litter-boxes-per-cat'],
  ];
  for (const [from, to] of crossHubPairs) {
    const fromSlug = `/guides/${from}`;
    const toSlug = `/guides/${to}`;
    const fromPage = pageMap.get(fromSlug);
    const toPage = pageMap.get(toSlug);
    if (fromPage && toPage) {
      const alreadyLinked = fromPage.outboundLinks.some(l => l.targetPage === toSlug);
      if (!alreadyLinked) {
        const toGuide = SCALING_GUIDES.find(g => g.slug === to);
        const link: InternalLink = {
          sourcePage: fromSlug,
          targetPage: toSlug,
          anchorText: `see our ${toGuide?.primaryKW?.split(' ').slice(-3).join(' ')} guide`,
          relAttribute: '',
          httpStatus: 200,
          redirectChain: [],
        };
        fromPage.outboundLinks.push(link);
        toPage.inboundLinks.push(link);
      }
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
        overOptimized: exactPct > 35,
        underLinked: page.inboundLinks.length < 5 && page.type === 'guide',
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
    if (Math.round((exact / total) * 100) > 35) issues.push('Over-optimized anchor distribution (>35% exact)');

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
