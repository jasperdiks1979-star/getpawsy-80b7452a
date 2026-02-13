/**
 * Crawl Diagnostics Library
 * 
 * Calculates crawl efficiency metrics, duplicate detection, orphan analysis,
 * and crawl waste scoring for SEO optimization.
 */

export interface CrawlMetrics {
  totalIndexedPages: number;
  totalCrawledPages: number;
  indexedCrawledRatio: number;
  duplicateUrlPercentage: number;
  orphanPageCount: number;
  parameterUrlCrawlCount: number;
  avgCrawlDepth: number;
  crawledNotIndexedCount: number;
  alternativeCanonicalCount: number;
  pagesWithZeroLinks: number;
}

export interface CrawlWasteScore {
  score: number; // 0-100
  severity: 'healthy' | 'warning' | 'critical';
  reasons: string[];
  duplicateImpact: number;
  parameterImpact: number;
  indexRatioImpact: number;
  orphanImpact: number;
}

export interface DuplicateUrlPattern {
  pattern: string;
  count: number;
  frequency: 'low' | 'medium' | 'high';
  canonicalTarget: string | null;
  mismatchCount: number;
}

export interface OrphanPage {
  url: string;
  type: 'product' | 'guide' | 'category' | 'other';
  lastCrawled: string | null;
  isIndexed: boolean;
  internalLinkCount: number;
  crawlDepth: number;
}

export interface PriorityPageStatus {
  url: string;
  type: 'product' | 'guide' | 'category';
  lastCrawled: string | null;
  isIndexed: boolean;
  canonicalUrl: string | null;
  structuredDataDetected: boolean;
  internalLinkCount: number;
}

export interface TrendDataPoint {
  date: string;
  crawlVolume: number;
  indexedGrowth: number;
  duplicateCount: number;
  parameterCrawls: number;
}

export interface CrawlAlert {
  id: string;
  type: 'ratio' | 'duplicates' | 'orphans' | 'parameters' | 'canonical';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metric: number;
  threshold: number;
  createdAt: string;
}

// ============= CRAWL WASTE SCORE CALCULATION =============

export function calculateCrawlWasteScore(metrics: CrawlMetrics): CrawlWasteScore {
  const reasons: string[] = [];
  let score = 0;

  // Duplicate URL impact (0-25 points)
  const duplicateImpact = Math.min(25, (metrics.duplicateUrlPercentage / 100) * 25);
  if (metrics.duplicateUrlPercentage > 5) {
    reasons.push(`High duplicate crawling: ${metrics.duplicateUrlPercentage.toFixed(1)}%`);
  }
  score += duplicateImpact;

  // Parameter crawl impact (0-20 points)
  const paramImpact = Math.min(
    20,
    (metrics.parameterUrlCrawlCount / Math.max(1, metrics.totalCrawledPages)) * 20
  );
  if (metrics.parameterUrlCrawlCount > metrics.totalCrawledPages * 0.15) {
    reasons.push(
      `Parameter crawling exceeds 15%: ${((metrics.parameterUrlCrawlCount / metrics.totalCrawledPages) * 100).toFixed(1)}%`
    );
  }
  score += paramImpact;

  // Indexed/Crawled ratio impact (0-30 points)
  const ratioThreshold = 60;
  if (metrics.indexedCrawledRatio < ratioThreshold) {
    const ratioPenalty = ((ratioThreshold - metrics.indexedCrawledRatio) / ratioThreshold) * 30;
    reasons.push(
      `Low indexation ratio: ${metrics.indexedCrawledRatio.toFixed(1)}% (target: ${ratioThreshold}%)`
    );
    score += Math.min(30, ratioPenalty);
  }

  // Orphan pages impact (0-15 points)
  const orphanImpact = Math.min(15, (metrics.orphanPageCount / 50) * 15);
  if (metrics.orphanPageCount > 10) {
    reasons.push(`High orphan count: ${metrics.orphanPageCount} pages with no inbound links`);
    score += orphanImpact;
  }

  // Crawl depth impact (0-10 points)
  if (metrics.avgCrawlDepth > 3) {
    reasons.push(`Deep crawl depth: ${metrics.avgCrawlDepth.toFixed(1)} (target: ≤3)`);
    score += Math.min(10, (metrics.avgCrawlDepth - 3) * 5);
  }

  score = Math.min(100, Math.max(0, Math.round(score)));

  const severity: 'healthy' | 'warning' | 'critical' =
    score <= 30 ? 'healthy' : score <= 60 ? 'warning' : 'critical';

  if (reasons.length === 0) {
    reasons.push('Crawl health is optimal');
  }

  return {
    score,
    severity,
    reasons,
    duplicateImpact: Math.round(duplicateImpact),
    parameterImpact: Math.round(paramImpact),
    indexRatioImpact: Math.round(score - duplicateImpact - paramImpact - orphanImpact),
    orphanImpact: Math.round(orphanImpact),
  };
}

// ============= CRAWL ALERT GENERATION =============

export function generateCrawlAlerts(metrics: CrawlMetrics): CrawlAlert[] {
  const alerts: CrawlAlert[] = [];
  const now = new Date().toISOString();

  // Alert: Low indexed/crawled ratio
  if (metrics.indexedCrawledRatio < 60) {
    alerts.push({
      id: 'ratio-low',
      type: 'ratio',
      severity: metrics.indexedCrawledRatio < 40 ? 'critical' : 'warning',
      title: 'Low Indexation Ratio',
      description: `Only ${metrics.indexedCrawledRatio.toFixed(1)}% of crawled pages are indexed. Check for noindex directives, robots.txt blocks, or thin content.`,
      metric: metrics.indexedCrawledRatio,
      threshold: 60,
      createdAt: now,
    });
  }

  // Alert: High duplicate URLs
  if (metrics.duplicateUrlPercentage > 5) {
    alerts.push({
      id: 'dup-high',
      type: 'duplicates',
      severity: metrics.duplicateUrlPercentage > 15 ? 'critical' : 'warning',
      title: 'High Duplicate URL Count',
      description: `${metrics.duplicateUrlPercentage.toFixed(1)}% of crawl activity is duplicates. Improve canonical tags and URL normalization.`,
      metric: metrics.duplicateUrlPercentage,
      threshold: 5,
      createdAt: now,
    });
  }

  // Alert: High orphan count
  if (metrics.orphanPageCount > 10) {
    alerts.push({
      id: 'orphan-high',
      type: 'orphans',
      severity: metrics.orphanPageCount > 20 ? 'critical' : 'warning',
      title: 'High Orphan Page Count',
      description: `${metrics.orphanPageCount} pages have no inbound links. Integrate these pages into your internal link strategy.`,
      metric: metrics.orphanPageCount,
      threshold: 10,
      createdAt: now,
    });
  }

  // Alert: High parameter crawling
  const paramPercentage = (metrics.parameterUrlCrawlCount / Math.max(1, metrics.totalCrawledPages)) * 100;
  if (paramPercentage > 15) {
    alerts.push({
      id: 'param-high',
      type: 'parameters',
      severity: paramPercentage > 30 ? 'critical' : 'warning',
      title: 'Parameter URL Crawling',
      description: `${paramPercentage.toFixed(1)}% of crawls are parameter-based URLs. Enforce robots.txt blocks and canonical normalization.`,
      metric: paramPercentage,
      threshold: 15,
      createdAt: now,
    });
  }

  // Alert: Alternative canonical detected
  if (metrics.alternativeCanonicalCount > 0) {
    alerts.push({
      id: 'canon-alt',
      type: 'canonical',
      severity: metrics.alternativeCanonicalCount > 5 ? 'critical' : 'info',
      title: 'Alternative Canonical URLs',
      description: `${metrics.alternativeCanonicalCount} pages use alternative canonical tags. Verify all canonicals point to preferred URLs.`,
      metric: metrics.alternativeCanonicalCount,
      threshold: 0,
      createdAt: now,
    });
  }

  return alerts;
}

// ============= METRIC COLOR CODING =============

export function getMetricColor(
  value: number,
  thresholds: { healthy: number; warning: number }
): 'green' | 'yellow' | 'red' {
  if (value <= thresholds.healthy) return 'green';
  if (value <= thresholds.warning) return 'yellow';
  return 'red';
}

export function getScoreSeverityColor(score: number): 'green' | 'yellow' | 'red' {
  if (score <= 30) return 'green';
  if (score <= 60) return 'yellow';
  return 'red';
}

// ============= MOCK DATA GENERATOR (for development) =============

export function generateMockCrawlMetrics(): CrawlMetrics {
  return {
    totalIndexedPages: 1342,
    totalCrawledPages: 2156,
    indexedCrawledRatio: 62.2,
    duplicateUrlPercentage: 8.3,
    orphanPageCount: 14,
    parameterUrlCrawlCount: 187,
    avgCrawlDepth: 2.4,
    crawledNotIndexedCount: 814,
    alternativeCanonicalCount: 3,
    pagesWithZeroLinks: 8,
  };
}

export function generateMockTrendData(): TrendDataPoint[] {
  const data: TrendDataPoint[] = [];
  const today = new Date();

  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    data.push({
      date: date.toISOString().split('T')[0],
      crawlVolume: Math.floor(2000 + Math.random() * 400),
      indexedGrowth: Math.floor(1200 + Math.random() * 200),
      duplicateCount: Math.floor(150 + Math.random() * 100),
      parameterCrawls: Math.floor(150 + Math.random() * 100),
    });
  }

  return data;
}
