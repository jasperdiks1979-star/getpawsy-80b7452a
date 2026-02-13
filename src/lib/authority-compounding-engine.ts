/**
 * Slow Authority Compounding Engine
 * 
 * Gradually increases average inbound links from ~1-2 to 6-8 over 60 days.
 * Max 6 new links/week sitewide, max 1 per source page per 14 days.
 * Decision-support only — never auto-modifies content.
 */

import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';
import type { GSCGuideReport } from './gsc';

// ============= TYPES =============

export type AnchorMixType = 'semantic' | 'partial' | 'branded' | 'generic';

export interface CompoundingLinkSuggestion {
  sourceSlug: string;
  targetSlug: string;
  anchorText: string;
  anchorType: AnchorMixType;
  reason: string;
  cluster: string;
  priority: number;
}

export interface WeeklyCompoundingPlan {
  weekNumber: number;
  weekDate: string;
  impressionTargets: CompoundingLinkSuggestion[];
  underSupportedTargets: CompoundingLinkSuggestion[];
  totalNewLinks: number;
  stats: CompoundingStats;
}

export interface CompoundingStats {
  avgInboundLinks: number;
  totalGuides: number;
  orphanCount: number;
  underSupportedCount: number;
  guidesAbove6Links: number;
  clusterBreakdown: ClusterCompoundingHealth[];
}

export interface ClusterCompoundingHealth {
  cluster: string;
  guideCount: number;
  avgInbound: number;
  authorityScore: number;
  weakGuides: number;
}

// ============= SAFETY CONSTANTS =============

const MAX_NEW_LINKS_PER_WEEK = 6;
const MAX_LINKS_PER_SOURCE_PER_14_DAYS = 1;
const MAX_EXACT_ANCHOR_REPETITION = 2;
const UNDER_SUPPORTED_THRESHOLD = 4;
const TARGET_AVG_INBOUND = 6;

// ============= ANCHOR MIX (50% semantic, 30% partial, 20% branded/generic) =============

function pickAnchorType(): AnchorMixType {
  const r = Math.random() * 100;
  if (r < 50) return 'semantic';
  if (r < 80) return 'partial';
  if (r < 90) return 'branded';
  return 'generic';
}

function generateAnchor(target: ScalingGuide, type: AnchorMixType): string {
  const kw = target.primaryKW;
  const words = kw.split(' ');

  switch (type) {
    case 'semantic':
      return target.secondaryKWs.length > 0
        ? target.secondaryKWs[Math.floor(Math.random() * target.secondaryKWs.length)]
        : `guide to ${words.slice(-2).join(' ')}`;
    case 'partial':
      return words.length > 3
        ? words.slice(0, 3).join(' ')
        : words.slice(0, 2).join(' ');
    case 'branded':
      return `Pawsy's ${words.slice(-2).join(' ')} guide`;
    case 'generic':
      return 'read our full guide';
  }
}

// ============= INBOUND LINK CALCULATION =============

function getInboundCount(slug: string): number {
  return SCALING_GUIDES.filter(g => g.slug !== slug && g.linksTo.includes(slug)).length;
}

function getInboundSlugs(slug: string): string[] {
  return SCALING_GUIDES.filter(g => g.slug !== slug && g.linksTo.includes(slug)).map(g => g.slug);
}

// ============= WEEKLY PLAN GENERATION =============

/**
 * Generate a weekly compounding plan.
 * 
 * Selection strategy:
 * 1. Top 2 pages with impressions > 10 (high-value targets)
 * 2. Top 2 pages with inbound links < 4 (under-supported)
 * Each gets max 2 contextual link suggestions.
 */
export function generateCompoundingPlan(
  gscReports: GSCGuideReport[],
  recentInjections: { sourceSlug: string; targetSlug: string; createdAt: string }[] = [],
  weekNumber: number = 1,
): WeeklyCompoundingPlan {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // Track recent source usage (max 1 per source per 14 days)
  const recentSourceCount: Record<string, number> = {};
  recentInjections
    .filter(i => new Date(i.createdAt) > fourteenDaysAgo)
    .forEach(i => {
      recentSourceCount[i.sourceSlug] = (recentSourceCount[i.sourceSlug] || 0) + 1;
    });

  // Track anchor text usage for repetition guard
  const anchorUsage: Record<string, number> = {};
  recentInjections.forEach(i => {
    // We don't have anchor text in this interface, so we track by target slug
    anchorUsage[i.targetSlug] = (anchorUsage[i.targetSlug] || 0) + 1;
  });

  // Build metrics map from GSC data
  const gscMap: Record<string, { impressions: number; position: number }> = {};
  for (const r of gscReports) {
    const d7 = r.periods['7d'];
    if (d7) {
      gscMap[r.slug] = { impressions: d7.impressions, position: d7.avgPosition };
    }
  }

  // Strategy 1: Top 2 high-impression pages
  const impressionTargets = SCALING_GUIDES
    .map(g => ({
      guide: g,
      impressions: gscMap[g.slug]?.impressions || 0,
      inbound: getInboundCount(g.slug),
    }))
    .filter(g => g.impressions > 10 && g.inbound < TARGET_AVG_INBOUND)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 2);

  // Strategy 2: Top 2 under-supported pages
  const underSupportedTargets = SCALING_GUIDES
    .map(g => ({
      guide: g,
      impressions: gscMap[g.slug]?.impressions || 0,
      inbound: getInboundCount(g.slug),
    }))
    .filter(g => g.inbound < UNDER_SUPPORTED_THRESHOLD)
    .sort((a, b) => a.inbound - b.inbound)
    .slice(0, 2);

  // Generate link suggestions for each target
  const impSuggestions: CompoundingLinkSuggestion[] = [];
  const usSuggestions: CompoundingLinkSuggestion[] = [];

  for (const target of impressionTargets) {
    const suggestions = generateLinksForTarget(target.guide, recentSourceCount);
    impSuggestions.push(...suggestions.slice(0, 2));
  }

  for (const target of underSupportedTargets) {
    const suggestions = generateLinksForTarget(target.guide, recentSourceCount);
    usSuggestions.push(...suggestions.slice(0, 2));
  }

  // Cap total at 6 per week
  const allSuggestions = [...impSuggestions, ...usSuggestions].slice(0, MAX_NEW_LINKS_PER_WEEK);
  const impCapped = allSuggestions.filter(s => impSuggestions.includes(s));
  const usCapped = allSuggestions.filter(s => usSuggestions.includes(s));

  return {
    weekNumber,
    weekDate: new Date().toISOString().split('T')[0],
    impressionTargets: impCapped,
    underSupportedTargets: usCapped,
    totalNewLinks: allSuggestions.length,
    stats: calculateCompoundingStats(),
  };
}

// ============= LINK GENERATION FOR TARGET =============

function generateLinksForTarget(
  target: ScalingGuide,
  recentSourceCount: Record<string, number>,
): CompoundingLinkSuggestion[] {
  const suggestions: CompoundingLinkSuggestion[] = [];
  const existingInbound = new Set(getInboundSlugs(target.slug));

  // Follow cluster hierarchy: micro → hub, hub → cornerstone, cornerstone → support
  const candidates: ScalingGuide[] = [];

  if (target.role === 'subguide') {
    // Link from hub in same cluster
    const hubs = SCALING_GUIDES.filter(
      g => g.cluster === target.cluster && g.role === 'hub' && g.slug !== target.slug
    );
    candidates.push(...hubs);

    // Link from cornerstone in same cluster
    const cornerstones = SCALING_GUIDES.filter(
      g => g.cluster === target.cluster && g.role === 'cornerstone' && g.slug !== target.slug
    );
    candidates.push(...cornerstones);
  } else if (target.role === 'hub') {
    // Link from cornerstones
    const cornerstones = SCALING_GUIDES.filter(
      g => g.cluster === target.cluster && g.role === 'cornerstone' && g.slug !== target.slug
    );
    candidates.push(...cornerstones);
  } else {
    // Cornerstone: link from supporting guides (3)
    const supports = SCALING_GUIDES.filter(
      g => g.cluster === target.cluster && g.slug !== target.slug
    );
    candidates.push(...supports.slice(0, 5));
  }

  // Also add cross-cluster related guides
  const crossCluster = SCALING_GUIDES.filter(
    g => g.cluster !== target.cluster && g.role !== 'subguide' && g.slug !== target.slug
  ).slice(0, 3);
  candidates.push(...crossCluster);

  for (const source of candidates) {
    if (suggestions.length >= 2) break;
    if (existingInbound.has(source.slug)) continue;
    if ((recentSourceCount[source.slug] || 0) >= MAX_LINKS_PER_SOURCE_PER_14_DAYS) continue;

    const anchorType = pickAnchorType();
    suggestions.push({
      sourceSlug: source.slug,
      targetSlug: target.slug,
      anchorText: generateAnchor(target, anchorType),
      anchorType,
      reason: `${source.role} → ${target.role} (${target.cluster})`,
      cluster: target.cluster,
      priority: target.role === 'cornerstone' ? 3 : target.role === 'hub' ? 2 : 1,
    });
  }

  return suggestions;
}

// ============= COMPOUNDING STATS =============

export function calculateCompoundingStats(): CompoundingStats {
  const inboundCounts = SCALING_GUIDES.map(g => ({
    slug: g.slug,
    cluster: g.cluster,
    role: g.role,
    inbound: getInboundCount(g.slug),
  }));

  const totalGuides = inboundCounts.length;
  const avgInbound = totalGuides > 0
    ? Math.round((inboundCounts.reduce((s, g) => s + g.inbound, 0) / totalGuides) * 10) / 10
    : 0;
  const orphanCount = inboundCounts.filter(g => g.inbound === 0).length;
  const underSupportedCount = inboundCounts.filter(g => g.inbound < UNDER_SUPPORTED_THRESHOLD).length;
  const guidesAbove6Links = inboundCounts.filter(g => g.inbound >= 6).length;

  // Cluster breakdown
  const clusters = [...new Set(inboundCounts.map(g => g.cluster))];
  const clusterBreakdown: ClusterCompoundingHealth[] = clusters.map(cluster => {
    const guides = inboundCounts.filter(g => g.cluster === cluster);
    const clusterAvg = guides.length > 0
      ? Math.round((guides.reduce((s, g) => s + g.inbound, 0) / guides.length) * 10) / 10
      : 0;
    const hasCornerstones = guides.some(g => g.role === 'cornerstone');
    const weakGuides = guides.filter(g => g.inbound < UNDER_SUPPORTED_THRESHOLD).length;
    const authorityScore = Math.min(100, Math.max(0,
      Math.round(clusterAvg * 8 + (hasCornerstones ? 20 : 0) + Math.min(guides.length * 2, 30) - weakGuides * 5)
    ));

    return { cluster, guideCount: guides.length, avgInbound: clusterAvg, authorityScore, weakGuides };
  });

  return { avgInboundLinks: avgInbound, totalGuides, orphanCount, underSupportedCount, guidesAbove6Links, clusterBreakdown };
}

// ============= 60-DAY PROJECTION =============

export interface SixtyDayProjection {
  currentAvgInbound: number;
  targetAvgInbound: number;
  weeksRemaining: number;
  linksPerWeek: number;
  projectedCompletion: string;
  onTrack: boolean;
}

export function calculate60DayProjection(
  currentWeek: number = 1,
): SixtyDayProjection {
  const stats = calculateCompoundingStats();
  const totalWeeks = Math.ceil(60 / 7); // ~8.5 weeks
  const weeksRemaining = Math.max(0, totalWeeks - currentWeek);
  const deficit = Math.max(0, TARGET_AVG_INBOUND - stats.avgInboundLinks);
  const totalLinksNeeded = Math.ceil(deficit * stats.totalGuides);
  const linksPerWeek = weeksRemaining > 0 ? Math.min(MAX_NEW_LINKS_PER_WEEK, Math.ceil(totalLinksNeeded / weeksRemaining)) : 0;

  const completionDate = new Date();
  completionDate.setDate(completionDate.getDate() + weeksRemaining * 7);

  return {
    currentAvgInbound: stats.avgInboundLinks,
    targetAvgInbound: TARGET_AVG_INBOUND,
    weeksRemaining,
    linksPerWeek,
    projectedCompletion: completionDate.toISOString().split('T')[0],
    onTrack: stats.avgInboundLinks >= (TARGET_AVG_INBOUND * currentWeek / totalWeeks),
  };
}
