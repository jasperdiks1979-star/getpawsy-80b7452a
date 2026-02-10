/**
 * Guide Health Scoring & Automation System
 * 
 * - Health scoring per guide
 * - Cannibalization detection
 * - CTR optimization alerts
 * - Internal link recalculation on new guides
 * - Auto lastmod updates
 */

import { GUIDE_PUBLICATION_PLAN, getIncomingLinksCount, type GuidePlanEntry } from './guide-publication-plan';

// ============= HEALTH SCORING =============

export interface GuideHealthScore {
  slug: string;
  title: string;
  scores: {
    contentCompleteness: number;  // 0-100: FAQs, sections, buying criteria presence
    internalLinkStrength: number; // 0-100: incoming + outgoing links
    keywordCoverage: number;      // 0-100: primary + secondary KW density
    conversionReadiness: number;  // 0-100: comparison table, CTA, product links
    freshness: number;            // 0-100: days since last update
  };
  overallScore: number;
  status: 'healthy' | 'needs-attention' | 'critical';
  recommendations: string[];
}

export function calculateGuideHealth(
  guide: GuidePlanEntry,
  metrics?: { position?: number; impressions?: number; ctr?: number; lastUpdated?: string }
): GuideHealthScore {
  const scores = {
    contentCompleteness: 0,
    internalLinkStrength: 0,
    keywordCoverage: 0,
    conversionReadiness: 0,
    freshness: 0,
  };
  const recommendations: string[] = [];

  // Content completeness
  const faqScore = Math.min((guide.minFaqs / 6) * 100, 100);
  scores.contentCompleteness = faqScore;
  if (guide.minFaqs < 6) recommendations.push(`Add ${6 - guide.minFaqs} more FAQs`);

  // Internal link strength
  const incomingLinks = getIncomingLinksCount(guide.slug);
  const outgoingLinks = guide.outgoingLinks.length;
  scores.internalLinkStrength = Math.min(((incomingLinks + outgoingLinks) / 8) * 100, 100);
  if (incomingLinks < 2) recommendations.push('Needs more incoming internal links');
  if (outgoingLinks < 3) recommendations.push('Add more outgoing contextual links');

  // Keyword coverage (estimated from plan data)
  const kwCount = 1 + guide.secondaryKeywords.length;
  scores.keywordCoverage = Math.min((kwCount / 4) * 100, 100);

  // Conversion readiness
  let convScore = 0;
  if (guide.hasComparisonTable) convScore += 30;
  if (guide.minProductLinks >= 8) convScore += 30;
  else convScore += (guide.minProductLinks / 8) * 30;
  if (guide.role === 'cornerstone' || guide.role === 'high-aov') convScore += 20;
  convScore += 20; // Base score for having CTA
  scores.conversionReadiness = Math.min(convScore, 100);
  if (!guide.hasComparisonTable && guide.searchIntent === 'commercial') {
    recommendations.push('Add comparison table for commercial intent');
  }

  // Freshness
  if (metrics?.lastUpdated) {
    const daysSinceUpdate = Math.floor((Date.now() - new Date(metrics.lastUpdated).getTime()) / (1000 * 60 * 60 * 24));
    scores.freshness = daysSinceUpdate < 30 ? 100 : daysSinceUpdate < 90 ? 70 : daysSinceUpdate < 180 ? 40 : 10;
    if (daysSinceUpdate > 90) recommendations.push('Content refresh needed');
  } else {
    scores.freshness = 100; // New guide
  }

  const overallScore = Math.round(
    scores.contentCompleteness * 0.2 +
    scores.internalLinkStrength * 0.25 +
    scores.keywordCoverage * 0.15 +
    scores.conversionReadiness * 0.25 +
    scores.freshness * 0.15
  );

  return {
    slug: guide.slug,
    title: guide.title,
    scores,
    overallScore,
    status: overallScore >= 75 ? 'healthy' : overallScore >= 50 ? 'needs-attention' : 'critical',
    recommendations,
  };
}

// ============= CANNIBALIZATION DETECTOR =============

export interface CannibalizationAlert {
  keyword: string;
  guides: { slug: string; title: string; intent: string }[];
  severity: 'low' | 'medium' | 'high';
  recommendation: string;
}

export function detectCannibalization(): CannibalizationAlert[] {
  const keywordMap = new Map<string, GuidePlanEntry[]>();

  for (const guide of GUIDE_PUBLICATION_PLAN) {
    // Check primary keywords
    const pk = guide.primaryKeyword.toLowerCase();
    if (!keywordMap.has(pk)) keywordMap.set(pk, []);
    keywordMap.get(pk)!.push(guide);

    // Check secondary keywords
    for (const sk of guide.secondaryKeywords) {
      const skl = sk.toLowerCase();
      if (!keywordMap.has(skl)) keywordMap.set(skl, []);
      keywordMap.get(skl)!.push(guide);
    }
  }

  const alerts: CannibalizationAlert[] = [];

  for (const [keyword, guides] of keywordMap.entries()) {
    // Only flag if multiple guides target same keyword as primary
    const primaryMatches = guides.filter(g => g.primaryKeyword.toLowerCase() === keyword);
    if (primaryMatches.length > 1) {
      alerts.push({
        keyword,
        guides: primaryMatches.map(g => ({ slug: g.slug, title: g.title, intent: g.searchIntent })),
        severity: 'high',
        recommendation: `Merge or differentiate: ${primaryMatches.length} guides target "${keyword}" as primary keyword`,
      });
    } else if (guides.length > 2) {
      // Secondary keyword overlap across many guides
      alerts.push({
        keyword,
        guides: guides.map(g => ({ slug: g.slug, title: g.title, intent: g.searchIntent })),
        severity: 'low',
        recommendation: `Monitor: "${keyword}" appears in ${guides.length} guides. Ensure distinct angles.`,
      });
    }
  }

  return alerts.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}

// ============= CTR OPTIMIZATION ALERTS =============

export interface CTRAlert {
  slug: string;
  title: string;
  currentCTR: number;
  expectedCTR: number;
  position: number;
  action: string;
}

const EXPECTED_CTR_BY_POSITION: Record<number, number> = {
  1: 28, 2: 15, 3: 11, 4: 8, 5: 7, 6: 5, 7: 4, 8: 3.5, 9: 3, 10: 2.5,
};

export function generateCTRAlerts(
  guideMetrics: { slug: string; position: number; ctr: number; impressions: number }[]
): CTRAlert[] {
  const alerts: CTRAlert[] = [];

  for (const metric of guideMetrics) {
    if (metric.impressions < 50) continue; // Not enough data

    const positionBucket = Math.min(Math.ceil(metric.position), 10);
    const expectedCTR = EXPECTED_CTR_BY_POSITION[positionBucket] || 2;

    if (metric.ctr < expectedCTR * 0.6) {
      const guide = GUIDE_PUBLICATION_PLAN.find(g => g.slug === metric.slug);
      if (!guide) continue;

      alerts.push({
        slug: metric.slug,
        title: guide.title,
        currentCTR: metric.ctr,
        expectedCTR,
        position: metric.position,
        action: metric.position <= 5
          ? 'Rewrite title tag — add power word or year'
          : metric.position <= 10
            ? 'Optimize meta description with benefit-driven copy'
            : 'Build more internal links to boost position first',
      });
    }
  }

  return alerts;
}

// ============= LINK RECALCULATION =============

export function recalculateLinksForNewGuide(
  newGuideSlug: string,
  newGuideCluster: 'cat-litter' | 'cat-furniture',
  newGuidePrimaryKW: string
): { guideToUpdate: string; suggestedAnchor: string; contextHint: string }[] {
  const suggestions: { guideToUpdate: string; suggestedAnchor: string; contextHint: string }[] = [];

  // Find cornerstone and hub guides in same cluster that should link to new guide
  const clusterGuides = GUIDE_PUBLICATION_PLAN.filter(
    g => g.cluster === newGuideCluster && (g.role === 'cornerstone' || g.role === 'info-hub')
  );

  for (const guide of clusterGuides) {
    suggestions.push({
      guideToUpdate: guide.slug,
      suggestedAnchor: newGuidePrimaryKW,
      contextHint: `Add link in relevant section of "${guide.title}"`,
    });
  }

  return suggestions;
}

// ============= BATCH HEALTH REPORT =============

export function generateBatchHealthReport(): {
  totalGuides: number;
  healthyCount: number;
  attentionCount: number;
  criticalCount: number;
  avgScore: number;
  cannibalizationAlerts: CannibalizationAlert[];
  guideScores: GuideHealthScore[];
} {
  const guideScores = GUIDE_PUBLICATION_PLAN.map(g => calculateGuideHealth(g));
  const cannibalizationAlerts = detectCannibalization();

  return {
    totalGuides: guideScores.length,
    healthyCount: guideScores.filter(g => g.status === 'healthy').length,
    attentionCount: guideScores.filter(g => g.status === 'needs-attention').length,
    criticalCount: guideScores.filter(g => g.status === 'critical').length,
    avgScore: Math.round(guideScores.reduce((sum, g) => sum + g.overallScore, 0) / guideScores.length),
    cannibalizationAlerts,
    guideScores: guideScores.sort((a, b) => a.overallScore - b.overallScore),
  };
}
