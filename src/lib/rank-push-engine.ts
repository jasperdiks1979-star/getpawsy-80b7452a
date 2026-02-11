/**
 * Rank Push Engine (Position 15–50)
 * 
 * Detects keywords/guides in position 15–50 and generates prioritized boost targets.
 * Uses dynamic thresholds and priority scoring.
 */

import type { GSCGuideReport, GSCQueryMetrics } from './gsc';

// ============= TYPES =============

export type BoostStatus = 'pending' | 'boosted' | 'waiting-reevaluation' | 'graduated';

export interface RankBoostTarget {
  slug: string;
  query: string;
  avgPosition: number;
  impressions28d: number;
  clicks28d: number;
  ctr: number;
  priorityScore: number;
  boostActions: BoostAction[];
  status: BoostStatus;
  boostedAt?: string;
  reevaluateAt?: string;
}

export interface BoostAction {
  type: 'internal-links' | 'faq-section' | 'content-expansion' | 'anchor-optimization';
  description: string;
  completed: boolean;
}

// ============= DETECTION =============

const POSITION_MIN = 15;
const POSITION_MAX = 50;
const IMPRESSION_THRESHOLD_HIGH = 150;
const IMPRESSION_THRESHOLD_FALLBACK = 20;

/**
 * Calculate priority score: (50 - position) * log(impressions + 1)
 */
function calcPriorityScore(position: number, impressions: number): number {
  return Math.round((50 - position) * Math.log(impressions + 1) * 100) / 100;
}

/**
 * Determine impression threshold based on total data volume.
 */
function getImpressionThreshold(reports: GSCGuideReport[]): number {
  const totalImpressions = reports.reduce((sum, r) => {
    const p28 = r.periods['28d'];
    return sum + (p28?.impressions || 0);
  }, 0);

  // If total impressions across all guides < 150, use fallback threshold
  return totalImpressions < IMPRESSION_THRESHOLD_HIGH
    ? IMPRESSION_THRESHOLD_FALLBACK
    : IMPRESSION_THRESHOLD_HIGH;
}

/**
 * Scan GSC data and identify boost targets in position 15–50.
 */
export function detectBoostTargets(reports: GSCGuideReport[]): RankBoostTarget[] {
  const targets: RankBoostTarget[] = [];
  const threshold = getImpressionThreshold(reports);

  for (const report of reports) {
    // Check query-level data
    const queries = report.topQueries.filter(
      q => q.position >= POSITION_MIN && q.position <= POSITION_MAX && q.impressions >= threshold
    );

    // Also check page-level 28d data
    const p28 = report.periods['28d'];
    if (p28 && p28.avgPosition >= POSITION_MIN && p28.avgPosition <= POSITION_MAX && p28.impressions >= threshold) {
      const exists = queries.some(q => q.query === report.slug);
      if (!exists) {
        queries.push({
          query: `[page] ${report.slug}`,
          page: p28.page,
          impressions: p28.impressions,
          clicks: p28.clicks,
          ctr: p28.ctr,
          position: p28.avgPosition,
        });
      }
    }

    // Also check 7d data for emerging opportunities
    const p7 = report.periods['7d'];
    if (p7 && p7.avgPosition >= POSITION_MIN && p7.avgPosition <= POSITION_MAX && p7.impressions >= Math.max(threshold / 4, 5)) {
      const exists = queries.some(q => q.query === report.slug || q.query === `[page] ${report.slug}`);
      if (!exists) {
        queries.push({
          query: `[7d] ${report.slug}`,
          page: p7.page,
          impressions: p7.impressions,
          clicks: p7.clicks,
          ctr: p7.ctr,
          position: p7.avgPosition,
        });
      }
    }

    for (const q of queries) {
      const priorityScore = calcPriorityScore(q.position, q.impressions);
      targets.push({
        slug: report.slug,
        query: q.query,
        avgPosition: q.position,
        impressions28d: q.impressions,
        clicks28d: q.clicks,
        ctr: q.ctr,
        priorityScore,
        status: 'pending',
        boostActions: generateBoostActions(q),
      });
    }
  }

  return targets.sort((a, b) => b.priorityScore - a.priorityScore);
}

// ============= BOOST ACTIONS =============

function generateBoostActions(query: GSCQueryMetrics): BoostAction[] {
  return [
    {
      type: 'internal-links',
      description: `Add 2 internal links using anchor: "${query.query}" (exact + partial variant)`,
      completed: false,
    },
    {
      type: 'faq-section',
      description: `Add FAQ: "What is the best ${query.query}?" with 60–80 word answer`,
      completed: false,
    },
    {
      type: 'content-expansion',
      description: `Add 150–300 words with H3 subheading around "${query.query}"`,
      completed: false,
    },
    {
      type: 'anchor-optimization',
      description: `Optimize anchors: 60% exact, 40% partial/natural for "${query.query}"`,
      completed: false,
    },
  ];
}

// ============= STATUS MANAGEMENT =============

export function markAsBoosted(target: RankBoostTarget): RankBoostTarget {
  const now = new Date();
  const reevalDate = new Date(now.getTime() + 14 * 86400000);
  return { ...target, status: 'boosted', boostedAt: now.toISOString(), reevaluateAt: reevalDate.toISOString() };
}

export function shouldReevaluate(target: RankBoostTarget): boolean {
  if (target.status !== 'boosted' || !target.reevaluateAt) return false;
  return new Date() >= new Date(target.reevaluateAt);
}

export function reevaluateTarget(target: RankBoostTarget, newPosition: number): RankBoostTarget {
  if (newPosition < POSITION_MIN) return { ...target, status: 'graduated' };
  if (newPosition >= POSITION_MIN && newPosition <= POSITION_MAX) return { ...target, status: 'waiting-reevaluation' };
  return target;
}

// ============= SUMMARY =============

export function getBoostSummary(targets: RankBoostTarget[]) {
  return {
    total: targets.length,
    pending: targets.filter(t => t.status === 'pending').length,
    boosted: targets.filter(t => t.status === 'boosted').length,
    waiting: targets.filter(t => t.status === 'waiting-reevaluation').length,
    graduated: targets.filter(t => t.status === 'graduated').length,
    avgPosition: targets.length > 0
      ? Math.round((targets.reduce((s, t) => s + t.avgPosition, 0) / targets.length) * 10) / 10
      : 0,
  };
}
