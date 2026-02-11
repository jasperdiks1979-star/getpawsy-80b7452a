/**
 * Competitor Gap Hijack Engine
 * 
 * Identifies SERP gaps where competitors rank but GetPawsy has no/weak coverage.
 * Generates strategic hijack plans without creating content automatically.
 * 
 * Phases:
 * 1. SERP Gap Detection — analyze GSC queries for coverage gaps
 * 2. Competitor SERP Snapshot — pattern analysis of winning content
 * 3. Hijack Plan Generator — actionable recommendations per gap type
 * 4. Priority Scoring — rank gaps by opportunity value
 * 5. Safety — prevent cannibalization and duplicate intent
 */

import type { GSCGuideReport, GSCQueryMetrics } from './gsc';
import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';

// ============= TYPES =============

export type GapType = 'GAP_CRITICAL' | 'GAP_WEAK' | 'GAP_OPPORTUNITY';

export interface SERPPattern {
  contentLengthEstimate: 'short' | 'medium' | 'longform';
  faqCountEstimate: number;
  hasComparisonTable: boolean;
  hasReviewSchema: boolean;
  titleStyle: ('list-number' | 'emotional' | 'benefit' | 'year' | 'question')[];
}

export interface GapQuery {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgPosition: number;
  gapType: GapType;
  priorityScore: number;
  matchedSlug: string | null;
  matchType: 'exact' | 'partial' | 'mention-only' | 'none';
  serpPattern: SERPPattern;
  hijackPlan: HijackPlan;
}

export interface HijackPlan {
  // For GAP_CRITICAL
  recommendedSlug?: string;
  suggestedH1?: string;
  suggestedH2s?: string[];
  suggestedFAQs?: string[];
  comparisonTableRecommended?: boolean;
  internalLinkTargets?: string[];
  // For GAP_WEAK
  contentExpansion?: string;
  faqAdditions?: string[];
  linkBoostPlan?: string;
  titleOptimization?: string;
  // For GAP_OPPORTUNITY
  quickWins?: string[];
  anchorInjectionPlan?: string;
  ctrOptimization?: string;
}

export interface GapHijackReport {
  totalGapQueries: number;
  criticalCount: number;
  weakCount: number;
  opportunityCount: number;
  gaps: GapQuery[];
  top5HijackTargets: GapQuery[];
  cannibalizationRisks: string[];
}

// ============= CONSTANTS =============

const GAP_THRESHOLDS = {
  minImpressions: 10,
  criticalPosition: 35,    // No page or position > 35
  weakPositionMin: 35,
  weakPositionMax: 100,
  opportunityPositionMin: 20,
  opportunityPositionMax: 35,
};

// ============= PHASE 1: SERP GAP DETECTION =============

function normalizeQuery(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, ' ');
}

function findMatchingGuide(query: string): { guide: ScalingGuide | null; matchType: 'exact' | 'partial' | 'mention-only' | 'none' } {
  const nq = normalizeQuery(query);

  // Exact match: query closely matches a primary keyword
  for (const guide of SCALING_GUIDES) {
    const pk = normalizeQuery(guide.primaryKW);
    if (nq === pk || nq.includes(pk) || pk.includes(nq)) {
      return { guide, matchType: 'exact' };
    }
  }

  // Partial match: query overlaps with secondary keywords
  for (const guide of SCALING_GUIDES) {
    for (const sk of guide.secondaryKWs) {
      const nsk = normalizeQuery(sk);
      if (nq.includes(nsk) || nsk.includes(nq)) {
        return { guide, matchType: 'partial' };
      }
    }
  }

  // Mention-only: query words overlap significantly with a guide's slug
  for (const guide of SCALING_GUIDES) {
    const slugWords = guide.slug.replace(/-/g, ' ').split(' ').filter(w => w.length > 3);
    const queryWords = nq.split(' ').filter(w => w.length > 3);
    const overlap = queryWords.filter(w => slugWords.some(sw => sw.includes(w) || w.includes(sw)));
    if (overlap.length >= 2 && overlap.length / queryWords.length >= 0.5) {
      return { guide, matchType: 'mention-only' };
    }
  }

  return { guide: null, matchType: 'none' };
}

function classifyGap(avgPosition: number, matchType: 'exact' | 'partial' | 'mention-only' | 'none'): GapType {
  if (matchType === 'none') return 'GAP_CRITICAL';
  if (matchType === 'mention-only' && avgPosition > GAP_THRESHOLDS.criticalPosition) return 'GAP_CRITICAL';
  if (avgPosition > GAP_THRESHOLDS.criticalPosition) return 'GAP_WEAK';
  if (avgPosition >= GAP_THRESHOLDS.opportunityPositionMin) return 'GAP_OPPORTUNITY';
  return 'GAP_OPPORTUNITY';
}

// ============= PHASE 2: COMPETITOR SERP SNAPSHOT =============

function analyzeSERPPattern(query: string): SERPPattern {
  const q = normalizeQuery(query);
  const words = q.split(' ');

  // Detect title style from query patterns
  const titleStyle: SERPPattern['titleStyle'] = [];
  if (/\d+/.test(q) || /top \d|best \d/i.test(q)) titleStyle.push('list-number');
  if (/best|ultimate|honest|real/i.test(q)) titleStyle.push('emotional');
  if (/for|how to|guide/i.test(q)) titleStyle.push('benefit');
  if (/202[4-9]/i.test(q)) titleStyle.push('year');
  if (/how|what|why|when|which|can|do|is|are/i.test(q)) titleStyle.push('question');
  if (titleStyle.length === 0) titleStyle.push('benefit');

  // Estimate content length based on intent signals
  const isComparison = /vs|versus|compare|comparison/i.test(q);
  const isList = /best|top|review/i.test(q);
  const isQuestion = /how|what|why/i.test(q);

  let contentLengthEstimate: SERPPattern['contentLengthEstimate'] = 'medium';
  if (isList || isComparison) contentLengthEstimate = 'longform';
  if (isQuestion && words.length <= 5) contentLengthEstimate = 'short';

  return {
    contentLengthEstimate,
    faqCountEstimate: isQuestion ? 3 : isList ? 5 : 2,
    hasComparisonTable: isComparison || isList,
    hasReviewSchema: isList,
    titleStyle,
  };
}

// ============= PHASE 3: HIJACK PLAN GENERATOR =============

function generateHijackPlan(query: string, gapType: GapType, matchedGuide: ScalingGuide | null): HijackPlan {
  const q = normalizeQuery(query);

  if (gapType === 'GAP_CRITICAL') {
    const slug = q.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    const titleKW = query.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Find best cluster to link into
    const clusterGuides = findRelatedClusterGuides(query);

    return {
      recommendedSlug: `${slug}-2026`,
      suggestedH1: `${titleKW} — Complete Guide (2026)`,
      suggestedH2s: [
        `What to Look For in ${titleKW}`,
        `Top Picks for ${titleKW}`,
        `How to Choose the Right ${titleKW}`,
        `${titleKW} Comparison Table`,
        `Common Mistakes When Buying ${titleKW}`,
      ],
      suggestedFAQs: [
        `What is the best ${q}?`,
        `How much does a good ${q} cost?`,
        `Is ${q} worth it?`,
        `What are the pros and cons of ${q}?`,
        `Where to buy ${q}?`,
      ],
      comparisonTableRecommended: true,
      internalLinkTargets: clusterGuides.map(g => g.slug).slice(0, 5),
    };
  }

  if (gapType === 'GAP_WEAK') {
    return {
      contentExpansion: `Expand existing content for "${query}" — add 300+ words covering user intent, comparison data, and updated recommendations.`,
      faqAdditions: [
        `What makes the best ${q}?`,
        `${q} — is it worth upgrading in 2026?`,
      ],
      linkBoostPlan: `Inject 3 contextual inbound links from cluster subguides targeting "${query}" with mixed anchor types.`,
      titleOptimization: `Test emotional variant: "Best ${query.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} — Tested & Reviewed (2026)"`,
    };
  }

  // GAP_OPPORTUNITY
  return {
    quickWins: [
      `Add exact-match H2 for "${query}" in existing guide content`,
      `Create FAQ entry targeting "${query}" intent`,
      `Add comparison row mentioning "${query}" products`,
    ],
    anchorInjectionPlan: `Inject 2 partial-match internal links using anchor variations of "${query}" from related guides.`,
    ctrOptimization: `Test title with list-number format: "Top 7 ${query.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} (2026)"`,
  };
}

function findRelatedClusterGuides(query: string): ScalingGuide[] {
  const q = normalizeQuery(query);
  const scored = SCALING_GUIDES.map(g => {
    const slugWords = g.slug.replace(/-/g, ' ').split(' ');
    const queryWords = q.split(' ').filter(w => w.length > 2);
    const overlap = queryWords.filter(w => slugWords.some(sw => sw.includes(w) || w.includes(sw))).length;
    return { guide: g, overlap };
  }).filter(s => s.overlap > 0).sort((a, b) => b.overlap - a.overlap);

  return scored.map(s => s.guide);
}

// ============= PHASE 4: PRIORITY SCORING =============

function calcGapPriorityScore(impressions: number, avgPosition: number): number {
  const impressionScore = Math.log(impressions + 1) * 10;
  const positionScore = (40 - Math.min(avgPosition, 40)) * 1.5;
  return Math.round((impressionScore + positionScore) * 100) / 100;
}

// ============= PHASE 6: SAFETY =============

function checkCannibalizationRisk(gaps: GapQuery[]): string[] {
  const risks: string[] = [];
  const slugsByQuery = new Map<string, string[]>();

  // Check if recommended slugs overlap with existing guides
  for (const gap of gaps) {
    if (gap.hijackPlan.recommendedSlug) {
      const existing = SCALING_GUIDES.find(g => g.slug === gap.hijackPlan.recommendedSlug);
      if (existing) {
        risks.push(`Recommended slug "${gap.hijackPlan.recommendedSlug}" already exists as ${existing.role}.`);
      }
    }

    // Check for intent overlap among gap recommendations
    const key = gap.query.split(' ').sort().join(' ');
    if (!slugsByQuery.has(key)) slugsByQuery.set(key, []);
    slugsByQuery.get(key)!.push(gap.query);
  }

  for (const [, queries] of slugsByQuery) {
    if (queries.length > 1) {
      risks.push(`Potential duplicate intent: ${queries.join(' / ')}`);
    }
  }

  return risks;
}

// ============= MAIN ORCHESTRATOR =============

export function runGapHijackEngine(reports: GSCGuideReport[]): GapHijackReport {
  const allQueries: Array<{ query: string; impressions: number; clicks: number; ctr: number; position: number; slug: string }> = [];

  // Collect all query-level data from GSC reports
  for (const report of reports) {
    for (const q of report.topQueries) {
      allQueries.push({
        query: q.query,
        impressions: q.impressions,
        clicks: q.clicks,
        ctr: q.ctr,
        position: q.position,
        slug: report.slug,
      });
    }
  }

  // Deduplicate queries (keep highest impression entry)
  const queryMap = new Map<string, typeof allQueries[0]>();
  for (const q of allQueries) {
    const key = normalizeQuery(q.query);
    const existing = queryMap.get(key);
    if (!existing || q.impressions > existing.impressions) {
      queryMap.set(key, q);
    }
  }

  // Phase 1: Detect gaps
  const gaps: GapQuery[] = [];
  const seenQueries = new Set<string>();

  for (const [, q] of queryMap) {
    if (q.impressions < GAP_THRESHOLDS.minImpressions) continue;
    if (q.position <= 20) continue; // Already ranking well, not a gap

    const nq = normalizeQuery(q.query);
    if (seenQueries.has(nq)) continue;
    seenQueries.add(nq);

    const { guide, matchType } = findMatchingGuide(q.query);
    const gapType = classifyGap(q.position, matchType);

    // Phase 2: SERP pattern
    const serpPattern = analyzeSERPPattern(q.query);

    // Phase 3: Hijack plan
    const hijackPlan = generateHijackPlan(q.query, gapType, guide);

    // Phase 4: Priority score
    const priorityScore = calcGapPriorityScore(q.impressions, q.position);

    gaps.push({
      query: q.query,
      impressions: q.impressions,
      clicks: q.clicks,
      ctr: q.ctr,
      avgPosition: q.position,
      gapType,
      priorityScore,
      matchedSlug: guide?.slug || null,
      matchType,
      serpPattern,
      hijackPlan,
    });
  }

  // Sort by priority score descending
  gaps.sort((a, b) => b.priorityScore - a.priorityScore);

  // Phase 6: Cannibalization check
  const cannibalizationRisks = checkCannibalizationRisk(gaps);

  const criticalCount = gaps.filter(g => g.gapType === 'GAP_CRITICAL').length;
  const weakCount = gaps.filter(g => g.gapType === 'GAP_WEAK').length;
  const opportunityCount = gaps.filter(g => g.gapType === 'GAP_OPPORTUNITY').length;

  return {
    totalGapQueries: gaps.length,
    criticalCount,
    weakCount,
    opportunityCount,
    gaps,
    top5HijackTargets: gaps.slice(0, 5),
    cannibalizationRisks,
  };
}
