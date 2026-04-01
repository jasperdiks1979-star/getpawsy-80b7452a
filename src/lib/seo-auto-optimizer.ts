/**
 * SEO Auto-Optimization Engine
 *
 * Evaluates GSC data against configurable thresholds and generates
 * controlled, logged optimization suggestions. No changes are auto-applied
 * without explicit admin approval.
 *
 * Safety: max 2 structural changes per page per 14 days.
 */

import type { GSCGuideReport } from './gsc';

// ============= THRESHOLDS =============

export const SEO_THRESHOLDS = {
  CTR: { minImpressions: 150, maxCtr: 1 },
  POSITION: { min: 18, max: 35, stableDays: 7 },
  MOMENTUM: { impressionGrowthPct: 20 },
  DECAY: { positionDropThreshold: 5, windowDays: 14 },
  SAFETY: { maxChangesPerPage14d: 2 },
} as const;

// ============= TYPES =============

export type TriggerType = 'ctr' | 'position' | 'momentum' | 'decay';

export interface OptimizationSuggestion {
  slug: string;
  triggerType: TriggerType;
  actionType: string;
  actionDetails: Record<string, unknown>;
  metricsSnapshot: {
    impressions: number;
    clicks: number;
    ctr: number;
    avgPosition: number;
    delta7d?: number | null;
  };
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export interface AutoOptimizerReport {
  suggestions: OptimizationSuggestion[];
  evaluated: number;
  triggered: number;
  skippedSafety: number;
  timestamp: string;
}

// ============= TITLE GENERATORS =============

function generateAlternativeTitles(slug: string, currentPosition: number): string[] {
  const keyword = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/2026/g, '').trim();
  return [
    `${keyword} (2026) – What Actually Works & Why`,
    `${keyword} (2026) – Tested & Ranked by Experts`,
  ];
}

function generateAlternativeDescriptions(slug: string): string[] {
  const keyword = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/2026/g, '').trim();
  return [
    `We tested the top ${keyword.toLowerCase()} of 2026. See which ones actually deliver results, who they're best for, and what to avoid. Free shipping available.`,
    `Honest ${keyword.toLowerCase()} comparison for 2026. Real testing, no sponsored picks. Find the right match for your pet in under 3 minutes.`,
  ];
}

// ============= TRIGGER EVALUATORS =============

function evaluateCtrTrigger(report: GSCGuideReport): OptimizationSuggestion | null {
  const d7 = report.periods['7d'];
  if (!d7) return null;

  if (d7.impressions >= SEO_THRESHOLDS.CTR.minImpressions && d7.ctr < SEO_THRESHOLDS.CTR.maxCtr) {
    return {
      slug: report.slug,
      triggerType: 'ctr',
      actionType: 'title_meta_rewrite',
      actionDetails: {
        alternativeTitles: generateAlternativeTitles(report.slug, d7.avgPosition),
        alternativeDescriptions: generateAlternativeDescriptions(report.slug),
      },
      metricsSnapshot: {
        impressions: d7.impressions, clicks: d7.clicks,
        ctr: d7.ctr, avgPosition: d7.avgPosition,
      },
      priority: d7.ctr < 0.5 ? 'high' : 'medium',
      reason: `CTR ${d7.ctr.toFixed(2)}% with ${d7.impressions} impressions — title/meta rewrite recommended`,
    };
  }
  return null;
}

function evaluatePositionTrigger(report: GSCGuideReport): OptimizationSuggestion | null {
  const d7 = report.periods['7d'];
  if (!d7) return null;

  if (d7.avgPosition >= SEO_THRESHOLDS.POSITION.min && d7.avgPosition <= SEO_THRESHOLDS.POSITION.max) {
    return {
      slug: report.slug,
      triggerType: 'position',
      actionType: 'content_boost',
      actionDetails: {
        actions: [
          'Inject 2 contextual internal links from high-authority pages',
          'Add 1 new FAQ targeting a related long-tail query',
          'Add 1 micro-intent H3 section (120 words)',
        ],
      },
      metricsSnapshot: {
        impressions: d7.impressions, clicks: d7.clicks,
        ctr: d7.ctr, avgPosition: d7.avgPosition,
      },
      priority: d7.avgPosition <= 25 ? 'high' : 'medium',
      reason: `Position ${d7.avgPosition} — in striking distance of top 20, content boost needed`,
    };
  }
  return null;
}

function evaluateMomentumTrigger(report: GSCGuideReport): OptimizationSuggestion | null {
  const d7 = report.periods['7d'];
  const d28 = report.periods['28d'];
  if (!d7 || !d28 || d28.impressions === 0) return null;

  // Estimate weekly growth: compare 7d to avg weekly from 28d
  const avgWeekly28d = d28.impressions / 4;
  if (avgWeekly28d === 0) return null;

  const growthPct = ((d7.impressions - avgWeekly28d) / avgWeekly28d) * 100;

  if (growthPct >= SEO_THRESHOLDS.MOMENTUM.impressionGrowthPct) {
    return {
      slug: report.slug,
      triggerType: 'momentum',
      actionType: 'momentum_capitalize',
      actionDetails: {
        growthPct: Math.round(growthPct),
        actions: [
          'Suggest 1 supporting subguide to reinforce cluster',
          'Inject upward link from related pages to this ranking page',
        ],
      },
      metricsSnapshot: {
        impressions: d7.impressions, clicks: d7.clicks,
        ctr: d7.ctr, avgPosition: d7.avgPosition,
      },
      priority: growthPct > 50 ? 'high' : 'medium',
      reason: `Impressions up ${Math.round(growthPct)}% WoW — capitalize on momentum`,
    };
  }
  return null;
}

function evaluateDecayTrigger(report: GSCGuideReport): OptimizationSuggestion | null {
  const d7 = report.periods['7d'];
  if (!d7 || !report.delta7d) return null;

  // delta7d.position is negative when dropping (position number increases)
  if (report.delta7d.position < -SEO_THRESHOLDS.DECAY.positionDropThreshold) {
    return {
      slug: report.slug,
      triggerType: 'decay',
      actionType: 'decay_recovery',
      actionDetails: {
        positionDrop: Math.abs(report.delta7d.position),
        actions: [
          'Add snippet summary box at top of content',
          'Add checklist block for key takeaways',
          'Increase inbound internal links by 2',
        ],
      },
      metricsSnapshot: {
        impressions: d7.impressions, clicks: d7.clicks,
        ctr: d7.ctr, avgPosition: d7.avgPosition,
        delta7d: report.delta7d.position,
      },
      priority: 'high',
      reason: `Position dropped ${Math.abs(report.delta7d.position)} spots — recovery actions needed`,
    };
  }
  return null;
}

// ============= MAIN ENGINE =============

export function runAutoOptimizer(reports: GSCGuideReport[], recentChangeCount?: Map<string, number>): AutoOptimizerReport {
  const suggestions: OptimizationSuggestion[] = [];
  let skippedSafety = 0;

  for (const report of reports) {
    // Safety check: max changes per 14 days
    const recentChanges = recentChangeCount?.get(report.slug) || 0;
    if (recentChanges >= SEO_THRESHOLDS.SAFETY.maxChangesPerPage14d) {
      skippedSafety++;
      continue;
    }

    const triggers = [
      evaluateCtrTrigger(report),
      evaluatePositionTrigger(report),
      evaluateMomentumTrigger(report),
      evaluateDecayTrigger(report),
    ].filter(Boolean) as OptimizationSuggestion[];

    suggestions.push(...triggers);
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    suggestions,
    evaluated: reports.length,
    triggered: suggestions.length,
    skippedSafety,
    timestamp: new Date().toISOString(),
  };
}
