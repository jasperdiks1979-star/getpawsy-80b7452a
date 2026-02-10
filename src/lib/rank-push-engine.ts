/**
 * Position 20–40 Push Protocol (Rank Boost Engine)
 * 
 * Detects keywords in position 20–40 with ≥150 impressions (28d),
 * then triggers internal link boosts, FAQ additions, and content expansion.
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

const POSITION_MIN = 20;
const POSITION_MAX = 40;
const MIN_IMPRESSIONS_28D = 150;

/**
 * Scan GSC data and identify queries in position 20–40 with enough impressions.
 */
export function detectBoostTargets(reports: GSCGuideReport[]): RankBoostTarget[] {
  const targets: RankBoostTarget[] = [];

  for (const report of reports) {
    const queries = report.topQueries.filter(
      q => q.position >= POSITION_MIN && q.position <= POSITION_MAX && q.impressions >= MIN_IMPRESSIONS_28D
    );

    // Also check page-level 28d data
    const p28 = report.periods['28d'];
    if (p28 && p28.avgPosition >= POSITION_MIN && p28.avgPosition <= POSITION_MAX && p28.impressions >= MIN_IMPRESSIONS_28D) {
      const exists = queries.some(q => q.query === report.slug);
      if (!exists) {
        queries.push({
          query: `[page-level] ${report.slug}`,
          page: p28.page,
          impressions: p28.impressions,
          clicks: p28.clicks,
          ctr: p28.ctr,
          position: p28.avgPosition,
        });
      }
    }

    for (const q of queries) {
      targets.push({
        slug: report.slug,
        query: q.query,
        avgPosition: q.position,
        impressions28d: q.impressions,
        clicks28d: q.clicks,
        ctr: q.ctr,
        status: 'pending',
        boostActions: generateBoostActions(q),
      });
    }
  }

  return targets.sort((a, b) => a.avgPosition - b.avgPosition);
}

// ============= BOOST ACTIONS =============

function generateBoostActions(query: GSCQueryMetrics): BoostAction[] {
  const actions: BoostAction[] = [
    {
      type: 'internal-links',
      description: `Add 2 internal links from related guides using anchor text: "${query.query}" (exact) + partial match variant`,
      completed: false,
    },
    {
      type: 'faq-section',
      description: `Add FAQ: "What is the best ${query.query}?" with 60–80 word answer matching search intent`,
      completed: false,
    },
    {
      type: 'content-expansion',
      description: `Add 150–300 words of contextual content around "${query.query}" with H3 subheading`,
      completed: false,
    },
    {
      type: 'anchor-optimization',
      description: `Optimize existing anchors: 60% exact match, 40% partial/natural variations of "${query.query}"`,
      completed: false,
    },
  ];
  return actions;
}

// ============= STATUS MANAGEMENT =============

/**
 * Mark a target as boosted and set reevaluation date (14 days).
 */
export function markAsBoosted(target: RankBoostTarget): RankBoostTarget {
  const now = new Date();
  const reevalDate = new Date(now.getTime() + 14 * 86400000);
  return {
    ...target,
    status: 'boosted',
    boostedAt: now.toISOString(),
    reevaluateAt: reevalDate.toISOString(),
  };
}

/**
 * Check if a boosted target should be reevaluated.
 */
export function shouldReevaluate(target: RankBoostTarget): boolean {
  if (target.status !== 'boosted' || !target.reevaluateAt) return false;
  return new Date() >= new Date(target.reevaluateAt);
}

/**
 * Reevaluate a target with new position data.
 */
export function reevaluateTarget(target: RankBoostTarget, newPosition: number): RankBoostTarget {
  if (newPosition < POSITION_MIN) {
    return { ...target, status: 'graduated' };
  }
  if (newPosition >= POSITION_MIN && newPosition <= POSITION_MAX) {
    return { ...target, status: 'waiting-reevaluation' };
  }
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
