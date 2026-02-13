/**
 * Snippet & PAA Monitoring Engine
 * 
 * Tracks featured snippet opportunities, PAA presence,
 * and generates safe optimization suggestions.
 * Monitoring only — no automatic content changes.
 */

import type { GSCGuideReport } from './gsc';
import { SCALING_GUIDES } from './guide-scaling-150';

// ============= TYPES =============

export type SnippetStatus = 'captured' | 'opportunity' | 'not_eligible' | 'unknown';
export type PAAStatus = 'growing' | 'stable' | 'declining' | 'none';

export interface SnippetGuideTracking {
  slug: string;
  title: string;
  cluster: string;
  avgPosition: number;
  impressions: number;
  ctr: number;
  clicks: number;
  snippetStatus: SnippetStatus;
  paaStatus: PAAStatus;
  faqCount: number;
  impressionsDelta: number;
  positionDelta: number;
  flags: SnippetFlag[];
  h2Frozen: boolean;
  h2FreezeUntil: string | null;
}

export type SnippetFlag =
  | 'SNIPPET_OPPORTUNITY'
  | 'PAA_GROWTH'
  | 'H2_FROZEN'
  | 'CTR_REWRITE_NEEDED'
  | 'APPROACHING_TOP_15';

export interface SnippetOptimizationSuggestion {
  slug: string;
  type: 'snippet' | 'paa';
  title: string;
  actions: string[];
  priority: 'high' | 'medium' | 'low';
  safetyNote: string;
}

export interface SnippetWeeklyReport {
  weekOf: string;
  totalImpressions: number;
  avgPosition: number;
  snippetsDetected: number;
  snippetOpportunities: number;
  paaGrowthPages: number;
  avgInboundLinks: number;
  pagesApproachingTop15: string[];
  positionChangeSummary: {
    improved: number;
    stable: number;
    declined: number;
  };
  ctrSummary: {
    above3: number;
    between1and3: number;
    below1: number;
  };
}

// ============= SNIPPET DETECTION LOGIC =============

function detectSnippetStatus(position: number, impressions: number): SnippetStatus {
  // Position 1-3 with high impressions likely has snippet
  if (position >= 1 && position <= 3 && impressions > 50) return 'captured';
  // Position 1-8 with impressions > 20 is an opportunity
  if (position >= 1 && position <= 8 && impressions > 20) return 'opportunity';
  // Position 9+ not eligible for snippet
  if (position > 8) return 'not_eligible';
  return 'unknown';
}

function detectPAAStatus(
  impressionsDelta: number,
  faqCount: number,
): PAAStatus {
  if (faqCount === 0) return 'none';
  if (impressionsDelta > 20) return 'growing'; // >20% increase
  if (impressionsDelta < -10) return 'declining';
  return 'stable';
}

// ============= FLAG DETECTION =============

function detectFlags(
  tracking: Omit<SnippetGuideTracking, 'flags'>,
): SnippetFlag[] {
  const flags: SnippetFlag[] = [];

  // Snippet Opportunity: position 1-8, impressions > 20, not captured
  if (tracking.snippetStatus === 'opportunity') {
    flags.push('SNIPPET_OPPORTUNITY');
  }

  // PAA Growth: FAQ impressions increasing > 20%
  if (tracking.paaStatus === 'growing') {
    flags.push('PAA_GROWTH');
  }

  // H2 Frozen: snippet captured, lock structure for 30 days
  if (tracking.h2Frozen) {
    flags.push('H2_FROZEN');
  }

  // CTR Rewrite Needed: impressions high but CTR < 1%
  if (tracking.impressions > 100 && tracking.ctr < 1) {
    flags.push('CTR_REWRITE_NEEDED');
  }

  // Approaching Top 15
  if (tracking.avgPosition >= 15 && tracking.avgPosition <= 20) {
    flags.push('APPROACHING_TOP_15');
  }

  return flags;
}

// ============= MAIN TRACKING BUILDER =============

export function buildSnippetTracking(
  gscReports: GSCGuideReport[],
  h2FreezeMap: Record<string, string> = {}, // slug → freeze-until ISO date
): SnippetGuideTracking[] {
  const tracking: SnippetGuideTracking[] = [];

  for (const report of gscReports) {
    const d7 = report.periods['7d'];
    if (!d7) continue;

    const guide = SCALING_GUIDES.find(g => g.slug === report.slug);
    if (!guide) continue;

    const faqCount = guide.secondaryKWs.length; // Proxy for FAQ count

    const impressionsDelta = report.delta7d?.impressions
      ? Math.round((report.delta7d.impressions / Math.max(d7.impressions - report.delta7d.impressions, 1)) * 100)
      : 0;

    const freezeUntil = h2FreezeMap[report.slug] || null;
    const h2Frozen = freezeUntil ? new Date(freezeUntil) > new Date() : false;

    const snippetStatus = detectSnippetStatus(d7.avgPosition, d7.impressions);
    const paaStatus = detectPAAStatus(impressionsDelta, faqCount);

    const base: Omit<SnippetGuideTracking, 'flags'> = {
      slug: report.slug,
      title: guide.title,
      cluster: guide.cluster,
      avgPosition: d7.avgPosition,
      impressions: d7.impressions,
      ctr: d7.ctr,
      clicks: d7.clicks,
      snippetStatus,
      paaStatus,
      faqCount,
      impressionsDelta,
      positionDelta: report.delta7d?.position || 0,
      h2Frozen,
      h2FreezeUntil: freezeUntil,
    };

    tracking.push({
      ...base,
      flags: detectFlags(base),
    });
  }

  return tracking.sort((a, b) => a.avgPosition - b.avgPosition);
}

// ============= SAFE OPTIMIZATION SUGGESTIONS =============

export function generateSnippetSuggestions(
  tracking: SnippetGuideTracking[],
): SnippetOptimizationSuggestion[] {
  const suggestions: SnippetOptimizationSuggestion[] = [];

  for (const t of tracking) {
    // Skip frozen pages
    if (t.h2Frozen) continue;

    if (t.flags.includes('SNIPPET_OPPORTUNITY')) {
      suggestions.push({
        slug: t.slug,
        type: 'snippet',
        title: `Snippet Opportunity: ${t.title}`,
        actions: [
          'Shorten first paragraph to 45–55 words with direct answer',
          'Format primary H2 as a clear question',
          'Ensure numbered list immediately follows answer H2',
          'Add or verify JSON-LD FAQPage schema',
        ],
        priority: t.avgPosition <= 5 ? 'high' : 'medium',
        safetyNote: 'No structural edits if page was modified in last 14 days.',
      });
    }

    if (t.flags.includes('PAA_GROWTH')) {
      suggestions.push({
        slug: t.slug,
        type: 'paa',
        title: `PAA Growth: ${t.title}`,
        actions: [
          'Add 2 new FAQ questions targeting related long-tail queries',
          'Keep answers 40–60 words each',
          'Ensure FAQPage schema includes new questions',
        ],
        priority: 'medium',
        safetyNote: 'No structural overhaul. Add questions only.',
      });
    }

    if (t.flags.includes('CTR_REWRITE_NEEDED') && !t.flags.includes('SNIPPET_OPPORTUNITY')) {
      suggestions.push({
        slug: t.slug,
        type: 'snippet',
        title: `CTR Improvement: ${t.title}`,
        actions: [
          'Rewrite title only (no content change)',
          'Add number + benefit to title',
          'Update meta description with curiosity trigger',
        ],
        priority: 'low',
        safetyNote: 'Max 1 title change per 14 days. Log all changes.',
      });
    }
  }

  return suggestions.sort((a, b) => {
    const pMap = { high: 3, medium: 2, low: 1 };
    return pMap[b.priority] - pMap[a.priority];
  });
}

// ============= WEEKLY REPORT =============

export function generateSnippetWeeklyReport(
  tracking: SnippetGuideTracking[],
): SnippetWeeklyReport {
  const totalImpressions = tracking.reduce((s, t) => s + t.impressions, 0);
  const avgPosition = tracking.length > 0
    ? Math.round((tracking.reduce((s, t) => s + t.avgPosition, 0) / tracking.length) * 10) / 10
    : 0;

  const snippetsDetected = tracking.filter(t => t.snippetStatus === 'captured').length;
  const snippetOpportunities = tracking.filter(t => t.snippetStatus === 'opportunity').length;
  const paaGrowthPages = tracking.filter(t => t.paaStatus === 'growing').length;

  const improved = tracking.filter(t => t.positionDelta > 1).length;
  const declined = tracking.filter(t => t.positionDelta < -1).length;
  const stable = tracking.length - improved - declined;

  const above3 = tracking.filter(t => t.ctr >= 3).length;
  const between1and3 = tracking.filter(t => t.ctr >= 1 && t.ctr < 3).length;
  const below1 = tracking.filter(t => t.ctr < 1).length;

  // Calculate avg inbound links
  const inboundCounts = SCALING_GUIDES.map(g =>
    SCALING_GUIDES.filter(o => o.slug !== g.slug && o.linksTo.includes(g.slug)).length
  );
  const avgInboundLinks = inboundCounts.length > 0
    ? Math.round((inboundCounts.reduce((s, c) => s + c, 0) / inboundCounts.length) * 10) / 10
    : 0;

  const pagesApproachingTop15 = tracking
    .filter(t => t.avgPosition >= 15 && t.avgPosition <= 20)
    .map(t => t.slug);

  return {
    weekOf: new Date().toISOString().split('T')[0],
    totalImpressions,
    avgPosition,
    snippetsDetected,
    snippetOpportunities,
    paaGrowthPages,
    avgInboundLinks,
    pagesApproachingTop15,
    positionChangeSummary: { improved, stable, declined },
    ctrSummary: { above3, between1and3, below1 },
  };
}
