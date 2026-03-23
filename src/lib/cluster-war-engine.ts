/**
 * Cluster War Engine
 * 
 * Cross-cluster strategy management for Dog Beds + Cat Litter.
 * Prevents keyword cannibalization, enforces authority isolation,
 * and manages controlled cross-reinforcement.
 */

// ============= CLUSTER DEFINITIONS =============

export interface ClusterDefinition {
  id: string;
  name: string;
  cornerstone: string;
  snippetTarget: string;
  snippetStructure: 'paragraph' | 'list' | 'table';
  keywordFamily: string[];
  supportSlugs: string[];
  microSlugs: string[];
}

export const DOG_BEDS_CLUSTER: ClusterDefinition = {
  id: 'dog-beds',
  name: 'Dog Beds',
  cornerstone: 'best-dog-bed-2026',
  snippetTarget: 'What Is the Best Dog Bed in 2026?',
  snippetStructure: 'paragraph',
  keywordFamily: [
    'dog bed', 'orthopedic dog bed', 'calming dog bed', 'memory foam dog bed',
    'elevated dog bed', 'outdoor dog bed', 'washable dog bed', 'dog bed size',
    'large breed dog bed', 'small dog bed', 'dog bed anxiety', 'dog bed under 100',
    'dog bed buying guide', 'dog cot', 'pet bed',
  ],
  supportSlugs: [
    'best-orthopedic-dog-bed', 'best-orthopedic-dog-bed-2026',
    'calming-dog-bed-anxiety', 'dog-bed-for-large-breeds',
    'memory-foam-vs-standard-dog-bed', 'best-outdoor-dog-bed',
    'best-dog-bed-for-small-dogs', 'dog-bed-buying-guide',
  ],
  microSlugs: [
    'best-dog-bed-under-100', 'dog-bed-for-anxiety',
    'machine-washable-dog-bed-guide', 'dog-bed-size-chart-guide',
  ],
};

export const CAT_LITTER_CLUSTER: ClusterDefinition = {
  id: 'cat-litter',
  name: 'Cat Litter',
  cornerstone: 'best-cat-litter-box-2026',
  snippetTarget: 'What Is the Best Cat Litter Box in 2026?',
  snippetStructure: 'table',
  keywordFamily: [
    'cat litter box', 'litter box', 'self cleaning litter box', 'covered litter box',
    'litter box odor', 'litter box furniture', 'extra large litter box',
    'high sided litter box', 'litter box for apartments', 'multi cat litter box',
    'automatic litter box', 'litter box placement', 'cat box', 'kitty litter box',
  ],
  supportSlugs: [
    'best-extra-large-litter-boxes', 'best-odor-control-litter-box',
    'best-litter-box-small-apartments', 'how-many-litter-boxes-per-cat',
    'covered-vs-open-litter-box', 'best-cat-litter-box-furniture-enclosures-2026',
    'best-self-cleaning-litter-box-2026', 'best-litter-box-senior-cats',
    'best-litter-box-kittens', 'best-low-tracking-litter-box',
    'automatic-vs-manual-litter-box', 'litter-box-placement-guide',
    'best-litter-box-odor-bathroom',
    // Self-cleaning litter box sub-cluster
    'how-to-reduce-cat-litter-smell',
    'do-automatic-litter-boxes-work',
    'self-cleaning-vs-traditional-litter-box',
    'litter-box-for-multiple-cats',
    'how-often-to-clean-litter-box',
    'cat-litter-smell-solutions',
    'smart-litter-box-review',
    'is-automatic-litter-box-safe',
    'litter-box-cleaning-tips',
  ],
  microSlugs: [
    'litter-box-for-studio-apartment', 'best-litter-box-for-multiple-cats',
    'top-rated-litter-box-under-100', 'high-sided-litter-box-guide',
    'litter-box-odor-control-tips', 'best-litter-box-studio-apartment',
    'best-litter-boxes-multi-cat', 'best-litter-box-under-100',
    'best-high-sided-litter-box', 'cat-litter-box-odor-solutions',
  ],
};

export const ALL_CLUSTERS = [DOG_BEDS_CLUSTER, CAT_LITTER_CLUSTER];

// ============= KEYWORD FIREWALL =============

export interface KeywordConflict {
  keyword: string;
  cluster1: string;
  slug1: string;
  cluster2: string;
  slug2: string;
  severity: 'high' | 'medium' | 'low';
  resolution: string;
}

export function detectCrossClusterCannibalization(
  guideKeywords: Record<string, string[]>
): KeywordConflict[] {
  const conflicts: KeywordConflict[] = [];

  const cluster1Slugs = new Set([
    DOG_BEDS_CLUSTER.cornerstone,
    ...DOG_BEDS_CLUSTER.supportSlugs,
    ...DOG_BEDS_CLUSTER.microSlugs,
  ]);
  const cluster2Slugs = new Set([
    CAT_LITTER_CLUSTER.cornerstone,
    ...CAT_LITTER_CLUSTER.supportSlugs,
    ...CAT_LITTER_CLUSTER.microSlugs,
  ]);

  for (const [slug1, kws1] of Object.entries(guideKeywords)) {
    if (!cluster1Slugs.has(slug1) && !cluster2Slugs.has(slug1)) continue;
    const c1 = cluster1Slugs.has(slug1) ? DOG_BEDS_CLUSTER : CAT_LITTER_CLUSTER;

    for (const [slug2, kws2] of Object.entries(guideKeywords)) {
      if (slug1 >= slug2) continue;
      if (!cluster1Slugs.has(slug2) && !cluster2Slugs.has(slug2)) continue;
      const c2 = cluster1Slugs.has(slug2) ? DOG_BEDS_CLUSTER : CAT_LITTER_CLUSTER;

      // Only flag cross-cluster conflicts
      if (c1.id === c2.id) continue;

      const shared = kws1.filter(k => kws2.includes(k));
      for (const kw of shared) {
        const isCornerstoneConflict =
          slug1 === c1.cornerstone || slug2 === c2.cornerstone;
        conflicts.push({
          keyword: kw,
          cluster1: c1.name,
          slug1,
          cluster2: c2.name,
          slug2,
          severity: isCornerstoneConflict ? 'high' : shared.length > 2 ? 'medium' : 'low',
          resolution: `Remove "${kw}" from the weaker page's target keywords. Ensure H1 and meta title differentiation.`,
        });
      }
    }
  }

  return conflicts;
}

// ============= CROSS-CLUSTER LINK RULES =============

export interface CrossClusterLinkViolation {
  sourceSlug: string;
  sourceCluster: string;
  targetSlug: string;
  targetCluster: string;
  violation: string;
}

export function validateCrossClusterLinks(
  linkMap: Record<string, string[]>
): CrossClusterLinkViolation[] {
  const violations: CrossClusterLinkViolation[] = [];

  const dogBedsSlugs = new Set([
    DOG_BEDS_CLUSTER.cornerstone,
    ...DOG_BEDS_CLUSTER.supportSlugs,
    ...DOG_BEDS_CLUSTER.microSlugs,
  ]);
  const catLitterSlugs = new Set([
    CAT_LITTER_CLUSTER.cornerstone,
    ...CAT_LITTER_CLUSTER.supportSlugs,
    ...CAT_LITTER_CLUSTER.microSlugs,
  ]);

  for (const [source, targets] of Object.entries(linkMap)) {
    const sourceCluster = dogBedsSlugs.has(source)
      ? DOG_BEDS_CLUSTER
      : catLitterSlugs.has(source)
        ? CAT_LITTER_CLUSTER
        : null;

    if (!sourceCluster) continue;

    let crossClusterCount = 0;

    for (const target of targets) {
      const targetCluster = dogBedsSlugs.has(target)
        ? DOG_BEDS_CLUSTER
        : catLitterSlugs.has(target)
          ? CAT_LITTER_CLUSTER
          : null;

      if (!targetCluster || targetCluster.id === sourceCluster.id) continue;

      crossClusterCount++;

      // Cornerstones may link to each other's cornerstone (1 allowed)
      const isCornerstoneToCornerstone =
        source === sourceCluster.cornerstone && target === targetCluster.cornerstone;

      // Support/micro guides: max 1 cross-cluster link
      if (source !== sourceCluster.cornerstone && crossClusterCount > 1) {
        violations.push({
          sourceSlug: source,
          sourceCluster: sourceCluster.name,
          targetSlug: target,
          targetCluster: targetCluster.name,
          violation: `Support/micro guide "${source}" has ${crossClusterCount} cross-cluster links (max 1 allowed)`,
        });
      }

      // Cornerstone: only link to the other cornerstone, not support/micro in other cluster
      if (source === sourceCluster.cornerstone && !isCornerstoneToCornerstone) {
        violations.push({
          sourceSlug: source,
          sourceCluster: sourceCluster.name,
          targetSlug: target,
          targetCluster: targetCluster.name,
          violation: `Cornerstone "${source}" links to non-cornerstone "${target}" in other cluster. Only cornerstone↔cornerstone allowed.`,
        });
      }
    }
  }

  return violations;
}

// ============= WEEKLY WAR CYCLE =============

export interface WeeklyWarPlan {
  weekNumber: number;
  dogBedsAction: string;
  catLitterAction: string;
  totalInjections: number;
  cornerstoneReinforced: string | null;
  balanceCheck: 'balanced' | 'dog-beds-leading' | 'cat-litter-leading';
  pauseCluster: string | null;
}

export function generateWeeklyWarPlan(
  weekNumber: number,
  dogBedsImpressions: number,
  catLitterImpressions: number,
  lastWeekCornerstone: string | null
): WeeklyWarPlan {
  const total = dogBedsImpressions + catLitterImpressions;
  const dogBedsShare = total > 0 ? dogBedsImpressions / total : 0.5;
  const catLitterShare = total > 0 ? catLitterImpressions / total : 0.5;

  const imbalance = Math.abs(dogBedsShare - catLitterShare);
  const leading = dogBedsShare > catLitterShare ? 'dog-beds' : 'cat-litter';

  let balanceCheck: WeeklyWarPlan['balanceCheck'] = 'balanced';
  let pauseCluster: string | null = null;

  if (imbalance > 0.20) {
    balanceCheck = leading === 'dog-beds' ? 'dog-beds-leading' : 'cat-litter-leading';
    pauseCluster = leading === 'dog-beds' ? 'Dog Beds' : 'Cat Litter';
  }

  // Alternate cornerstone reinforcement weekly
  const cornerstoneThisWeek =
    lastWeekCornerstone === DOG_BEDS_CLUSTER.cornerstone
      ? CAT_LITTER_CLUSTER.cornerstone
      : lastWeekCornerstone === CAT_LITTER_CLUSTER.cornerstone
        ? DOG_BEDS_CLUSTER.cornerstone
        : weekNumber % 2 === 1
          ? DOG_BEDS_CLUSTER.cornerstone
          : CAT_LITTER_CLUSTER.cornerstone;

  return {
    weekNumber,
    dogBedsAction: pauseCluster === 'Dog Beds'
      ? 'PAUSED — leading by >20%'
      : 'Strengthen 1 support guide + 2 contextual links',
    catLitterAction: pauseCluster === 'Cat Litter'
      ? 'PAUSED — leading by >20%'
      : 'Strengthen 1 support guide + 2 contextual links',
    totalInjections: 6,
    cornerstoneReinforced: pauseCluster ? null : cornerstoneThisWeek,
    balanceCheck,
    pauseCluster,
  };
}

// ============= SAFETY LIMITS =============

export const CLUSTER_WAR_SAFETY = {
  maxOutboundPerArticle: 8,
  maxCrossClusterLinksPerSupport: 1,
  maxCrossClusterLinksPerCornerstone: 1,
  maxExactAnchorRepetition: 2,
  maxWeeklyInjections: 6,
  maxStructuralEditsPerPagePer14Days: 1,
  noSlugChanges: true,
  noMassTitleRewrites: true,
  noDuplicateSchema: true,
  requireManualApproval: true,
} as const;

// ============= CLUSTER HEALTH METRICS =============

export interface ClusterWarMetrics {
  clusterId: string;
  clusterName: string;
  cornerstone: string;
  totalGuides: number;
  supportCount: number;
  microCount: number;
  avgInboundLinks: number;
  cornerstoneInbound: number;
  cannibalizationScore: number; // 0 = clean, higher = worse
  snippetDetected: boolean;
  clusterScore: number;
}

export function calculateClusterMetrics(
  cluster: ClusterDefinition,
  linkMap: Record<string, string[]>,
  guideKeywords: Record<string, string[]>,
  existingSlugs: Set<string>
): ClusterWarMetrics {
  const allSlugs = [cluster.cornerstone, ...cluster.supportSlugs, ...cluster.microSlugs];
  const activeSlugs = allSlugs.filter(s => existingSlugs.has(s));

  // Calculate inbound links for each guide
  const inboundCounts: Record<string, number> = {};
  for (const slug of allSlugs) {
    inboundCounts[slug] = Object.entries(linkMap)
      .filter(([, targets]) => targets.includes(slug))
      .length;
  }

  const cornerstoneInbound = inboundCounts[cluster.cornerstone] || 0;
  const avgInbound = activeSlugs.length > 0
    ? activeSlugs.reduce((sum, s) => sum + (inboundCounts[s] || 0), 0) / activeSlugs.length
    : 0;

  // Intra-cluster cannibalization
  let cannibScore = 0;
  for (let i = 0; i < activeSlugs.length; i++) {
    for (let j = i + 1; j < activeSlugs.length; j++) {
      const kw1 = guideKeywords[activeSlugs[i]] || [];
      const kw2 = guideKeywords[activeSlugs[j]] || [];
      const shared = kw1.filter(k => kw2.includes(k));
      cannibScore += shared.length;
    }
  }

  const coverageTarget = cluster.id === 'cat-litter' ? 20 : 15;
  const linkTarget = cluster.id === 'cat-litter' ? 14 : 12;
  const coverageScore = Math.min(100, (activeSlugs.length / coverageTarget) * 100);
  const linkScore = Math.min(100, (cornerstoneInbound / linkTarget) * 100);
  const clusterScore = Math.round(coverageScore * 0.4 + linkScore * 0.6);

  return {
    clusterId: cluster.id,
    clusterName: cluster.name,
    cornerstone: cluster.cornerstone,
    totalGuides: activeSlugs.length,
    supportCount: cluster.supportSlugs.filter(s => existingSlugs.has(s)).length,
    microCount: cluster.microSlugs.filter(s => existingSlugs.has(s)).length,
    avgInboundLinks: Math.round(avgInbound * 10) / 10,
    cornerstoneInbound,
    cannibalizationScore: cannibScore,
    snippetDetected: false,
    clusterScore,
  };
}
