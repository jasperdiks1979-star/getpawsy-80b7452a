/**
 * SEO Monitoring System (Monitoring-Only)
 * 
 * Generates alerts and priority scores for guides based on GSC metrics.
 * Does NOT automatically modify content, titles, descriptions, or links.
 * Monitoring and decision-support only.
 */

import type { GSCGuideReport } from './gsc';

// ============= TYPES =============

export interface MonitoringAlert {
  slug: string;
  type: 'low_ctr' | 'top_20_push' | 'momentum' | 'decay' | 'under_supported';
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
  createdAt: string;
}

export interface GuideMonitoringMetrics {
  slug: string;
  impressions7d: number;
  clicks7d: number;
  ctr7d: number;
  avgPosition7d: number;
  impressionsDelta7d: number;
  impressionsDelta14d: number;
  positionDelta7d: number;
  positionDelta14d: number;
  trendDirection: 'up' | 'down' | 'stable';
  inboundLinks: number;
  outboundLinks: number;
  isOrphaned: boolean;
}

export interface GuidePriorityScore {
  slug: string;
  score: number; // 1-100
  reason: string;
  alerts: MonitoringAlert[];
  metrics: GuideMonitoringMetrics;
}

export interface WeeklySummary {
  weekOf: string;
  totalImpressions: number;
  totalClicks: number;
  avgCtr: number;
  avgPosition: number;
  topGainers: string[];
  pagesNeedingAction: string[];
  alertCount: number;
  riskCount: number;
}

// ============= ALERT GENERATION (MONITORING ONLY) =============

export function generateMonitoringAlerts(reports: GSCGuideReport[]): MonitoringAlert[] {
  const alerts: MonitoringAlert[] = [];
  const now = new Date().toISOString();

  for (const report of reports) {
    const d7 = report.periods['7d'];
    if (!d7) continue;

    // ALERT 1: Low CTR Candidate
    if (d7.impressions > 150 && d7.ctr < 1) {
      alerts.push({
        slug: report.slug,
        type: 'low_ctr',
        severity: 'warning',
        title: 'Low CTR Candidate',
        description: `${d7.impressions} impressions but only ${d7.ctr.toFixed(2)}% CTR. Title/meta may need testing.`,
        metrics: { impressions: d7.impressions, ctr: d7.ctr },
        createdAt: now,
      });
    }

    // ALERT 2: Top 20 Push Candidate
    if (d7.avgPosition >= 18 && d7.avgPosition <= 35 && !report.delta7d) {
      // Stable if no delta or delta is small
      alerts.push({
        slug: report.slug,
        type: 'top_20_push',
        severity: 'info',
        title: 'Top 20 Push Candidate',
        description: `Position ${d7.avgPosition} with ${d7.impressions} impressions. Stable ranking, good push opportunity.`,
        metrics: { position: d7.avgPosition, impressions: d7.impressions },
        createdAt: now,
      });
    }

    // ALERT 3: Momentum Page
    if (report.delta7d && d7.impressions > 50) {
      const deltaPct = (report.delta7d.impressions / (d7.impressions - report.delta7d.impressions)) * 100;
      if (deltaPct > 20) {
        alerts.push({
          slug: report.slug,
          type: 'momentum',
          severity: 'info',
          title: 'Momentum Page',
          description: `Impressions up ~${Math.round(deltaPct)}% week-over-week. Building visibility.`,
          metrics: { impressions: d7.impressions },
          createdAt: now,
        });
      }
    }

    // ALERT 4: Ranking Risk (Decay)
    if (report.delta7d && report.delta7d.position < -5) {
      alerts.push({
        slug: report.slug,
        type: 'decay',
        severity: 'critical',
        title: 'Ranking Risk',
        description: `Position dropped ${Math.abs(report.delta7d.position)} places in 7 days. Immediate review recommended.`,
        metrics: { position: d7.avgPosition, positionDelta: report.delta7d.position },
        createdAt: now,
      });
    }
  }

  return alerts;
}

// ============= PRIORITY SCORING (MONITORING ONLY) =============

export function calculatePriorityScores(
  reports: GSCGuideReport[],
  internalLinkMap: Record<string, number> = {}
): GuidePriorityScore[] {
  const alerts = generateMonitoringAlerts(reports);
  const alertsBySlug = new Map<string, MonitoringAlert[]>();
  alerts.forEach(a => {
    if (!alertsBySlug.has(a.slug)) alertsBySlug.set(a.slug, []);
    alertsBySlug.get(a.slug)!.push(a);
  });

  return reports
    .map(report => {
      const d7 = report.periods['7d'];
      if (!d7) return null;

      const guideAlerts = alertsBySlug.get(report.slug) || [];
      const inboundLinks = internalLinkMap[report.slug] || 0;

      // Priority score calculation (1-100)
      let score = 50; // baseline

      // Impressions (0-25 points)
      if (d7.impressions > 500) score += 25;
      else if (d7.impressions > 300) score += 20;
      else if (d7.impressions > 150) score += 15;
      else if (d7.impressions > 50) score += 10;

      // Position range (0-25 points) — 18-35 is most actionable
      if (d7.avgPosition >= 18 && d7.avgPosition <= 35) score += 25;
      else if (d7.avgPosition < 18) score += 15;
      else if (d7.avgPosition > 50) score -= 10;

      // CTR weakness (0-20 points)
      if (d7.ctr < 1 && d7.impressions > 150) score += 20;
      else if (d7.ctr < 2 && d7.impressions > 100) score += 10;

      // Link support (0-15 points)
      if (inboundLinks < 3) score -= 10; // under-supported
      else if (inboundLinks >= 5) score += 5;

      // Alert severity bonus (0-10 points)
      const hasCritical = guideAlerts.some(a => a.severity === 'critical');
      const hasWarning = guideAlerts.some(a => a.severity === 'warning');
      if (hasCritical) score += 10;
      else if (hasWarning) score += 5;

      score = Math.max(1, Math.min(100, score)); // Clamp 1-100

      return {
        slug: report.slug,
        score,
        reason: buildScoreReason(d7, inboundLinks, guideAlerts),
        alerts: guideAlerts,
        metrics: {
          slug: report.slug,
          impressions7d: d7.impressions,
          clicks7d: d7.clicks,
          ctr7d: d7.ctr,
          avgPosition7d: d7.avgPosition,
          impressionsDelta7d: report.delta7d?.impressions || 0,
          impressionsDelta14d: 0,
          positionDelta7d: report.delta7d?.position || 0,
          positionDelta14d: 0,
          trendDirection: report.delta7d?.position ? (report.delta7d.position > 1 ? 'up' : report.delta7d.position < -1 ? 'down' : 'stable') : 'stable',
          inboundLinks,
          outboundLinks: 0,
          isOrphaned: inboundLinks === 0,
        },
      };
    })
    .filter((score): score is GuidePriorityScore => score !== null)
    .sort((a, b) => b.score - a.score);
}

function buildScoreReason(d7: any, inboundLinks: number, alerts: MonitoringAlert[]): string {
  const reasons: string[] = [];

  if (d7.impressions > 300) reasons.push('High impressions');
  if (d7.avgPosition >= 18 && d7.avgPosition <= 35) reasons.push('Actionable position (18-35)');
  if (d7.ctr < 1 && d7.impressions > 150) reasons.push('Low CTR opportunity');
  if (inboundLinks < 3) reasons.push('Under-supported (needs links)');
  if (alerts.length > 0) reasons.push(`${alerts.length} alert${alerts.length > 1 ? 's' : ''}`);

  return reasons.length > 0 ? reasons.join(' + ') : 'Standard monitoring';
}

// ============= UNDER-SUPPORTED PAGE DETECTION =============

export function detectUnsupportedPages(
  reports: GSCGuideReport[],
  internalLinkMap: Record<string, number> = {}
): string[] {
  return reports
    .filter(r => {
      const inboundLinks = internalLinkMap[r.slug] || 0;
      return inboundLinks < 3 && r.periods['7d'] && r.periods['7d'].impressions > 0;
    })
    .map(r => r.slug)
    .sort();
}

// ============= WEEKLY SUMMARY =============

export function generateWeeklySummary(
  priorityScores: GuidePriorityScore[]
): WeeklySummary {
  const totalImpressions = priorityScores.reduce((s, p) => s + p.metrics.impressions7d, 0);
  const totalClicks = priorityScores.reduce((s, p) => s + p.metrics.clicks7d, 0);
  const avgCtr = priorityScores.length > 0
    ? priorityScores.reduce((s, p) => s + p.metrics.ctr7d, 0) / priorityScores.length
    : 0;
  const avgPosition = priorityScores.length > 0
    ? priorityScores.reduce((s, p) => s + p.metrics.avgPosition7d, 0) / priorityScores.length
    : 0;

  const topGainers = priorityScores
    .filter(p => p.metrics.impressionsDelta7d > 0)
    .sort((a, b) => b.metrics.impressionsDelta7d - a.metrics.impressionsDelta7d)
    .slice(0, 5)
    .map(p => p.slug);

  const pagesNeedingAction = priorityScores
    .filter(p => p.alerts.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(p => p.slug);

  const alertCount = priorityScores.reduce((s, p) => s + p.alerts.length, 0);
  const riskCount = priorityScores.filter(p => p.alerts.some(a => a.severity === 'critical')).length;

  return {
    weekOf: new Date().toISOString().split('T')[0],
    totalImpressions,
    totalClicks,
    avgCtr: Math.round(avgCtr * 100) / 100,
    avgPosition: Math.round(avgPosition * 10) / 10,
    topGainers,
    pagesNeedingAction,
    alertCount,
    riskCount,
  };
}
