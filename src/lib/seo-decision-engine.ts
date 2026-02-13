/**
 * SEO Decision Engine
 *
 * Unified monitoring + decision-support system.
 * Generates alerts, priority scores, decision tree suggestions,
 * Top 20 playbook, and weekly summaries.
 *
 * MONITORING ONLY — never auto-modifies content.
 */

import type { GSCGuideReport } from './gsc';

// ============= TYPES =============

export type AlertType = 'low_ctr' | 'top_20_push' | 'momentum' | 'decay' | 'under_supported';

export interface DecisionAlert {
  slug: string;
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metrics: {
    impressions?: number;
    clicks?: number;
    ctr?: number;
    position?: number;
    positionDelta?: number;
    inboundLinks?: number;
  };
  suggestedActions: string[];
  createdAt: string;
}

export interface GuideMetricsRow {
  slug: string;
  impressions7d: number;
  clicks7d: number;
  ctr7d: number;
  avgPosition7d: number;
  impressionsDelta7d: number;
  positionDelta7d: number;
  trendDirection: 'up' | 'down' | 'stable';
  inboundLinks: number;
  outboundLinks: number;
  isOrphaned: boolean;
  clusterAssignment: string | null;
}

export interface PriorityPage {
  slug: string;
  score: number;
  reason: string;
  alerts: DecisionAlert[];
  metrics: GuideMetricsRow;
}

export interface Top20Playbook {
  slug: string;
  position: number;
  impressions: number;
  steps: string[];
  activatedAt: string;
}

export interface WeeklyReport {
  weekOf: string;
  totalImpressions: number;
  totalClicks: number;
  avgCtr: number;
  avgPosition: number;
  topGainers: { slug: string; delta: number }[];
  topDecliners: { slug: string; delta: number }[];
  pagesNearTop20: string[];
  pagesLowCtr: string[];
  alertCount: number;
  riskCount: number;
  recommendedActions: string[];
}

// ============= THRESHOLDS =============

export const THRESHOLDS = {
  CTR: { minImpressions: 150, maxCtr: 1 },
  POSITION_PUSH: { min: 18, max: 35 },
  MOMENTUM: { growthPct: 20 },
  DECAY: { dropThreshold: 5, windowDays: 14 },
  LINK_WEAKNESS: { minInbound: 3 },
  TOP20_PLAYBOOK: { min: 18, max: 25, stableDays: 14 },
  SAFETY: { maxChangesPerPage14d: 2 },
} as const;

// ============= ALERT GENERATION =============

export function generateAlerts(
  reports: GSCGuideReport[],
  linkMap: Record<string, number> = {},
): DecisionAlert[] {
  const alerts: DecisionAlert[] = [];
  const now = new Date().toISOString();

  for (const r of reports) {
    const d7 = r.periods['7d'];
    if (!d7) continue;

    const inbound = linkMap[r.slug] ?? 0;

    // Low CTR
    if (d7.impressions >= THRESHOLDS.CTR.minImpressions && d7.ctr < THRESHOLDS.CTR.maxCtr) {
      alerts.push({
        slug: r.slug,
        type: 'low_ctr',
        severity: 'warning',
        title: 'Low CTR Optimization Candidate',
        description: `${d7.impressions} impressions, ${d7.ctr.toFixed(2)}% CTR — title/meta testing recommended.`,
        metrics: { impressions: d7.impressions, ctr: d7.ctr, position: d7.avgPosition },
        suggestedActions: [
          `Test alternative title: "${titleVariant(r.slug, 1)}"`,
          `Test alternative title: "${titleVariant(r.slug, 2)}"`,
          'Rewrite meta description with benefit-first hook',
          'Add snippet summary block under H1',
        ],
        createdAt: now,
      });
    }

    // Top 20 Push
    if (d7.avgPosition >= THRESHOLDS.POSITION_PUSH.min && d7.avgPosition <= THRESHOLDS.POSITION_PUSH.max) {
      const isStable = !r.delta7d || Math.abs(r.delta7d.position) <= 2;
      if (isStable) {
        alerts.push({
          slug: r.slug,
          type: 'top_20_push',
          severity: 'info',
          title: 'Top 20 Push Candidate',
          description: `Position ${d7.avgPosition}, stable 7d — good push opportunity.`,
          metrics: { position: d7.avgPosition, impressions: d7.impressions },
          suggestedActions: [
            'Add 2 contextual internal links from high-authority pages',
            'Add 1 FAQ targeting related long-tail query',
            'Add 1 micro-intent H3 section (120 words)',
          ],
          createdAt: now,
        });
      }
    }

    // Momentum
    const d28 = r.periods['28d'];
    if (d28 && d28.impressions > 0 && d7.impressions > 50) {
      const avgWeekly = d28.impressions / 4;
      const growthPct = avgWeekly > 0 ? ((d7.impressions - avgWeekly) / avgWeekly) * 100 : 0;
      if (growthPct >= THRESHOLDS.MOMENTUM.growthPct) {
        alerts.push({
          slug: r.slug,
          type: 'momentum',
          severity: 'info',
          title: 'Growth Opportunity',
          description: `Impressions up ~${Math.round(growthPct)}% WoW — capitalize on momentum.`,
          metrics: { impressions: d7.impressions },
          suggestedActions: [
            'Create 1 supporting subguide to reinforce cluster',
            'Inject upward link from related pages',
          ],
          createdAt: now,
        });
      }
    }

    // Decay
    if (r.delta7d && r.delta7d.position < -THRESHOLDS.DECAY.dropThreshold) {
      alerts.push({
        slug: r.slug,
        type: 'decay',
        severity: 'critical',
        title: 'Ranking Risk',
        description: `Position dropped ${Math.abs(r.delta7d.position)} spots in 7d.`,
        metrics: { position: d7.avgPosition, positionDelta: r.delta7d.position },
        suggestedActions: [
          'Add comparison table for scanability',
          'Add checklist section for key takeaways',
          'Boost internal links by 2 from related guides',
        ],
        createdAt: now,
      });
    }

    // Under-supported
    if (inbound < THRESHOLDS.LINK_WEAKNESS.minInbound && d7.impressions > 0) {
      alerts.push({
        slug: r.slug,
        type: 'under_supported',
        severity: 'warning',
        title: 'Under-Supported Page',
        description: `Only ${inbound} inbound links — needs link reinforcement.`,
        metrics: { inboundLinks: inbound, impressions: d7.impressions },
        suggestedActions: [
          'Add contextual links from 3+ related guides',
          'Include in homepage "Top Guides" section',
        ],
        createdAt: now,
      });
    }
  }

  return alerts;
}

// ============= PRIORITY SCORING =============

export function calculatePriority(
  reports: GSCGuideReport[],
  linkMap: Record<string, number> = {},
): PriorityPage[] {
  const alerts = generateAlerts(reports, linkMap);
  const alertsBySlug = new Map<string, DecisionAlert[]>();
  alerts.forEach(a => {
    if (!alertsBySlug.has(a.slug)) alertsBySlug.set(a.slug, []);
    alertsBySlug.get(a.slug)!.push(a);
  });

  return reports
    .map(r => {
      const d7 = r.periods['7d'];
      if (!d7) return null;

      const inbound = linkMap[r.slug] ?? 0;
      const guideAlerts = alertsBySlug.get(r.slug) || [];

      let score = 50;

      // Impressions (0–25)
      if (d7.impressions > 500) score += 25;
      else if (d7.impressions > 300) score += 20;
      else if (d7.impressions > 150) score += 15;
      else if (d7.impressions > 50) score += 10;

      // Position range (0–25) — 15-40 most actionable
      if (d7.avgPosition >= 15 && d7.avgPosition <= 40) score += 25;
      else if (d7.avgPosition < 15) score += 10;
      else if (d7.avgPosition > 50) score -= 10;

      // CTR weakness (0–20)
      if (d7.ctr < 1 && d7.impressions > 150) score += 20;
      else if (d7.ctr < 2 && d7.impressions > 100) score += 10;

      // Link support
      if (inbound < 3) score -= 10;
      else if (inbound >= 5) score += 5;

      // Trend direction
      if (r.delta7d) {
        if (r.delta7d.position > 2) score += 5; // improving
        if (r.delta7d.position < -3) score += 10; // dropping = needs attention
      }

      // Alert severity
      if (guideAlerts.some(a => a.severity === 'critical')) score += 10;
      else if (guideAlerts.some(a => a.severity === 'warning')) score += 5;

      score = Math.max(1, Math.min(100, score));

      const metrics: GuideMetricsRow = {
        slug: r.slug,
        impressions7d: d7.impressions,
        clicks7d: d7.clicks,
        ctr7d: d7.ctr,
        avgPosition7d: d7.avgPosition,
        impressionsDelta7d: r.delta7d?.impressions || 0,
        positionDelta7d: r.delta7d?.position || 0,
        trendDirection: r.delta7d?.position
          ? r.delta7d.position > 1 ? 'up' : r.delta7d.position < -1 ? 'down' : 'stable'
          : 'stable',
        inboundLinks: inbound,
        outboundLinks: 0,
        isOrphaned: inbound === 0,
        clusterAssignment: null,
      };

      return { slug: r.slug, score, reason: buildReason(d7, inbound, guideAlerts), alerts: guideAlerts, metrics };
    })
    .filter((p): p is PriorityPage => p !== null)
    .sort((a, b) => b.score - a.score);
}

function buildReason(d7: any, inbound: number, alerts: DecisionAlert[]): string {
  const r: string[] = [];
  if (d7.impressions > 300) r.push('High visibility');
  if (d7.avgPosition >= 15 && d7.avgPosition <= 40) r.push('Actionable position');
  if (d7.ctr < 1 && d7.impressions > 150) r.push('Low CTR');
  if (inbound < 3) r.push('Under-supported');
  if (alerts.some(a => a.severity === 'critical')) r.push('Critical alert');
  return r.length > 0 ? r.join(' · ') : 'Standard monitoring';
}

// ============= TOP 20 PLAYBOOK =============

export function generateTop20Playbooks(reports: GSCGuideReport[]): Top20Playbook[] {
  const playbooks: Top20Playbook[] = [];

  for (const r of reports) {
    const d7 = r.periods['7d'];
    if (!d7) continue;

    if (
      d7.avgPosition >= THRESHOLDS.TOP20_PLAYBOOK.min &&
      d7.avgPosition <= THRESHOLDS.TOP20_PLAYBOOK.max &&
      (!r.delta7d || Math.abs(r.delta7d.position) <= 2)
    ) {
      playbooks.push({
        slug: r.slug,
        position: d7.avgPosition,
        impressions: d7.impressions,
        steps: [
          'Add snippet summary under H1',
          'Add comparison table',
          'Add 2 FAQ questions targeting PAA queries',
          'Inject 2 contextual inbound internal links',
          'Update "Last Updated: 2026" date',
          'Improve title specificity with benefit keyword',
        ],
        activatedAt: new Date().toISOString(),
      });
    }
  }

  return playbooks.sort((a, b) => a.position - b.position);
}

// ============= WEEKLY SUMMARY =============

export function generateWeeklyReport(pages: PriorityPage[]): WeeklyReport {
  const totalImpressions = pages.reduce((s, p) => s + p.metrics.impressions7d, 0);
  const totalClicks = pages.reduce((s, p) => s + p.metrics.clicks7d, 0);
  const avgCtr = pages.length > 0
    ? pages.reduce((s, p) => s + p.metrics.ctr7d, 0) / pages.length
    : 0;
  const avgPosition = pages.length > 0
    ? pages.reduce((s, p) => s + p.metrics.avgPosition7d, 0) / pages.length
    : 0;

  const topGainers = pages
    .filter(p => p.metrics.impressionsDelta7d > 0)
    .sort((a, b) => b.metrics.impressionsDelta7d - a.metrics.impressionsDelta7d)
    .slice(0, 5)
    .map(p => ({ slug: p.slug, delta: p.metrics.impressionsDelta7d }));

  const topDecliners = pages
    .filter(p => p.metrics.positionDelta7d < -2)
    .sort((a, b) => a.metrics.positionDelta7d - b.metrics.positionDelta7d)
    .slice(0, 5)
    .map(p => ({ slug: p.slug, delta: p.metrics.positionDelta7d }));

  const pagesNearTop20 = pages
    .filter(p => p.metrics.avgPosition7d >= 18 && p.metrics.avgPosition7d <= 25)
    .map(p => p.slug);

  const pagesLowCtr = pages
    .filter(p => p.metrics.ctr7d < 1 && p.metrics.impressions7d >= 150)
    .map(p => p.slug);

  const alertCount = pages.reduce((s, p) => s + p.alerts.length, 0);
  const riskCount = pages.filter(p => p.alerts.some(a => a.severity === 'critical')).length;

  const actions: string[] = [];
  if (pagesLowCtr.length > 0) actions.push(`A/B test titles for ${pagesLowCtr.length} low-CTR pages`);
  if (pagesNearTop20.length > 0) actions.push(`Push ${pagesNearTop20.length} pages from pos 18–25 with internal links`);
  if (riskCount > 0) actions.push(`Review ${riskCount} pages with ranking drops`);
  if (topGainers.length > 0) actions.push(`Capitalize on momentum for ${topGainers[0].slug}`);

  return {
    weekOf: new Date().toISOString().split('T')[0],
    totalImpressions,
    totalClicks,
    avgCtr: Math.round(avgCtr * 100) / 100,
    avgPosition: Math.round(avgPosition * 10) / 10,
    topGainers,
    topDecliners,
    pagesNearTop20,
    pagesLowCtr,
    alertCount,
    riskCount,
    recommendedActions: actions,
  };
}

// ============= HELPERS =============

function titleVariant(slug: string, variant: number): string {
  const kw = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/2026/g, '').trim();
  if (variant === 1) return `${kw} (2026) – What Actually Works & Why`;
  return `${kw} (2026) – Tested & Ranked by Experts`;
}
