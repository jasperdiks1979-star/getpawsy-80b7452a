/**
 * Internal Link Injection Engine
 * 
 * Controlled engine for strengthening under-supported guides
 * via contextual internal link suggestions. Decision-support only —
 * no automatic content modification.
 */

import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';

// ============= TYPES =============

export interface GuideMetrics {
  slug: string;
  impressions30d: number;
  clicks30d: number;
  avgPosition: number;
  inboundInternalLinks: number;
  outboundInternalLinks: number;
  cluster: string;
  pageType: 'cornerstone' | 'hub' | 'subguide';
  title: string;
}

export type DetectionFlag =
  | 'UNDER_SUPPORTED'
  | 'TOP20_CANDIDATE'
  | 'AUTHORITY_NODE';

export interface DetectedGuide extends GuideMetrics {
  flags: DetectionFlag[];
}

export interface LinkSuggestion {
  sourceSlug: string;
  targetSlug: string;
  anchorText: string;
  anchorType: 'partial' | 'semantic' | 'branded' | 'generic';
  injectionType: 'reinforcement' | 'cornerstone' | 'homepage' | 'hub';
  cluster: string;
  reason: string;
}

export interface InjectionPlan {
  weekDate: string;
  underSupported: DetectedGuide[];
  top20Candidates: DetectedGuide[];
  suggestions: LinkSuggestion[];
  stats: InjectionStats;
}

export interface InjectionStats {
  totalGuides: number;
  underSupportedCount: number;
  top20CandidateCount: number;
  authorityNodeCount: number;
  avgInboundLinks: number;
  clusterHealth: Record<string, ClusterHealth>;
  lastInjectionDate: string | null;
}

export interface ClusterHealth {
  name: string;
  guideCount: number;
  avgInbound: number;
  underSupported: number;
  top20Candidates: number;
  authorityScore: number;
}

export interface HomepageGuide {
  slug: string;
  title: string;
  cluster: string;
  impressions30d: number;
  avgPosition: number;
  inboundLinks: number;
}

// ============= SAFETY CONSTANTS =============

const MAX_INJECTIONS_PER_PAGE_PER_14_DAYS = 2;
const MAX_NEW_LINKS_PER_WEEK_SITEWIDE = 12;
const MIN_WORDS_BETWEEN_LINKS = 300;
const UNDER_SUPPORTED_THRESHOLD = 4;
const TOP20_POSITION_MIN = 18;
const TOP20_POSITION_MAX = 35;
const TOP20_MIN_IMPRESSIONS = 10;
const CORNERSTONE_MIN_INBOUND = 8;

// ============= DETECTION =============

export function detectFlags(guide: GuideMetrics): DetectionFlag[] {
  const flags: DetectionFlag[] = [];

  if (
    guide.inboundInternalLinks < UNDER_SUPPORTED_THRESHOLD &&
    guide.impressions30d > 0
  ) {
    flags.push('UNDER_SUPPORTED');
  }

  if (
    guide.avgPosition >= TOP20_POSITION_MIN &&
    guide.avgPosition <= TOP20_POSITION_MAX &&
    guide.impressions30d >= TOP20_MIN_IMPRESSIONS
  ) {
    flags.push('TOP20_CANDIDATE');
  }

  if (
    guide.pageType === 'cornerstone' ||
    guide.inboundInternalLinks >= CORNERSTONE_MIN_INBOUND
  ) {
    flags.push('AUTHORITY_NODE');
  }

  return flags;
}

/**
 * Build metrics for all guides from the scaling plan + GSC data overlay.
 */
export function buildGuideMetrics(
  gscData: Record<string, { impressions: number; clicks: number; position: number }>
): GuideMetrics[] {
  const slugSet = new Set(SCALING_GUIDES.map(g => g.slug));

  return SCALING_GUIDES.map(guide => {
    const gsc = gscData[guide.slug] || { impressions: 0, clicks: 0, position: 0 };

    // Calculate inbound links from linksTo references
    const inbound = SCALING_GUIDES.filter(
      g => g.slug !== guide.slug && g.linksTo.includes(guide.slug)
    ).length;

    const outbound = guide.linksTo.filter(s => slugSet.has(s)).length;

    return {
      slug: guide.slug,
      impressions30d: gsc.impressions,
      clicks30d: gsc.clicks,
      avgPosition: gsc.position,
      inboundInternalLinks: inbound,
      outboundInternalLinks: outbound,
      cluster: guide.cluster,
      pageType: guide.role,
      title: guide.title,
    };
  });
}

// ============= ANCHOR TEXT GENERATION =============

function generateAnchor(
  target: ScalingGuide,
  type: 'partial' | 'semantic' | 'branded' | 'generic'
): string {
  const kw = target.primaryKW;
  const words = kw.split(' ');

  switch (type) {
    case 'partial':
      return words.length > 3
        ? words.slice(0, 3).join(' ')
        : words.slice(0, 2).join(' ');
    case 'semantic':
      return target.secondaryKWs.length > 0
        ? target.secondaryKWs[0]
        : `guide to ${words.slice(-2).join(' ')}`;
    case 'branded':
      return `Pawsy's ${words.slice(-2).join(' ')} guide`;
    case 'generic':
      return 'read more in our guide';
  }
}

function pickAnchorType(): 'partial' | 'semantic' | 'branded' | 'generic' {
  const r = Math.random() * 100;
  if (r < 40) return 'partial';
  if (r < 80) return 'semantic';
  return 'branded';
}

// ============= STRATEGY: LINK SUGGESTION GENERATION =============

function findClusterGuides(
  cluster: string,
  role: string,
  excludeSlug: string
): ScalingGuide[] {
  return SCALING_GUIDES.filter(
    g => g.cluster === cluster && g.role === role && g.slug !== excludeSlug
  );
}

/**
 * Generate link suggestions for an under-supported guide.
 * Strategy: 1 cornerstone + 1 hub + 1 related subguide from same cluster.
 */
export function generateSuggestionsForGuide(
  target: GuideMetrics
): LinkSuggestion[] {
  const suggestions: LinkSuggestion[] = [];
  const targetGuide = SCALING_GUIDES.find(g => g.slug === target.slug);
  if (!targetGuide) return suggestions;

  // 1. Cornerstone link
  const cornerstones = findClusterGuides(target.cluster, 'cornerstone', target.slug);
  if (cornerstones.length > 0) {
    const cs = cornerstones[0];
    suggestions.push({
      sourceSlug: cs.slug,
      targetSlug: target.slug,
      anchorText: generateAnchor(targetGuide, 'partial'),
      anchorType: 'partial',
      injectionType: 'cornerstone',
      cluster: target.cluster,
      reason: `Cornerstone → under-supported subguide (${target.inboundInternalLinks} inbound)`,
    });
  }

  // 2. Hub link
  const hubs = findClusterGuides(target.cluster, 'hub', target.slug);
  if (hubs.length > 0) {
    const hub = hubs[0];
    suggestions.push({
      sourceSlug: hub.slug,
      targetSlug: target.slug,
      anchorText: generateAnchor(targetGuide, 'semantic'),
      anchorType: 'semantic',
      injectionType: 'hub',
      cluster: target.cluster,
      reason: `Hub → under-supported guide (${target.inboundInternalLinks} inbound)`,
    });
  }

  // 3. Related subguide
  const subguides = findClusterGuides(target.cluster, 'subguide', target.slug);
  if (subguides.length > 0) {
    const sub = subguides[Math.floor(Math.random() * Math.min(subguides.length, 5))];
    suggestions.push({
      sourceSlug: sub.slug,
      targetSlug: target.slug,
      anchorText: generateAnchor(targetGuide, pickAnchorType()),
      anchorType: 'semantic',
      injectionType: 'reinforcement',
      cluster: target.cluster,
      reason: `Related subguide reinforcement`,
    });
  }

  return suggestions;
}

// ============= CLUSTER HEALTH =============

function calculateClusterHealth(
  guides: GuideMetrics[]
): Record<string, ClusterHealth> {
  const clusters = [...new Set(guides.map(g => g.cluster))];
  const health: Record<string, ClusterHealth> = {};

  for (const cluster of clusters) {
    const clusterGuides = guides.filter(g => g.cluster === cluster);
    const avgInbound =
      clusterGuides.length > 0
        ? Math.round(
            (clusterGuides.reduce((s, g) => s + g.inboundInternalLinks, 0) /
              clusterGuides.length) *
              10
          ) / 10
        : 0;

    const underSupported = clusterGuides.filter(
      g => detectFlags(g).includes('UNDER_SUPPORTED')
    ).length;

    const top20 = clusterGuides.filter(
      g => detectFlags(g).includes('TOP20_CANDIDATE')
    ).length;

    // Authority score: weighted by avg inbound, cornerstone presence, guide count
    const hasCornerstones = clusterGuides.some(g => g.pageType === 'cornerstone');
    const authorityScore = Math.min(
      100,
      Math.round(
        avgInbound * 8 +
          (hasCornerstones ? 20 : 0) +
          Math.min(clusterGuides.length * 2, 30) -
          underSupported * 5
      )
    );

    health[cluster] = {
      name: cluster,
      guideCount: clusterGuides.length,
      avgInbound,
      underSupported,
      top20Candidates: top20,
      authorityScore: Math.max(0, authorityScore),
    };
  }

  return health;
}

// ============= INJECTION PLAN =============

/**
 * Generate a weekly injection plan.
 * Selects top 3 under-supported + top 2 top-20 candidates,
 * generates max 2 link suggestions per page,
 * caps at 12 new links sitewide.
 */
export function generateInjectionPlan(
  gscData: Record<string, { impressions: number; clicks: number; position: number }>,
  existingInjections: { targetSlug: string; createdAt: string }[] = []
): InjectionPlan {
  const metrics = buildGuideMetrics(gscData);
  const detected: DetectedGuide[] = metrics.map(m => ({
    ...m,
    flags: detectFlags(m),
  }));

  // Filter out pages with recent injections (< 14 days)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const recentTargets = new Set(
    existingInjections
      .filter(i => new Date(i.createdAt) > fourteenDaysAgo)
      .map(i => i.targetSlug)
  );

  // Count recent injections per target
  const recentCountPerTarget: Record<string, number> = {};
  existingInjections
    .filter(i => new Date(i.createdAt) > fourteenDaysAgo)
    .forEach(i => {
      recentCountPerTarget[i.targetSlug] = (recentCountPerTarget[i.targetSlug] || 0) + 1;
    });

  // Select candidates
  const underSupported = detected
    .filter(
      d =>
        d.flags.includes('UNDER_SUPPORTED') &&
        (recentCountPerTarget[d.slug] || 0) < MAX_INJECTIONS_PER_PAGE_PER_14_DAYS
    )
    .sort((a, b) => a.inboundInternalLinks - b.inboundInternalLinks)
    .slice(0, 3);

  const top20Candidates = detected
    .filter(
      d =>
        d.flags.includes('TOP20_CANDIDATE') &&
        (recentCountPerTarget[d.slug] || 0) < MAX_INJECTIONS_PER_PAGE_PER_14_DAYS
    )
    .sort((a, b) => a.avgPosition - b.avgPosition)
    .slice(0, 2);

  // Generate suggestions
  let allSuggestions: LinkSuggestion[] = [];
  const targets = [...underSupported, ...top20Candidates];

  for (const target of targets) {
    const suggestions = generateSuggestionsForGuide(target);
    // Cap at 2 per page
    allSuggestions.push(...suggestions.slice(0, 2));
  }

  // Cap at 12 sitewide
  allSuggestions = allSuggestions.slice(0, MAX_NEW_LINKS_PER_WEEK_SITEWIDE);

  // Stats
  const clusterHealth = calculateClusterHealth(metrics);
  const avgInbound =
    metrics.length > 0
      ? Math.round(
          (metrics.reduce((s, m) => s + m.inboundInternalLinks, 0) / metrics.length) * 10
        ) / 10
      : 0;

  const lastInjection = existingInjections.length > 0
    ? existingInjections.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].createdAt
    : null;

  return {
    weekDate: new Date().toISOString().split('T')[0],
    underSupported,
    top20Candidates,
    suggestions: allSuggestions,
    stats: {
      totalGuides: metrics.length,
      underSupportedCount: detected.filter(d => d.flags.includes('UNDER_SUPPORTED')).length,
      top20CandidateCount: detected.filter(d => d.flags.includes('TOP20_CANDIDATE')).length,
      authorityNodeCount: detected.filter(d => d.flags.includes('AUTHORITY_NODE')).length,
      avgInboundLinks: avgInbound,
      clusterHealth,
      lastInjectionDate: lastInjection,
    },
  };
}

// ============= HOMEPAGE "TOP GUIDES" =============

/**
 * Select guides for a "Top Guides This Month" homepage section.
 * Criteria: impressions > 5, inbound < 6, position < 40. Max 6.
 */
export function selectHomepageGuides(
  gscData: Record<string, { impressions: number; clicks: number; position: number }>
): HomepageGuide[] {
  const metrics = buildGuideMetrics(gscData);

  return metrics
    .filter(
      m =>
        m.impressions30d > 5 &&
        m.inboundInternalLinks < 6 &&
        m.avgPosition > 0 &&
        m.avgPosition < 40
    )
    .sort((a, b) => b.impressions30d - a.impressions30d)
    .slice(0, 6)
    .map(m => ({
      slug: m.slug,
      title: m.title,
      cluster: m.cluster,
      impressions30d: m.impressions30d,
      avgPosition: m.avgPosition,
      inboundLinks: m.inboundInternalLinks,
    }));
}

// ============= LINK HEALTH COLOR =============

export function getLinkHealthColor(inboundLinks: number): 'red' | 'orange' | 'green' {
  if (inboundLinks < 4) return 'red';
  if (inboundLinks < 8) return 'orange';
  return 'green';
}
