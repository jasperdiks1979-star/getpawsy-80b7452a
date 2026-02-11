/**
 * Adaptive Rank Boost Engine
 * 
 * Detects growth mode (Early / Standard) and identifies boost targets.
 * Early mode: position 10–60, impressions ≥ 10
 * Standard mode: position 15–40, impressions ≥ 150
 * 
 * Priority formula: ((60 - position) * 0.7) + (log(impressions + 1) * 10) + (cluster_authority * 0.5)
 */

import type { GSCGuideReport, GSCQueryMetrics } from './gsc';

// ============= TYPES =============

export type BoostStatus = 'pending' | 'boosted' | 'waiting-reevaluation' | 'graduated';
export type GrowthMode = 'early' | 'standard';

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
  type: 'internal-links' | 'faq-section' | 'content-expansion' | 'anchor-optimization' | 'title-optimization';
  description: string;
  completed: boolean;
}

export interface BoostEngineResult {
  mode: GrowthMode;
  totalImpressions: number;
  targets: RankBoostTarget[];
}

// ============= MODE THRESHOLDS =============

const STD_POSITION_MIN = 15;
const STD_POSITION_MAX = 40;
const STD_IMPRESSION_THRESHOLD = 150;

const EARLY_POSITION_MIN = 10;
const EARLY_POSITION_MAX = 60;
const EARLY_IMPRESSION_THRESHOLD = 10;
const EARLY_MODE_THRESHOLD = 1000;

// ============= SCORING =============

function calcPriorityScore(position: number, impressions: number, clusterAuthority = 50): number {
  const positionScore = (60 - position) * 0.7;
  const impressionScore = Math.log(impressions + 1) * 10;
  const authorityBonus = clusterAuthority * 0.5;
  return Math.round((positionScore + impressionScore + authorityBonus) * 100) / 100;
}

// ============= GROWTH MODE DETECTION =============

export function detectGrowthMode(reports: GSCGuideReport[]): { mode: GrowthMode; totalImpressions: number } {
  const totalImpressions = reports.reduce((sum, r) => {
    const p28 = r.periods['28d'];
    return sum + (p28?.impressions || 0);
  }, 0);

  return {
    mode: totalImpressions < EARLY_MODE_THRESHOLD ? 'early' : 'standard',
    totalImpressions,
  };
}

// ============= DETECTION =============

/** Backward-compatible wrapper */
export function detectBoostTargets(reports: GSCGuideReport[]): RankBoostTarget[] {
  return detectBoostTargetsAdaptive(reports).targets;
}

export function detectBoostTargetsAdaptive(reports: GSCGuideReport[]): BoostEngineResult {
  const { mode, totalImpressions } = detectGrowthMode(reports);
  const posMin = mode === 'early' ? EARLY_POSITION_MIN : STD_POSITION_MIN;
  const posMax = mode === 'early' ? EARLY_POSITION_MAX : STD_POSITION_MAX;
  const threshold = mode === 'early' ? EARLY_IMPRESSION_THRESHOLD : STD_IMPRESSION_THRESHOLD;

  const targets: RankBoostTarget[] = [];

  for (const report of reports) {
    const queries = report.topQueries.filter(
      q => q.position >= posMin && q.position <= posMax && q.impressions >= threshold
    );

    const p28 = report.periods['28d'];
    if (p28 && p28.avgPosition >= posMin && p28.avgPosition <= posMax && p28.impressions >= threshold) {
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

    const p7 = report.periods['7d'];
    if (p7 && p7.avgPosition >= posMin && p7.avgPosition <= posMax && p7.impressions >= Math.max(threshold / 4, 5)) {
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

  return {
    mode,
    totalImpressions,
    targets: targets.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 15),
  };
}

// ============= BOOST ACTIONS =============

function generateBoostActions(query: GSCQueryMetrics): BoostAction[] {
  const q = query.query.replace(/^\[(page|7d)\] /, '');
  return [
    {
      type: 'content-expansion',
      description: `Add exact match H2 heading for "${q}"`,
      completed: false,
    },
    {
      type: 'internal-links',
      description: `Insert 2 contextual internal links using anchor: "${q}"`,
      completed: false,
    },
    {
      type: 'faq-section',
      description: `Expand FAQ with search-intent question about "${q}"`,
      completed: false,
    },
    {
      type: 'anchor-optimization',
      description: `Add comparison section for "${q}"`,
      completed: false,
    },
    {
      type: 'title-optimization',
      description: `Improve title tag CTR for "${q}" (add modifier: Tested, 2026, Pros & Cons)`,
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
  if (newPosition < STD_POSITION_MIN) return { ...target, status: 'graduated' };
  if (newPosition <= STD_POSITION_MAX) return { ...target, status: 'waiting-reevaluation' };
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
