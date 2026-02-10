/**
 * Guide Monitoring & Alert System
 * 
 * Monitors GSC metrics per guide and generates actionable alerts.
 * Designed to run daily (headless).
 */

import type { GSCGuideReport } from './gsc';

// ============= TYPES =============

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertAction = 'create_variant_b' | 'boost_internal_links' | 'expand_content' | 'needs_review';

export interface GuideAlert {
  slug: string;
  severity: AlertSeverity;
  action: AlertAction;
  title: string;
  description: string;
  metrics: {
    impressions?: number;
    ctr?: number;
    position?: number;
    positionDelta?: number;
  };
  createdAt: string;
  resolved: boolean;
}

export interface GuideHealthStatus {
  slug: string;
  status: 'healthy' | 'attention' | 'critical';
  impressions7d: number;
  clicks7d: number;
  ctr7d: number;
  avgPosition7d: number;
  trendDirection: 'up' | 'down' | 'stable';
  alerts: GuideAlert[];
}

// ============= ALERT RULES =============

const ALERT_RULES = {
  LOW_CTR: { threshold: 1.5, minImpressions: 100 },
  POSITION_11_20: { min: 11, max: 20 },
  POSITION_30_50: { min: 30, max: 50 },
  POSITION_DROP: { dropThreshold: 5 },
};

/**
 * Evaluate all alert rules against GSC data for guides
 */
export function evaluateGuideAlerts(reports: GSCGuideReport[]): GuideHealthStatus[] {
  return reports.map(report => {
    const alerts: GuideAlert[] = [];
    const data7d = report.periods['7d'];
    const now = new Date().toISOString();

    if (!data7d) {
      return {
        slug: report.slug,
        status: 'attention' as const,
        impressions7d: 0,
        clicks7d: 0,
        ctr7d: 0,
        avgPosition7d: 0,
        trendDirection: 'stable' as const,
        alerts: [{
          slug: report.slug,
          severity: 'info',
          action: 'needs_review',
          title: 'No data available',
          description: 'No Search Console data found for this guide yet. Allow 2-4 weeks for indexation.',
          metrics: {},
          createdAt: now,
          resolved: false,
        }],
      };
    }

    // Rule 1: Low CTR with sufficient impressions
    if (data7d.impressions >= ALERT_RULES.LOW_CTR.minImpressions && data7d.ctr < ALERT_RULES.LOW_CTR.threshold) {
      alerts.push({
        slug: report.slug,
        severity: 'warning',
        action: 'create_variant_b',
        title: 'Low CTR — Title test recommended',
        description: `CTR is ${data7d.ctr.toFixed(2)}% with ${data7d.impressions} impressions. Create a new title variant B to test.`,
        metrics: { impressions: data7d.impressions, ctr: data7d.ctr },
        createdAt: now,
        resolved: false,
      });
    }

    // Rule 2: Position 11-20 — boost internal links
    if (data7d.avgPosition >= ALERT_RULES.POSITION_11_20.min && data7d.avgPosition <= ALERT_RULES.POSITION_11_20.max) {
      alerts.push({
        slug: report.slug,
        severity: 'info',
        action: 'boost_internal_links',
        title: 'Position 11–20 — Internal link boost needed',
        description: `Avg position ${data7d.avgPosition}. Add 3-5 internal links from high-authority pages to push into top 10.`,
        metrics: { position: data7d.avgPosition },
        createdAt: now,
        resolved: false,
      });
    }

    // Rule 3: Position 30-50 — content expansion
    if (data7d.avgPosition >= ALERT_RULES.POSITION_30_50.min && data7d.avgPosition <= ALERT_RULES.POSITION_30_50.max) {
      alerts.push({
        slug: report.slug,
        severity: 'warning',
        action: 'expand_content',
        title: 'Position 30–50 — Content expansion needed',
        description: `Avg position ${data7d.avgPosition}. Add 1 extra section + 2 FAQs to strengthen topical depth.`,
        metrics: { position: data7d.avgPosition },
        createdAt: now,
        resolved: false,
      });
    }

    // Rule 4: Position drop >5 in 7 days
    if (report.delta7d && report.delta7d.position < -ALERT_RULES.POSITION_DROP.dropThreshold) {
      alerts.push({
        slug: report.slug,
        severity: 'critical',
        action: 'needs_review',
        title: 'Significant position drop',
        description: `Position dropped ${Math.abs(report.delta7d.position)} places in 7 days. Immediate review needed.`,
        metrics: { position: data7d.avgPosition, positionDelta: report.delta7d.position },
        createdAt: now,
        resolved: false,
      });
    }

    // Determine overall status
    const hasCritical = alerts.some(a => a.severity === 'critical');
    const hasWarning = alerts.some(a => a.severity === 'warning');
    const status = hasCritical ? 'critical' : hasWarning ? 'attention' : 'healthy';

    // Determine trend
    let trendDirection: 'up' | 'down' | 'stable' = 'stable';
    if (report.delta7d) {
      if (report.delta7d.position > 1) trendDirection = 'up';
      else if (report.delta7d.position < -1) trendDirection = 'down';
    }

    return {
      slug: report.slug,
      status,
      impressions7d: data7d.impressions,
      clicks7d: data7d.clicks,
      ctr7d: data7d.ctr,
      avgPosition7d: data7d.avgPosition,
      trendDirection,
      alerts,
    };
  });
}
