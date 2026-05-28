/**
 * SEO Command Center Library
 * 
 * Combines crawl diagnostics, authority concentration, rank acceleration,
 * and self-healing optimizer into a unified engine.
 */

// ============= AUTHORITY ENGINE TYPES =============

export interface AuthorityPageData {
  url: string;
  type: 'product' | 'guide' | 'category' | 'homepage';
  tier: 1 | 2 | 3;
  inboundLinks: number;
  outboundLinks: number;
  crawlDepth: number;
  isOrphan: boolean;
  authorityScore: number;
  clusterName: string | null;
}

export interface AuthorityMetrics {
  overallScore: number; // 0-100
  severity: 'strong' | 'moderate' | 'weak';
  totalPages: number;
  orphanCount: number;
  avgInboundLinks: number;
  tier1Coverage: number; // % of tier 1 pages with ≥8 links
  tier2Coverage: number; // % of tier 2 pages with ≥2 links
  tier3Coverage: number; // % of tier 3 pages with ≥4 links
  guidesBelow4Links: number;
  productsBelow2Links: number;
}

// ============= RANK ACCELERATION TYPES =============

export interface RankAccelerationPage {
  url: string;
  keyword: string;
  avgPosition: number;
  impressions: number;
  ctr: number;
  clicks: number;
  internalLinks: number;
  isIndexed: boolean;
  suggestions: RankSuggestion[];
  pushPriority: 'high' | 'medium' | 'low';
}

export interface RankSuggestion {
  type: 'title_rewrite' | 'meta_optimization' | 'internal_link_boost' | 'homepage_rotation';
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export interface RankAccelerationMetrics {
  momentumScore: number; // 0-100
  severity: 'accelerating' | 'steady' | 'declining';
  top20Candidates: number;
  pagesInStrikeZone: number; // positions 11-40
  avgCtr: number;
  lowCtrHighImpressions: number;
  totalImpressions: number;
}

// ============= SELF-HEALING TYPES =============

export interface HealingAction {
  id: string;
  type: 'canonical_consolidation' | 'sitemap_cleanup' | 'noindex_parameter' | 'redirect_consolidation' | 'orphan_repair' | 'link_injection';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  affectedUrls: string[];
  approved: boolean;
  createdAt: string;
}

// ============= STABILITY INDICATOR =============

export type StabilityStatus = 'Stable' | 'Volatile' | 'Growth Phase';

export interface CommandCenterScores {
  crawlHealth: number;
  authorityStrength: number;
  rankingMomentum: number;
  stability: StabilityStatus;
}

// ============= EXTENDED TREND DATA =============

export interface CommandCenterTrend {
  date: string;
  crawlVolume: number;
  indexedGrowth: number;
  duplicateCount: number;
  parameterCrawls: number;
  authorityScore: number;
  top20Candidates: number;
}

// ============= AUTHORITY SCORE CALCULATION =============

export function calculateAuthorityScore(pages: AuthorityPageData[]): AuthorityMetrics {
  if (pages.length === 0) {
    return {
      overallScore: 0, severity: 'weak', totalPages: 0, orphanCount: 0,
      avgInboundLinks: 0, tier1Coverage: 0, tier2Coverage: 0, tier3Coverage: 0,
      guidesBelow4Links: 0, productsBelow2Links: 0,
    };
  }

  const orphans = pages.filter(p => p.isOrphan);
  const avgInbound = pages.reduce((sum, p) => sum + p.inboundLinks, 0) / pages.length;

  const tier1 = pages.filter(p => p.tier === 1);
  const tier2 = pages.filter(p => p.tier === 2);
  const tier3 = pages.filter(p => p.tier === 3);

  const tier1Coverage = tier1.length > 0
    ? (tier1.filter(p => p.inboundLinks >= 8).length / tier1.length) * 100 : 100;
  const tier2Coverage = tier2.length > 0
    ? (tier2.filter(p => p.inboundLinks >= 2).length / tier2.length) * 100 : 100;
  const tier3Coverage = tier3.length > 0
    ? (tier3.filter(p => p.inboundLinks >= 4).length / tier3.length) * 100 : 100;

  const guides = pages.filter(p => p.type === 'guide');
  const products = pages.filter(p => p.type === 'product');
  const guidesBelow4 = guides.filter(p => p.inboundLinks < 4).length;
  const productsBelow2 = products.filter(p => p.inboundLinks < 2).length;

  // Score: weighted average of coverage + orphan penalty + depth penalty
  let score = (tier1Coverage * 0.4 + tier2Coverage * 0.3 + tier3Coverage * 0.3);
  score -= Math.min(30, (orphans.length / Math.max(1, pages.length)) * 100);
  const avgDepth = pages.reduce((sum, p) => sum + p.crawlDepth, 0) / pages.length;
  if (avgDepth > 3) score -= Math.min(15, (avgDepth - 3) * 5);

  score = Math.min(100, Math.max(0, Math.round(score)));

  const severity: 'strong' | 'moderate' | 'weak' =
    score >= 70 ? 'strong' : score >= 40 ? 'moderate' : 'weak';

  return {
    overallScore: score, severity, totalPages: pages.length,
    orphanCount: orphans.length, avgInboundLinks: Math.round(avgInbound * 10) / 10,
    tier1Coverage: Math.round(tier1Coverage), tier2Coverage: Math.round(tier2Coverage),
    tier3Coverage: Math.round(tier3Coverage), guidesBelow4Links: guidesBelow4,
    productsBelow2Links: productsBelow2,
  };
}

// ============= RANK ACCELERATION CALCULATION =============

export function calculateRankMomentum(pages: RankAccelerationPage[]): RankAccelerationMetrics {
  if (pages.length === 0) {
    return {
      momentumScore: 50, severity: 'steady', top20Candidates: 0,
      pagesInStrikeZone: 0, avgCtr: 0, lowCtrHighImpressions: 0, totalImpressions: 0,
    };
  }

  const strikeZone = pages.filter(p => p.avgPosition >= 11 && p.avgPosition <= 40);
  const top20Candidates = pages.filter(p => p.avgPosition >= 11 && p.avgPosition <= 25 && p.impressions > 20);
  const lowCtrHigh = pages.filter(p => p.impressions > 20 && p.ctr < 1 && p.avgPosition >= 15 && p.avgPosition <= 35);
  const avgCtr = pages.reduce((sum, p) => sum + p.ctr, 0) / pages.length;
  const totalImpressions = pages.reduce((sum, p) => sum + p.impressions, 0);

  // Score: based on candidates, CTR health, and impression volume
  let score = 50;
  score += Math.min(20, top20Candidates.length * 2);
  score += Math.min(15, avgCtr * 5);
  score -= Math.min(20, lowCtrHigh.length * 3);
  if (totalImpressions > 1000) score += 10;

  score = Math.min(100, Math.max(0, Math.round(score)));

  const severity: 'accelerating' | 'steady' | 'declining' =
    score >= 65 ? 'accelerating' : score >= 40 ? 'steady' : 'declining';

  return {
    momentumScore: score, severity, top20Candidates: top20Candidates.length,
    pagesInStrikeZone: strikeZone.length, avgCtr: Math.round(avgCtr * 100) / 100,
    lowCtrHighImpressions: lowCtrHigh.length, totalImpressions,
  };
}

// ============= SELF-HEALING ACTION GENERATION =============

export function generateHealingActions(
  crawlMetrics: { duplicateUrlPercentage: number; parameterUrlCrawlCount: number; totalCrawledPages: number; indexedCrawledRatio: number; orphanPageCount: number; alternativeCanonicalCount: number }
): HealingAction[] {
  const actions: HealingAction[] = [];
  const now = new Date().toISOString();

  if (crawlMetrics.duplicateUrlPercentage > 5) {
    actions.push({
      id: 'heal-dup', type: 'canonical_consolidation', severity: 'critical',
      title: 'Consolidate Duplicate URLs',
      description: `${crawlMetrics.duplicateUrlPercentage.toFixed(1)}% crawl waste from duplicates. Add canonical tags and 301 redirects.`,
      affectedUrls: ['?category=*', '?sort=*', '?filter=*'], approved: false, createdAt: now,
    });
  }

  const paramPct = (crawlMetrics.parameterUrlCrawlCount / Math.max(1, crawlMetrics.totalCrawledPages)) * 100;
  if (paramPct > 15) {
    actions.push({
      id: 'heal-param', type: 'noindex_parameter', severity: 'warning',
      title: 'Suppress Parameter URL Crawling',
      description: `${paramPct.toFixed(1)}% of crawls are parameter URLs. Apply noindex and update robots.txt.`,
      affectedUrls: ['?utm_*', '?lang=*', '?page=*'], approved: false, createdAt: now,
    });
  }

  if (crawlMetrics.indexedCrawledRatio < 60) {
    actions.push({
      id: 'heal-sitemap', type: 'sitemap_cleanup', severity: 'warning',
      title: 'Clean Up Sitemap',
      description: `Index ratio at ${crawlMetrics.indexedCrawledRatio.toFixed(1)}%. Remove non-indexable URLs from sitemap.`,
      affectedUrls: ['/auth', '/checkout', '/admin'], approved: false, createdAt: now,
    });
  }

  if (crawlMetrics.orphanPageCount > 10) {
    actions.push({
      id: 'heal-orphan', type: 'orphan_repair', severity: 'warning',
      title: 'Repair Orphan Pages',
      description: `${crawlMetrics.orphanPageCount} orphan pages detected. Add internal links from related content.`,
      affectedUrls: [], approved: false, createdAt: now,
    });
  }

  if (crawlMetrics.alternativeCanonicalCount > 3) {
    actions.push({
      id: 'heal-canon', type: 'redirect_consolidation', severity: 'critical',
      title: 'Fix Canonical Mismatches',
      description: `${crawlMetrics.alternativeCanonicalCount} pages have alternative canonicals. Consolidate to preferred URLs.`,
      affectedUrls: [], approved: false, createdAt: now,
    });
  }

  return actions;
}

// ============= STABILITY INDICATOR =============

export function calculateStability(
  crawlScore: number,
  authorityScore: number,
  momentumScore: number
): StabilityStatus {
  const avg = (crawlScore + authorityScore + momentumScore) / 3;
  if (avg >= 65) return 'Stable';
  if (momentumScore > crawlScore + 15) return 'Growth Phase';
  return 'Volatile';
}

// ============= MOCK DATA GENERATORS =============

export function generateMockAuthorityPages(): AuthorityPageData[] {
  return [
    { url: '/', type: 'homepage', tier: 1, inboundLinks: 45, outboundLinks: 18, crawlDepth: 0, isOrphan: false, authorityScore: 95, clusterName: null },
    { url: '/cat-trees-condos', type: 'category', tier: 1, inboundLinks: 12, outboundLinks: 24, crawlDepth: 1, isOrphan: false, authorityScore: 82, clusterName: 'Cat Trees' },
    { url: '/guides/best-cat-trees-2026', type: 'guide', tier: 1, inboundLinks: 9, outboundLinks: 8, crawlDepth: 2, isOrphan: false, authorityScore: 78, clusterName: 'Cat Trees' },
    { url: '/guides/best-dog-bed-2026', type: 'guide', tier: 1, inboundLinks: 8, outboundLinks: 6, crawlDepth: 2, isOrphan: false, authorityScore: 75, clusterName: 'Dog Beds' },
    { url: '/products/luxury-cat-tree-xl', type: 'product', tier: 2, inboundLinks: 4, outboundLinks: 3, crawlDepth: 2, isOrphan: false, authorityScore: 62, clusterName: 'Cat Trees' },
    { url: '/products/modern-cat-condo', type: 'product', tier: 2, inboundLinks: 3, outboundLinks: 2, crawlDepth: 2, isOrphan: false, authorityScore: 55, clusterName: 'Cat Trees' },
    { url: '/products/sisal-scratching-post', type: 'product', tier: 2, inboundLinks: 2, outboundLinks: 2, crawlDepth: 3, isOrphan: false, authorityScore: 48, clusterName: 'Cat Trees' },
    { url: '/products/orthopedic-dog-bed-large', type: 'product', tier: 2, inboundLinks: 5, outboundLinks: 3, crawlDepth: 2, isOrphan: false, authorityScore: 60, clusterName: 'Dog Beds' },
    { url: '/guides/indoor-cat-enrichment', type: 'guide', tier: 3, inboundLinks: 2, outboundLinks: 4, crawlDepth: 3, isOrphan: false, authorityScore: 38, clusterName: 'Cat Trees' },
    { url: '/guides/cat-tree-safety-tips', type: 'guide', tier: 3, inboundLinks: 1, outboundLinks: 3, crawlDepth: 3, isOrphan: true, authorityScore: 22, clusterName: 'Cat Trees' },
    { url: '/guides/best-cat-litter-box-2026', type: 'guide', tier: 1, inboundLinks: 7, outboundLinks: 5, crawlDepth: 2, isOrphan: false, authorityScore: 72, clusterName: 'Cat Litter' },
    { url: '/products/self-cleaning-litter-box', type: 'product', tier: 2, inboundLinks: 1, outboundLinks: 2, crawlDepth: 3, isOrphan: false, authorityScore: 35, clusterName: 'Cat Litter' },
    { url: '/guides/outdoor-dog-games-2026', type: 'guide', tier: 2, inboundLinks: 3, outboundLinks: 5, crawlDepth: 2, isOrphan: false, authorityScore: 45, clusterName: 'Dog Activities' },
    { url: '/products/interactive-dog-toy', type: 'product', tier: 3, inboundLinks: 0, outboundLinks: 1, crawlDepth: 4, isOrphan: true, authorityScore: 12, clusterName: 'Dog Activities' },
    { url: '/guides/choosing-right-litter', type: 'guide', tier: 3, inboundLinks: 0, outboundLinks: 2, crawlDepth: 4, isOrphan: true, authorityScore: 15, clusterName: 'Cat Litter' },
  ];
}

export function generateMockRankPages(): RankAccelerationPage[] {
  return [
    { url: '/guides/best-cat-trees-2026', keyword: 'best cat trees 2026', avgPosition: 18.3, impressions: 342, ctr: 2.1, clicks: 7, internalLinks: 9, isIndexed: true, pushPriority: 'high', suggestions: [
      { type: 'internal_link_boost', description: 'Add 3 more internal links from product pages', impact: 'high' },
      { type: 'meta_optimization', description: 'Add year and benefit to meta description', impact: 'medium' },
    ]},
    { url: '/guides/best-dog-bed-2026', keyword: 'best dog bed', avgPosition: 24.7, impressions: 218, ctr: 0.9, clicks: 2, internalLinks: 8, isIndexed: true, pushPriority: 'high', suggestions: [
      { type: 'title_rewrite', description: 'Add "for Large Dogs" to capture long-tail', impact: 'high' },
      { type: 'homepage_rotation', description: 'Feature in homepage guide section', impact: 'medium' },
    ]},
    { url: '/guides/best-cat-litter-box-2026', keyword: 'best cat litter box', avgPosition: 31.2, impressions: 156, ctr: 0.6, clicks: 1, internalLinks: 7, isIndexed: true, pushPriority: 'medium', suggestions: [
      { type: 'internal_link_boost', description: 'Add contextual links from 3 supporting guides', impact: 'high' },
      { type: 'meta_optimization', description: 'Optimize meta for "self-cleaning" variant', impact: 'medium' },
    ]},
    { url: '/cat-trees-condos', keyword: 'cat trees for sale', avgPosition: 15.8, impressions: 487, ctr: 3.2, clicks: 16, internalLinks: 12, isIndexed: true, pushPriority: 'high', suggestions: [
      { type: 'internal_link_boost', description: 'Already strong — maintain current link structure', impact: 'low' },
    ]},
    { url: '/guides/best-orthopedic-dog-bed', keyword: 'orthopedic dog bed', avgPosition: 28.4, impressions: 134, ctr: 0.7, clicks: 1, internalLinks: 5, isIndexed: true, pushPriority: 'medium', suggestions: [
      { type: 'title_rewrite', description: 'Add "Vet-Recommended" to title for trust signal', impact: 'high' },
      { type: 'internal_link_boost', description: 'Add links from main dog bed cornerstone', impact: 'high' },
    ]},
    { url: '/guides/outdoor-dog-games-2026', keyword: 'outdoor dog games', avgPosition: 35.1, impressions: 89, ctr: 0.3, clicks: 0, internalLinks: 3, isIndexed: true, pushPriority: 'low', suggestions: [
      { type: 'meta_optimization', description: 'Rewrite meta description with action verbs', impact: 'medium' },
      { type: 'internal_link_boost', description: 'Needs 4+ more inbound links', impact: 'high' },
    ]},
    { url: '/products/luxury-cat-tree-xl', keyword: 'large cat tree', avgPosition: 22.6, impressions: 201, ctr: 1.5, clicks: 3, internalLinks: 4, isIndexed: true, pushPriority: 'medium', suggestions: [
      { type: 'homepage_rotation', description: 'Add to bestseller rotation on homepage', impact: 'medium' },
    ]},
  ];
}

export function generateMockCommandCenterTrends(): CommandCenterTrend[] {
  const data: CommandCenterTrend[] = [];
  const today = new Date();

  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const progress = (29 - i) / 29; // 0 to 1

    data.push({
      date: date.toISOString().split('T')[0],
      crawlVolume: Math.floor(2000 + Math.random() * 400 - progress * 200),
      indexedGrowth: Math.floor(1200 + progress * 150 + Math.random() * 80),
      duplicateCount: Math.floor(250 - progress * 100 + Math.random() * 40),
      parameterCrawls: Math.floor(200 - progress * 80 + Math.random() * 30),
      authorityScore: Math.floor(55 + progress * 20 + Math.random() * 5),
      top20Candidates: Math.floor(3 + progress * 4 + Math.random() * 2),
    });
  }

  return data;
}
