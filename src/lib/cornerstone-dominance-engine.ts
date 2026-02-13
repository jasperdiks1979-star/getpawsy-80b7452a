/**
 * Cornerstone Domination Engine
 * 
 * Turns a selected cluster into undeniable topical authority over 90 days.
 * Controlled reinforcement — not aggressive mass changes.
 * Decision-support only — never auto-modifies content.
 */

import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';
import type { GSCGuideReport } from './gsc';

// ============= TYPES =============

export type ClusterID = 'cat-litter' | 'cat-furniture' | 'dog-beds' | 'micro-intent';

export interface CornerstoneDominanceProfile {
  cluster: ClusterID;
  clusterLabel: string;
  primaryCornerstone: CornerstoneProfile;
  supportGuides: SupportGuideProfile[];
  microIntentGaps: MicroIntentGap[];
  authorityLoop: AuthorityLoopStatus;
  weeklyPlan: WeeklyDominancePlan;
  kpiTracker: DominanceKPI;
  cannibalizationRisks: CannibalizationRisk[];
}

export interface CornerstoneProfile {
  slug: string;
  title: string;
  impressions: number;
  avgPosition: number;
  inboundLinks: number;
  inboundSlugs: string[];
  crossClusterLinks: number;
  hasComparisonTable: boolean;
  hasFAQBlock: boolean;
  hasSnippetH2: boolean;
  hasYearReference: boolean;
  completionScore: number; // 0-100
  status: 'healthy' | 'needs_work' | 'critical';
}

export interface SupportGuideProfile {
  slug: string;
  title: string;
  role: 'hub' | 'subguide';
  impressions: number;
  avgPosition: number;
  linksToCornerstone: boolean;
  linksSiblingSupport: boolean;
  hasMicroIntentH3: boolean;
  anchorType: 'semantic' | 'partial' | 'branded' | 'none';
  complianceScore: number; // 0-100
}

export interface MicroIntentGap {
  theme: string;
  suggestedSlug: string;
  suggestedTitle: string;
  targetKeyword: string;
  estimatedDifficulty: 'low' | 'medium';
  exists: boolean;
  matchingSlug?: string;
}

export interface AuthorityLoopStatus {
  microToSupport: number;
  supportToCornerstone: number;
  cornerstoneToSupport: number;
  circularLinks: string[];
  maxOutboundExceeded: string[];
  overallHealthy: boolean;
}

export interface WeeklyDominancePlan {
  cornerstoneLinks: LinkSuggestion[];
  supportRotationLinks: LinkSuggestion[];
  totalInjections: number;
  clusterAuthorityScore: number;
}

export interface LinkSuggestion {
  sourceSlug: string;
  targetSlug: string;
  anchorText: string;
  anchorType: 'semantic' | 'partial' | 'branded';
  reason: string;
  priority: number;
}

export interface DominanceKPI {
  day: number;
  cornerstonePosition: number;
  avgClusterPosition: number;
  avgInboundLinks: number;
  snippetOpportunityDetected: boolean;
  cannibalizationConflicts: number;
  targets: {
    cornerstoneTop15: boolean;
    clusterPositionImproved10: boolean;
    cornerstoneInbound8Plus: boolean;
    snippetTriggered: boolean;
    zeroCannibalization: boolean;
  };
  overallProgress: number; // 0-100
}

export interface CannibalizationRisk {
  keyword: string;
  slugs: string[];
  severity: 'high' | 'medium' | 'low';
  resolution: string;
}

// ============= CONSTANTS =============

const MAX_OUTBOUND_PER_ARTICLE = 8;
const MAX_INJECTIONS_PER_WEEK = 6;
const MIN_CORNERSTONE_INBOUND = 8;
const ANCHOR_MIX = { semantic: 0.5, partial: 0.3, branded: 0.2 } as const;

const CLUSTER_LABELS: Record<ClusterID, string> = {
  'cat-litter': 'Cat Litter',
  'cat-furniture': 'Cat Furniture',
  'dog-beds': 'Dog Beds',
  'micro-intent': 'Micro-Intent',
};

// ============= MICRO-INTENT TEMPLATES =============

const MICRO_INTENT_TEMPLATES: Record<string, { theme: string; slugSuffix: string; titleTemplate: string; kwTemplate: string }[]> = {
  'cat-litter': [
    { theme: 'small apartments', slugSuffix: 'for-small-apartment', titleTemplate: 'Best Litter Box for Small Apartments (2026)', kwTemplate: 'best litter box for small apartment' },
    { theme: 'budget under $100', slugSuffix: 'under-100', titleTemplate: 'Best Cat Litter Boxes Under $100 (2026)', kwTemplate: 'best litter box under 100' },
    { theme: 'senior pets', slugSuffix: 'senior-cats', titleTemplate: 'Best Litter Boxes for Senior Cats (2026)', kwTemplate: 'best litter box for senior cats' },
    { theme: 'large breeds', slugSuffix: 'maine-coon', titleTemplate: 'Best Litter Box for Maine Coons (2026)', kwTemplate: 'best litter box for maine coon' },
    { theme: 'comparison', slugSuffix: 'comparison', titleTemplate: 'Cat Litter Box Comparison (2026) – Side by Side', kwTemplate: 'cat litter box comparison' },
    { theme: 'safety guide', slugSuffix: 'safety', titleTemplate: 'Cat Litter Box Safety Guide – Materials, Placement & Cleaning', kwTemplate: 'cat litter box safety' },
  ],
  'cat-furniture': [
    { theme: 'small apartments', slugSuffix: 'for-small-apartment', titleTemplate: 'Best Cat Trees for Small Apartments (2026)', kwTemplate: 'best cat tree for small apartment' },
    { theme: 'budget under $100', slugSuffix: 'under-100', titleTemplate: 'Best Cat Trees Under $100 (2026)', kwTemplate: 'best cat tree under 100' },
    { theme: 'senior pets', slugSuffix: 'senior-cats', titleTemplate: 'Best Cat Furniture for Senior Cats (2026)', kwTemplate: 'cat furniture for senior cats' },
    { theme: 'large breeds', slugSuffix: 'large-cats', titleTemplate: 'Best Cat Trees for Large Cats (2026)', kwTemplate: 'best cat tree for large cats' },
    { theme: 'comparison', slugSuffix: 'comparison', titleTemplate: 'Cat Tree Comparison (2026) – Side by Side', kwTemplate: 'cat tree comparison' },
    { theme: 'safety guide', slugSuffix: 'stability-safety', titleTemplate: 'Cat Tree Stability & Safety Guide', kwTemplate: 'cat tree safety tips' },
  ],
  'dog-beds': [
    { theme: 'small apartments', slugSuffix: 'for-small-spaces', titleTemplate: 'Best Dog Beds for Small Spaces (2026)', kwTemplate: 'best dog bed for small apartment' },
    { theme: 'budget under $100', slugSuffix: 'under-100', titleTemplate: 'Best Dog Beds Under $100 (2026)', kwTemplate: 'best dog bed under 100' },
    { theme: 'senior pets', slugSuffix: 'senior-dogs', titleTemplate: 'Best Dog Beds for Senior Dogs (2026)', kwTemplate: 'best dog bed for senior dogs' },
    { theme: 'large breeds', slugSuffix: 'large-breeds', titleTemplate: 'Best Dog Beds for Large Breeds (2026)', kwTemplate: 'best dog bed for large breeds' },
    { theme: 'comparison', slugSuffix: 'comparison', titleTemplate: 'Dog Bed Comparison (2026) – Memory Foam vs Bolster vs Orthopedic', kwTemplate: 'dog bed comparison' },
    { theme: 'safety guide', slugSuffix: 'materials-safety', titleTemplate: 'Dog Bed Materials & Safety Guide – Non-Toxic Picks', kwTemplate: 'dog bed safety materials' },
  ],
};

// ============= HELPER FUNCTIONS =============

function getClusterGuides(cluster: ClusterID): ScalingGuide[] {
  return SCALING_GUIDES.filter(g => g.cluster === cluster);
}

function getInboundLinks(slug: string): string[] {
  return SCALING_GUIDES.filter(g => g.slug !== slug && g.linksTo.includes(slug)).map(g => g.slug);
}

function getCrossClusterInbound(slug: string, cluster: ClusterID): number {
  return SCALING_GUIDES.filter(g => g.cluster !== cluster && g.linksTo.includes(slug)).length;
}

function getOutboundCount(slug: string): number {
  const g = SCALING_GUIDES.find(s => s.slug === slug);
  return g ? g.linksTo.length : 0;
}

function pickAnchorType(): 'semantic' | 'partial' | 'branded' {
  const r = Math.random();
  if (r < ANCHOR_MIX.semantic) return 'semantic';
  if (r < ANCHOR_MIX.semantic + ANCHOR_MIX.partial) return 'partial';
  return 'branded';
}

function generateAnchorText(target: ScalingGuide, type: 'semantic' | 'partial' | 'branded'): string {
  const kw = target.primaryKW;
  const words = kw.split(' ');
  switch (type) {
    case 'semantic':
      return target.secondaryKWs.length > 0
        ? target.secondaryKWs[Math.floor(Math.random() * target.secondaryKWs.length)]
        : `guide to ${words.slice(-2).join(' ')}`;
    case 'partial':
      return words.length > 3 ? words.slice(0, 3).join(' ') : words.slice(0, 2).join(' ');
    case 'branded':
      return `Pawsy's ${words.slice(-2).join(' ')} guide`;
  }
}

// ============= PRIMARY CORNERSTONE SELECTION =============

function selectPrimaryCornerstone(
  cluster: ClusterID,
  gscMap: Record<string, { impressions: number; position: number }>,
): ScalingGuide {
  const guides = getClusterGuides(cluster);

  // Score: impressions (40%) + inbound links (30%) + keyword breadth via secondaryKWs (30%)
  const scored = guides.map(g => {
    const gsc = gscMap[g.slug];
    const impressions = gsc?.impressions || 0;
    const inbound = getInboundLinks(g.slug).length;
    const kwBreadth = g.secondaryKWs.length;

    return {
      guide: g,
      score: impressions * 0.4 + inbound * 100 * 0.3 + kwBreadth * 50 * 0.3,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.guide || guides[0];
}

// ============= BUILD CORNERSTONE PROFILE =============

function buildCornerstoneProfile(
  guide: ScalingGuide,
  gscMap: Record<string, { impressions: number; position: number }>,
): CornerstoneProfile {
  const gsc = gscMap[guide.slug] || { impressions: 0, position: 99 };
  const inboundSlugs = getInboundLinks(guide.slug);
  const crossCluster = getCrossClusterInbound(guide.slug, guide.cluster as ClusterID);

  // Completion checks (simplified — real impl would parse JSON data)
  const hasComparisonTable = guide.intent === 'commercial';
  const hasFAQBlock = guide.secondaryKWs.length >= 3;
  const hasSnippetH2 = guide.role === 'cornerstone';
  const hasYearReference = guide.title.includes('2026');

  let score = 0;
  if (inboundSlugs.length >= MIN_CORNERSTONE_INBOUND) score += 25;
  else score += Math.round((inboundSlugs.length / MIN_CORNERSTONE_INBOUND) * 25);
  if (crossCluster >= 1) score += 15;
  if (hasComparisonTable) score += 15;
  if (hasFAQBlock) score += 15;
  if (hasSnippetH2) score += 15;
  if (hasYearReference) score += 15;

  const status = score >= 80 ? 'healthy' : score >= 50 ? 'needs_work' : 'critical';

  return {
    slug: guide.slug,
    title: guide.title,
    impressions: gsc.impressions,
    avgPosition: gsc.position,
    inboundLinks: inboundSlugs.length,
    inboundSlugs,
    crossClusterLinks: crossCluster,
    hasComparisonTable,
    hasFAQBlock,
    hasSnippetH2,
    hasYearReference,
    completionScore: score,
    status,
  };
}

// ============= BUILD SUPPORT GUIDE PROFILES =============

function buildSupportProfiles(
  cluster: ClusterID,
  cornerstoneSlug: string,
  gscMap: Record<string, { impressions: number; position: number }>,
): SupportGuideProfile[] {
  const guides = getClusterGuides(cluster).filter(g => g.slug !== cornerstoneSlug);

  return guides.map(g => {
    const gsc = gscMap[g.slug] || { impressions: 0, position: 99 };
    const linksToCornerstone = g.linksTo.includes(cornerstoneSlug);
    const siblings = guides.filter(s => s.slug !== g.slug);
    const linksSiblingSupport = siblings.some(s => g.linksTo.includes(s.slug));
    const hasMicroIntentH3 = g.secondaryKWs.length > 2; // proxy

    // Determine anchor type used
    let anchorType: 'semantic' | 'partial' | 'branded' | 'none' = 'none';
    if (linksToCornerstone) anchorType = 'semantic'; // default assumption

    let complianceScore = 0;
    if (linksToCornerstone) complianceScore += 40;
    if (linksSiblingSupport) complianceScore += 25;
    if (hasMicroIntentH3) complianceScore += 20;
    if (anchorType !== 'none') complianceScore += 15;

    return {
      slug: g.slug,
      title: g.title,
      role: g.role as 'hub' | 'subguide',
      impressions: gsc.impressions,
      avgPosition: gsc.position,
      linksToCornerstone,
      linksSiblingSupport,
      hasMicroIntentH3,
      anchorType,
      complianceScore,
    };
  });
}

// ============= MICRO-INTENT GAP ANALYSIS =============

function detectMicroIntentGaps(cluster: ClusterID): MicroIntentGap[] {
  const templates = MICRO_INTENT_TEMPLATES[cluster] || [];
  const clusterGuides = getClusterGuides(cluster);

  return templates.map(t => {
    const match = clusterGuides.find(g =>
      g.slug.includes(t.slugSuffix) || g.primaryKW.toLowerCase().includes(t.kwTemplate.split(' ').slice(-2).join(' '))
    );

    return {
      theme: t.theme,
      suggestedSlug: `best-${cluster.split('-')[0]}-${t.slugSuffix}`,
      suggestedTitle: t.titleTemplate,
      targetKeyword: t.kwTemplate,
      estimatedDifficulty: 'low' as const,
      exists: !!match,
      matchingSlug: match?.slug,
    };
  });
}

// ============= AUTHORITY LOOP ANALYSIS =============

function analyzeAuthorityLoop(cluster: ClusterID, cornerstoneSlug: string): AuthorityLoopStatus {
  const guides = getClusterGuides(cluster);
  const cornerstone = guides.find(g => g.slug === cornerstoneSlug)!;
  const supports = guides.filter(g => g.slug !== cornerstoneSlug);

  const microToSupport = supports.filter(g =>
    g.role === 'subguide' && supports.some(s => s.role === 'hub' && g.linksTo.includes(s.slug))
  ).length;

  const supportToCornerstone = supports.filter(g => g.linksTo.includes(cornerstoneSlug)).length;
  const cornerstoneToSupport = cornerstone ? supports.filter(s => cornerstone.linksTo.includes(s.slug)).length : 0;

  // Detect circular links (A → B → A)
  const circularLinks: string[] = [];
  for (const g of guides) {
    for (const target of g.linksTo) {
      const targetGuide = SCALING_GUIDES.find(s => s.slug === target);
      if (targetGuide && targetGuide.linksTo.includes(g.slug)) {
        const pair = [g.slug, target].sort().join(' ↔ ');
        if (!circularLinks.includes(pair)) circularLinks.push(pair);
      }
    }
  }

  const maxOutboundExceeded = guides
    .filter(g => g.linksTo.length > MAX_OUTBOUND_PER_ARTICLE)
    .map(g => g.slug);

  return {
    microToSupport,
    supportToCornerstone,
    cornerstoneToSupport,
    circularLinks,
    maxOutboundExceeded,
    overallHealthy: circularLinks.length === 0 && maxOutboundExceeded.length === 0,
  };
}

// ============= WEEKLY DOMINANCE PLAN =============

function generateWeeklyPlan(
  cluster: ClusterID,
  cornerstoneSlug: string,
  gscMap: Record<string, { impressions: number; position: number }>,
): WeeklyDominancePlan {
  const guides = getClusterGuides(cluster);
  const cornerstone = SCALING_GUIDES.find(g => g.slug === cornerstoneSlug)!;
  const supports = guides.filter(g => g.slug !== cornerstoneSlug);

  // 2 links TO cornerstone from guides not yet linking
  const notLinkingToCornerstone = supports.filter(g => !g.linksTo.includes(cornerstoneSlug));
  const cornerstoneLinks: LinkSuggestion[] = notLinkingToCornerstone.slice(0, 2).map(source => {
    const type = pickAnchorType();
    return {
      sourceSlug: source.slug,
      targetSlug: cornerstoneSlug,
      anchorText: generateAnchorText(cornerstone, type),
      anchorType: type,
      reason: `${source.role} → cornerstone reinforcement`,
      priority: 3,
    };
  });

  // 2 links TO rotating support guides (lowest inbound first)
  const supportsByInbound = supports
    .map(g => ({ guide: g, inbound: getInboundLinks(g.slug).length }))
    .sort((a, b) => a.inbound - b.inbound);

  const supportRotationLinks: LinkSuggestion[] = supportsByInbound.slice(0, 2).map(({ guide: target }) => {
    // Find a source that doesn't already link to this target
    const potentialSources = guides.filter(g =>
      g.slug !== target.slug && !g.linksTo.includes(target.slug) && g.linksTo.length < MAX_OUTBOUND_PER_ARTICLE
    );
    const source = potentialSources[0];
    if (!source) return null;

    const type = pickAnchorType();
    return {
      sourceSlug: source.slug,
      targetSlug: target.slug,
      anchorText: generateAnchorText(target, type),
      anchorType: type,
      reason: `support rotation (${target.role}, low inbound)`,
      priority: 2,
    };
  }).filter(Boolean) as LinkSuggestion[];

  const allLinks = [...cornerstoneLinks, ...supportRotationLinks].slice(0, MAX_INJECTIONS_PER_WEEK);

  // Cluster authority score
  const inbounds = guides.map(g => getInboundLinks(g.slug).length);
  const avgInbound = inbounds.reduce((s, c) => s + c, 0) / Math.max(inbounds.length, 1);
  const hasCornerstoneStrong = (getInboundLinks(cornerstoneSlug).length >= MIN_CORNERSTONE_INBOUND) ? 1 : 0;
  const clusterAuthorityScore = Math.min(100, Math.round(avgInbound * 8 + hasCornerstoneStrong * 25 + guides.length * 1.5));

  return {
    cornerstoneLinks,
    supportRotationLinks,
    totalInjections: allLinks.length,
    clusterAuthorityScore,
  };
}

// ============= CANNIBALIZATION DETECTION =============

function detectClusterCannibalization(cluster: ClusterID): CannibalizationRisk[] {
  const guides = getClusterGuides(cluster);
  const kwMap: Record<string, string[]> = {};

  for (const g of guides) {
    const normalized = g.primaryKW.toLowerCase().trim();
    if (!kwMap[normalized]) kwMap[normalized] = [];
    kwMap[normalized].push(g.slug);
  }

  return Object.entries(kwMap)
    .filter(([, slugs]) => slugs.length > 1)
    .map(([keyword, slugs]) => {
      const roles = slugs.map(s => guides.find(g => g.slug === s)?.role);
      const hasCornerstoneConflict = roles.filter(r => r === 'cornerstone').length > 1;
      return {
        keyword,
        slugs,
        severity: (hasCornerstoneConflict ? 'high' : slugs.length > 2 ? 'high' : 'medium') as 'high' | 'medium' | 'low',
        resolution: `Demote ${slugs.length - 1} page(s) to support role. Keep highest-priority page as primary target.`,
      };
    });
}

// ============= KPI TRACKER =============

function calculateKPI(
  cornerstone: CornerstoneProfile,
  supports: SupportGuideProfile[],
  cannibalization: CannibalizationRisk[],
  dayInPlan: number = 1,
): DominanceKPI {
  const allPositions = [cornerstone.avgPosition, ...supports.map(s => s.avgPosition)];
  const avgClusterPosition = allPositions.reduce((s, p) => s + p, 0) / allPositions.length;

  const allInbound = [cornerstone.inboundLinks, ...supports.map(s =>
    getInboundLinks(s.slug).length
  )];
  const avgInbound = allInbound.reduce((s, c) => s + c, 0) / allInbound.length;

  const cornerstoneTop15 = cornerstone.avgPosition <= 15;
  const cornerstoneInbound8Plus = cornerstone.inboundLinks >= 8;
  const snippetTriggered = cornerstone.avgPosition <= 8 && cornerstone.impressions > 20;
  const zeroCannibalization = cannibalization.length === 0;
  // Can't measure 10+ improvement without baseline, so check if < 35
  const clusterPositionImproved10 = avgClusterPosition < 35;

  const targetsHit = [cornerstoneTop15, clusterPositionImproved10, cornerstoneInbound8Plus, snippetTriggered, zeroCannibalization]
    .filter(Boolean).length;
  const overallProgress = Math.round((targetsHit / 5) * 100);

  return {
    day: dayInPlan,
    cornerstonePosition: cornerstone.avgPosition,
    avgClusterPosition: Math.round(avgClusterPosition * 10) / 10,
    avgInboundLinks: Math.round(avgInbound * 10) / 10,
    snippetOpportunityDetected: snippetTriggered,
    cannibalizationConflicts: cannibalization.length,
    targets: {
      cornerstoneTop15,
      clusterPositionImproved10,
      cornerstoneInbound8Plus,
      snippetTriggered,
      zeroCannibalization,
    },
    overallProgress,
  };
}

// ============= MAIN EXPORT =============

export function buildCornerstoneDominance(
  cluster: ClusterID,
  gscReports: GSCGuideReport[],
  dayInPlan: number = 1,
): CornerstoneDominanceProfile {
  // Build GSC map
  const gscMap: Record<string, { impressions: number; position: number }> = {};
  for (const r of gscReports) {
    const d7 = r.periods['7d'];
    if (d7) gscMap[r.slug] = { impressions: d7.impressions, position: d7.avgPosition };
  }

  // Step 1: Select primary cornerstone
  const primaryGuide = selectPrimaryCornerstone(cluster, gscMap);

  // Step 2: Build profiles
  const primaryCornerstone = buildCornerstoneProfile(primaryGuide, gscMap);
  const supportGuides = buildSupportProfiles(cluster, primaryGuide.slug, gscMap);

  // Step 4: Micro-intent gaps
  const microIntentGaps = detectMicroIntentGaps(cluster);

  // Step 5: Authority loop
  const authorityLoop = analyzeAuthorityLoop(cluster, primaryGuide.slug);

  // Step 7: Weekly plan
  const weeklyPlan = generateWeeklyPlan(cluster, primaryGuide.slug, gscMap);

  // Step 9: Cannibalization
  const cannibalizationRisks = detectClusterCannibalization(cluster);

  // Step 8: KPI
  const kpiTracker = calculateKPI(primaryCornerstone, supportGuides, cannibalizationRisks, dayInPlan);

  return {
    cluster,
    clusterLabel: CLUSTER_LABELS[cluster],
    primaryCornerstone,
    supportGuides,
    microIntentGaps,
    authorityLoop,
    weeklyPlan,
    kpiTracker,
    cannibalizationRisks,
  };
}

export function getAvailableClusters(): { id: ClusterID; label: string; guideCount: number }[] {
  return (Object.entries(CLUSTER_LABELS) as [ClusterID, string][]).map(([id, label]) => ({
    id,
    label,
    guideCount: getClusterGuides(id).length,
  }));
}
