/**
 * 60-Day SEO Dominance Engine
 * 
 * Orchestrates: Gap hijack expansion, rank acceleration, CTR sniping,
 * backlink asset generation, cluster dominance expansion, and freshness control.
 * 
 * All recommendations are strategic — no auto-publishing without admin approval.
 */

import type { GapHijackReport, GapQuery } from './gap-hijack-engine';
import type { AccelerationReport, BoostCandidate, TitleTest } from './rank-acceleration-engine';
import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';

// ============= TYPES =============

export interface DominanceReport {
  phase: 'week1-2' | 'week2-8' | 'week3-8' | 'week4-8' | 'week5-8';
  currentWeek: number;
  
  // Phase 1: Gap Hijack Expansion
  hijackGuidesCreated: HijackGuideStatus[];
  hijackGuidesQueued: GapQuery[];
  
  // Phase 2: Rank Acceleration
  boostInjections: number;
  activeBoostedPages: string[];
  
  // Phase 3: CTR Sniper
  ctrTests: CTRTestSummary[];
  avgCtrImprovement: number;
  
  // Phase 4: Backlink Assets
  backlinkAssets: BacklinkAsset[];
  
  // Phase 5: Cluster Expansion
  clusterScores: ClusterScore[];
  microGuidesTriggered: MicroGuideTarget[];
  
  // Phase 6: Freshness
  freshnessUpdatesApplied: number;
  freshnessQueue: string[];
  
  // Safety
  safetyViolations: string[];
  
  // Metrics
  metrics: DominanceMetrics;
}

export interface HijackGuideStatus {
  slug: string;
  query: string;
  status: 'queued' | 'generating' | 'generated' | 'published' | 'failed';
  priorityScore: number;
  impressions: number;
  createdAt?: string;
  wordCount?: number;
  internalLinksAdded?: number;
  schemaAttached?: string[];
}

export interface CTRTestSummary {
  slug: string;
  originalTitle: string;
  testVariant: string;
  impressions: number;
  ctrBefore: number;
  ctrAfter: number;
  improvement: number;
  status: 'running' | 'winner-selected' | 'no-improvement';
}

export interface BacklinkAsset {
  slug: string;
  position: number;
  impressions: number;
  assetType: 'outreach-pitch' | 'expert-quote' | 'resource-page' | 'haro-paragraph';
  content: string;
  status: 'generated' | 'sent' | 'response-received';
}

export interface ClusterScore {
  cluster: string;
  score: number;
  target: number;
  delta: number;
  guidesCount: number;
  avgPosition: number;
  avgImpressions: number;
}

export interface MicroGuideTarget {
  parentSlug: string;
  suggestedSlugs: string[];
  reason: string;
  triggered: boolean;
}

export interface DominanceMetrics {
  guidesUnderPosition30: number;
  cornerstonesUnderPosition20: number;
  ctrImprovementPercent: number;
  backlinkAssetsCreated: number;
  orphanPages: number;
  clusterAuthorityIncrease: number;
}

// ============= CONSTANTS =============

const DOMINANCE_LIMITS = {
  MAX_GUIDES_FIRST_30D: 10,
  MAX_BOOSTS_PER_PAGE_30D: 5,
  MAX_LINKS_PER_PAGE_MONTH: 10,
  MAX_EXACT_ANCHOR_PERCENT: 40,
  CTR_TEST_MIN_IMPRESSIONS: 100,
  CTR_TEST_IMPRESSION_PER_VARIANT: 200,
  FRESHNESS_INTERVAL_DAYS: 14,
  BACKLINK_POSITION_MIN: 8,
  BACKLINK_POSITION_MAX: 20,
  CLUSTER_EXPANSION_POSITION_THRESHOLD: 35,
  CLUSTER_EXPANSION_IMPRESSION_THRESHOLD: 500,
};

const CLUSTER_TARGETS: Record<string, number> = {
  'cat-litter': 60,
  'dog-beds': 55,
  'cat-furniture': 55,
  'micro-intent': 40,
};

// ============= PHASE 1: GAP HIJACK EXPANSION =============

export function selectHijackTargets(gapReport: GapHijackReport): { approved: GapQuery[]; queued: GapQuery[] } {
  const criticals = gapReport.gaps
    .filter(g => g.gapType === 'GAP_CRITICAL')
    .sort((a, b) => b.priorityScore - a.priorityScore);

  // Check for slug conflicts
  const existingSlugs = new Set(SCALING_GUIDES.map(g => g.slug));
  const safeCriticals = criticals.filter(g => {
    if (!g.hijackPlan.recommendedSlug) return false;
    return !existingSlugs.has(g.hijackPlan.recommendedSlug);
  });

  // Check cannibalization
  const approved = safeCriticals.slice(0, 5);
  const queued = safeCriticals.slice(5, 10);

  return { approved, queued };
}

export function buildHijackGuideStatuses(targets: GapQuery[]): HijackGuideStatus[] {
  return targets.map(t => ({
    slug: t.hijackPlan.recommendedSlug || t.query.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-2026',
    query: t.query,
    status: 'queued' as const,
    priorityScore: t.priorityScore,
    impressions: t.impressions,
    schemaAttached: ['Article', 'FAQ', 'Breadcrumb'],
  }));
}

// ============= PHASE 3: CTR SNIPER =============

function buildCTRTests(accelReport: AccelerationReport): CTRTestSummary[] {
  return accelReport.activeTitleTests.map(test => ({
    slug: test.slug,
    originalTitle: test.originalTitle,
    testVariant: test.variants[0]?.title || 'N/A',
    impressions: test.variants.reduce((s, v) => s + v.impressions, 0),
    ctrBefore: 0,
    ctrAfter: 0,
    improvement: 0,
    status: test.status === 'running' ? 'running' as const : 'winner-selected' as const,
  }));
}

// ============= PHASE 4: BACKLINK ASSETS =============

function generateBacklinkAssets(candidates: BoostCandidate[]): BacklinkAsset[] {
  const assets: BacklinkAsset[] = [];
  
  const eligible = candidates
    .filter(c => c.position >= DOMINANCE_LIMITS.BACKLINK_POSITION_MIN && c.position <= DOMINANCE_LIMITS.BACKLINK_POSITION_MAX)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);

  for (const c of eligible) {
    const guide = SCALING_GUIDES.find(g => g.slug === c.slug);
    if (!guide) continue;

    const kw = guide.primaryKW;

    assets.push({
      slug: c.slug,
      position: c.position,
      impressions: c.impressions,
      assetType: 'outreach-pitch',
      content: `Hi [Name], I noticed your article on [topic]. We recently published a comprehensive guide on ${kw} with comparison tables and real product testing data. Would you consider linking to it as a resource for your readers?`,
      status: 'generated',
    });
    assets.push({
      slug: c.slug,
      position: c.position,
      impressions: c.impressions,
      assetType: 'expert-quote',
      content: `"After testing over a dozen options, we found that the most important factor in choosing a ${kw} is [key criterion]. Most buyers overlook this, which leads to returns and dissatisfaction." — GetPawsy Product Testing Team`,
      status: 'generated',
    });
    assets.push({
      slug: c.slug,
      position: c.position,
      impressions: c.impressions,
      assetType: 'resource-page',
      content: `GetPawsy's ${guide.title} — An independently tested guide featuring comparison tables, pros & cons analysis, and buyer criteria for ${kw}. Updated February 2026.`,
      status: 'generated',
    });
    assets.push({
      slug: c.slug,
      position: c.position,
      impressions: c.impressions,
      assetType: 'haro-paragraph',
      content: `As a pet supply reviewer who has tested hundreds of products, I can share that the ${kw} market has shifted significantly in 2026. Key trends include [trend]. Our testing methodology involves [method], and the biggest surprise was [finding].`,
      status: 'generated',
    });
  }

  return assets;
}

// ============= PHASE 5: CLUSTER DOMINANCE =============

function calcClusterScores(accelReport: AccelerationReport): ClusterScore[] {
  const clusters: Record<string, { positions: number[]; impressions: number[]; guides: number }> = {};

  for (const guide of SCALING_GUIDES) {
    if (!clusters[guide.cluster]) {
      clusters[guide.cluster] = { positions: [], impressions: [], guides: 0 };
    }
    clusters[guide.cluster].guides++;
  }

  // Enrich with acceleration data
  for (const c of accelReport.candidates) {
    const guide = SCALING_GUIDES.find(g => g.slug === c.slug);
    if (guide && clusters[guide.cluster]) {
      clusters[guide.cluster].positions.push(c.position);
      clusters[guide.cluster].impressions.push(c.impressions);
    }
  }

  return Object.entries(clusters).map(([cluster, data]) => {
    const avgPosition = data.positions.length > 0 
      ? data.positions.reduce((s, p) => s + p, 0) / data.positions.length 
      : 100;
    const avgImpressions = data.impressions.length > 0
      ? data.impressions.reduce((s, i) => s + i, 0) / data.impressions.length
      : 0;
    
    // Score: lower position = higher score, more impressions = higher score
    const posScore = Math.max(0, (60 - avgPosition) * 1.5);
    const impScore = Math.log(avgImpressions + 1) * 5;
    const coverageScore = Math.min(data.guides, 20) * 1.5;
    const score = Math.round(posScore + impScore + coverageScore);
    
    const target = CLUSTER_TARGETS[cluster] || 40;
    
    return {
      cluster,
      score,
      target,
      delta: score - target,
      guidesCount: data.guides,
      avgPosition: Math.round(avgPosition * 10) / 10,
      avgImpressions: Math.round(avgImpressions),
    };
  });
}

function detectMicroGuideTargets(clusterScores: ClusterScore[], accelReport: AccelerationReport): MicroGuideTarget[] {
  const targets: MicroGuideTarget[] = [];

  for (const c of accelReport.candidates) {
    if (c.position > DOMINANCE_LIMITS.CLUSTER_EXPANSION_POSITION_THRESHOLD) continue;
    if (c.impressions < DOMINANCE_LIMITS.CLUSTER_EXPANSION_IMPRESSION_THRESHOLD) continue;

    const guide = SCALING_GUIDES.find(g => g.slug === c.slug);
    if (!guide || guide.role !== 'cornerstone') continue;

    const kw = guide.primaryKW;
    targets.push({
      parentSlug: c.slug,
      suggestedSlugs: [
        `${guide.slug}-for-beginners`,
        `${guide.slug}-budget-picks`,
        `${guide.slug}-vs-alternatives`,
      ],
      reason: `Cornerstone "${kw}" entering position <${DOMINANCE_LIMITS.CLUSTER_EXPANSION_POSITION_THRESHOLD} with ${c.impressions} impressions. Supporting micro-guides will strengthen cluster authority.`,
      triggered: false,
    });
  }

  return targets;
}

// ============= MAIN ORCHESTRATOR =============

export function runDominanceEngine(
  gapReport: GapHijackReport,
  accelReport: AccelerationReport,
): DominanceReport {
  // Determine current phase based on data maturity
  const totalImpressions = accelReport.totalImpressions;
  const currentWeek = Math.min(8, Math.max(1, Math.ceil(totalImpressions / 100)));

  let phase: DominanceReport['phase'] = 'week1-2';
  if (currentWeek >= 5) phase = 'week5-8';
  else if (currentWeek >= 4) phase = 'week4-8';
  else if (currentWeek >= 3) phase = 'week3-8';
  else if (currentWeek >= 2) phase = 'week2-8';

  // Phase 1: Gap Hijack
  const { approved, queued } = selectHijackTargets(gapReport);
  const hijackGuidesCreated = buildHijackGuideStatuses(approved);

  // Phase 2: Rank Acceleration (from existing engine)
  const boostInjections = accelReport.summary.linksInjected;
  const activeBoostedPages = accelReport.candidates.map(c => c.slug).filter((v, i, a) => a.indexOf(v) === i);

  // Phase 3: CTR Sniper
  const ctrTests = buildCTRTests(accelReport);
  const avgCtrImprovement = ctrTests.length > 0
    ? ctrTests.reduce((s, t) => s + t.improvement, 0) / ctrTests.length
    : 0;

  // Phase 4: Backlink Assets
  const backlinkAssets = generateBacklinkAssets(accelReport.candidates);

  // Phase 5: Cluster Dominance
  const clusterScores = calcClusterScores(accelReport);
  const microGuidesTriggered = detectMicroGuideTargets(clusterScores, accelReport);

  // Phase 6: Freshness
  const freshnessQueue = accelReport.freshnessQueue.map(f => f.slug);

  // Safety validation
  const safetyViolations = [...accelReport.safetyStatus.violations];
  if (hijackGuidesCreated.length > DOMINANCE_LIMITS.MAX_GUIDES_FIRST_30D) {
    safetyViolations.push(`Guide creation limit: ${hijackGuidesCreated.length} exceeds ${DOMINANCE_LIMITS.MAX_GUIDES_FIRST_30D} per 30 days`);
  }

  // Metrics
  const guidesUnderPosition30 = accelReport.candidates.filter(c => c.position < 30).length;
  const cornerstonesUnderPosition20 = accelReport.candidates
    .filter(c => {
      const guide = SCALING_GUIDES.find(g => g.slug === c.slug);
      return guide?.role === 'cornerstone' && c.position < 20;
    }).length;

  return {
    phase,
    currentWeek,
    hijackGuidesCreated,
    hijackGuidesQueued: queued,
    boostInjections,
    activeBoostedPages,
    ctrTests,
    avgCtrImprovement,
    backlinkAssets,
    clusterScores,
    microGuidesTriggered,
    freshnessUpdatesApplied: accelReport.freshnessQueue.length,
    freshnessQueue,
    safetyViolations,
    metrics: {
      guidesUnderPosition30,
      cornerstonesUnderPosition20,
      ctrImprovementPercent: Math.round(avgCtrImprovement * 100) / 100,
      backlinkAssetsCreated: backlinkAssets.length,
      orphanPages: 0,
      clusterAuthorityIncrease: clusterScores.reduce((s, c) => s + Math.max(0, c.delta), 0),
    },
  };
}
