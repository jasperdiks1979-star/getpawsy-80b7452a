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
  /** Dynamic Authority Score (0–100) — weighted composite */
  das: number;
  /** Tier classification based on DAS + page type */
  tier: 1 | 2 | 3;
}

// ============= DYNAMIC AUTHORITY SCORE =============

export interface DASWeights {
  traffic: number;
  impressions: number;
  conversion: number;
  revenue: number;
  backlinks: number;
}

const DEFAULT_DAS_WEIGHTS: DASWeights = {
  traffic: 0.30,
  impressions: 0.20,
  conversion: 0.15,
  revenue: 0.20,
  backlinks: 0.15,
};

/**
 * Calculate Dynamic Authority Score (0–100).
 * Uses GSC data as proxies for traffic/conversion/revenue signals.
 */
export function calculateDAS(
  guide: Omit<GuideMetrics, 'das' | 'tier'>,
  maxClicks: number,
  maxImpressions: number,
  weights: DASWeights = DEFAULT_DAS_WEIGHTS,
): number {
  const trafficScore = maxClicks > 0 ? Math.min(guide.clicks30d / maxClicks, 1) : 0;
  const impressionScore = maxImpressions > 0 ? Math.min(guide.impressions30d / maxImpressions, 1) : 0;
  const ctr = guide.impressions30d > 0 ? guide.clicks30d / guide.impressions30d : 0;
  const conversionScore = Math.min(ctr / 0.10, 1);
  const positionBonus = guide.avgPosition > 0 ? Math.max(0, 1 - (guide.avgPosition - 1) / 50) : 0;
  const revenueScore = trafficScore * positionBonus;
  const backlinkScore = Math.min(guide.inboundInternalLinks / 10, 1);

  const raw =
    trafficScore * weights.traffic +
    impressionScore * weights.impressions +
    conversionScore * weights.conversion +
    revenueScore * weights.revenue +
    backlinkScore * weights.backlinks;

  const typeBonus = guide.pageType === 'cornerstone' ? 0.15 : guide.pageType === 'hub' ? 0.08 : 0;
  return Math.min(100, Math.round((raw + typeBonus) * 100));
}

/** Classify page tier based on DAS score and page type. */
export function classifyTier(das: number, pageType: 'cornerstone' | 'hub' | 'subguide'): 1 | 2 | 3 {
  if (pageType === 'cornerstone' || das >= 60) return 1;
  if (das >= 20 || pageType === 'hub') return 2;
  return 3;
}

/** Get structured tier map for all guides. */
export function getTierMap(guides: GuideMetrics[]): { tier1: string[]; tier2: string[]; tier3: string[] } {
  return {
    tier1: guides.filter(g => g.tier === 1).map(g => g.slug),
    tier2: guides.filter(g => g.tier === 2).map(g => g.slug),
    tier3: guides.filter(g => g.tier === 3).map(g => g.slug),
  };
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

  // First pass: build raw metrics (without DAS/tier)
  const rawMetrics = SCALING_GUIDES.map(guide => {
    const gsc = gscData[guide.slug] || { impressions: 0, clicks: 0, position: 0 };
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
      pageType: guide.role as 'cornerstone' | 'hub' | 'subguide',
      title: guide.title,
    };
  });

  // Compute max values for DAS normalization
  const maxClicks = Math.max(1, ...rawMetrics.map(m => m.clicks30d));
  const maxImpressions = Math.max(1, ...rawMetrics.map(m => m.impressions30d));

  // Second pass: compute DAS + tier
  return rawMetrics.map(m => {
    const das = calculateDAS(m, maxClicks, maxImpressions);
    const tier = classifyTier(das, m.pageType);
    return { ...m, das, tier };
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

  // Select candidates — ONLY inject into Tier 2 pages (never Tier 1 cornerstones)
  const underSupported = detected
    .filter(
      d =>
        d.tier !== 1 && // Never inject into Tier 1 money pages
        d.flags.includes('UNDER_SUPPORTED') &&
        (recentCountPerTarget[d.slug] || 0) < MAX_INJECTIONS_PER_PAGE_PER_14_DAYS
    )
    .sort((a, b) => a.inboundInternalLinks - b.inboundInternalLinks)
    .slice(0, 3);

  const top20Candidates = detected
    .filter(
      d =>
        d.tier !== 1 && // Never inject into Tier 1 money pages
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

// ============= CONTINUOUS REBALANCING =============

export interface RebalanceSignal {
  action: 'increase' | 'decrease' | 'hold';
  intensityDelta: number; // percentage change (e.g. 10 = +10%)
  reason: string;
}

/**
 * Compute injection intensity adjustment based on ranking trends.
 * Call weekly with current vs. previous GSC data.
 */
export function computeRebalanceSignal(
  currentMetrics: GuideMetrics[],
  previousMetrics: GuideMetrics[],
): RebalanceSignal {
  const tier1Current = currentMetrics.filter(m => m.tier === 1);
  const tier1Previous = previousMetrics.filter(m => m.tier === 1);

  if (tier1Current.length === 0 || tier1Previous.length === 0) {
    return { action: 'hold', intensityDelta: 0, reason: 'Insufficient data for rebalancing' };
  }

  // Average position change for Tier 1 pages
  const avgPosCurrent = tier1Current.reduce((s, m) => s + m.avgPosition, 0) / tier1Current.length;
  const avgPosPrevious = tier1Previous.reduce((s, m) => s + m.avgPosition, 0) / tier1Previous.length;
  const positionDelta = avgPosPrevious - avgPosCurrent; // positive = improved

  if (positionDelta > 2) {
    // Ranking improved — reduce injection intensity to avoid over-optimization
    return { action: 'decrease', intensityDelta: 10, reason: `Tier 1 avg position improved by ${positionDelta.toFixed(1)}` };
  }

  if (positionDelta < -1) {
    // Ranking declined or stagnated — increase injection intensity
    return { action: 'increase', intensityDelta: 10, reason: `Tier 1 avg position declined by ${Math.abs(positionDelta).toFixed(1)}` };
  }

  return { action: 'hold', intensityDelta: 0, reason: 'Rankings stable — maintaining current injection intensity' };
}

// ============= AUTHORITY PRUNING DETECTION =============

export interface PruningCandidate {
  slug: string;
  reason: 'orphan' | 'thin' | 'low_das' | 'excessive_depth';
  das: number;
  inboundLinks: number;
}

/**
 * Detect pages that should have authority pruned (Tier 3, orphans, thin).
 */
export function detectPruningCandidates(metrics: GuideMetrics[]): PruningCandidate[] {
  return metrics
    .filter(m => m.tier === 3 && (m.inboundInternalLinks === 0 || m.das < 10))
    .map(m => ({
      slug: m.slug,
      reason: m.inboundInternalLinks === 0 ? 'orphan' as const : 'low_das' as const,
      das: m.das,
      inboundLinks: m.inboundInternalLinks,
    }));
}

// ============= OVER-OPTIMIZATION ASSESSMENT =============

export interface OverOptReport {
  overOptimizationRisk: 'low' | 'medium' | 'high';
  anchorDistribution: { exact: string; partial: string; branded: string };
  estimatedAuthorityShift: 'low' | 'medium' | 'strong';
}

export function assessOverOptimization(metrics: GuideMetrics[]): OverOptReport {
  const avgInbound = metrics.length > 0
    ? metrics.reduce((s, m) => s + m.inboundInternalLinks, 0) / metrics.length
    : 0;

  const tier1Count = metrics.filter(m => m.tier === 1).length;
  const totalLinks = metrics.reduce((s, m) => s + m.inboundInternalLinks, 0);

  // Risk assessment
  const risk: 'low' | 'medium' | 'high' =
    avgInbound > 12 ? 'high' : avgInbound > 8 ? 'medium' : 'low';

  // Authority shift estimate based on tier distribution
  const shift: 'low' | 'medium' | 'strong' =
    tier1Count >= 3 && totalLinks > 50 ? 'strong' :
    tier1Count >= 2 ? 'medium' : 'low';

  return {
    overOptimizationRisk: risk,
    anchorDistribution: { exact: '30%', partial: '50%', branded: '20%' },
    estimatedAuthorityShift: shift,
  };
}
