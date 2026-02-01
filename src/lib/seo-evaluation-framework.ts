/**
 * SEO Evaluation Framework for GetPawsy
 * 
 * A structured system for monthly SEO performance tracking and optimization.
 * Use this framework to evaluate organic growth and make data-driven decisions.
 */

// ============================================
// METRICS TO TRACK (Monthly)
// ============================================

export interface SEOMetrics {
  // Google Search Console Metrics
  indexedPages: number;           // Total pages indexed in Google
  totalImpressions: number;       // How often site appears in search results
  totalClicks: number;            // Clicks from search results
  averageCTR: number;             // Click-through rate percentage
  averagePosition: number;        // Average ranking position
  
  // Page-Level Metrics
  pagePerformance: PageMetric[];
  
  // Organic Traffic (from analytics)
  organicSessions: number;        // Sessions from organic search
  organicConversions: number;     // Conversions from organic traffic
  organicRevenue: number;         // Revenue from organic traffic
}

export interface PageMetric {
  url: string;
  pageType: 'blog' | 'collection' | 'product' | 'static';
  impressions: number;
  clicks: number;
  ctr: number;
  averagePosition: number;
  isIndexed: boolean;
}

// ============================================
// EVALUATION RULES & ACTION TRIGGERS
// ============================================

export const SEO_EVALUATION_RULES = {
  // Position-based optimizations
  position: {
    // Pages ranking 11-30: Need more internal link juice
    needsInternalLinks: {
      range: [11, 30],
      action: 'Add 3-5 internal links from high-authority pages to this page',
      priority: 'high',
    },
    // Pages ranking 5-10: Close to page 1, optimize on-page
    needsTitleOptimization: {
      range: [5, 10],
      action: 'Improve title tag and H1 with primary keyword at front',
      priority: 'high',
    },
    // Pages ranking 1-4: Maintain and protect
    maintain: {
      range: [1, 4],
      action: 'Monitor competitors, refresh content quarterly',
      priority: 'low',
    },
    // Pages ranking 30+: Consider content rewrite or consolidation
    needsRewrite: {
      range: [30, 100],
      action: 'Evaluate content quality, consider rewriting or merging',
      priority: 'medium',
    },
  },
  
  // CTR-based optimizations
  ctr: {
    // High impressions, low CTR: Meta description issue
    lowCTR: {
      threshold: 2, // Below 2% CTR
      minImpressions: 100,
      action: 'Rewrite meta description to be more compelling',
      priority: 'high',
    },
    // Good CTR benchmark
    goodCTR: {
      threshold: 5, // Above 5% CTR
      action: 'Maintain current meta, use as template for similar pages',
      priority: 'low',
    },
  },
  
  // Traffic with no conversions
  noConversions: {
    minSessions: 50,
    action: 'Improve internal links to product pages, add CTA buttons',
    priority: 'high',
  },
  
  // Indexing issues
  indexing: {
    notIndexed: {
      maxAge: 14, // Days since publish
      action: 'Request indexing via Search Console, check for crawl errors',
      priority: 'critical',
    },
  },
};

// ============================================
// CONTENT SCALING RULES
// ============================================

export const CONTENT_SCALING_RULES = {
  // Only publish new content after previous is indexed
  indexBeforePublish: true,
  
  // Maximum new pages per week
  maxPagesPerWeek: 3,
  
  // Focus on one niche at a time
  nicheFirst: true,
  
  // Minimum days between same-topic content
  topicCooldown: 7,
  
  // Content types and their frequency
  publishingCadence: {
    blog: {
      frequency: 'weekly',
      maxPerWeek: 2,
    },
    collection: {
      frequency: 'bi-weekly',
      maxPerWeek: 1,
    },
  },
};

// ============================================
// EVALUATION FUNCTIONS
// ============================================

export function evaluatePage(metric: PageMetric): SEORecommendation[] {
  const recommendations: SEORecommendation[] = [];
  
  // Check position-based rules
  const pos = metric.averagePosition;
  const rules = SEO_EVALUATION_RULES.position;
  
  if (pos >= rules.needsInternalLinks.range[0] && pos <= rules.needsInternalLinks.range[1]) {
    recommendations.push({
      type: 'internal-links',
      priority: rules.needsInternalLinks.priority as 'critical' | 'high' | 'medium' | 'low',
      action: rules.needsInternalLinks.action,
      url: metric.url,
    });
  }
  
  if (pos >= rules.needsTitleOptimization.range[0] && pos <= rules.needsTitleOptimization.range[1]) {
    recommendations.push({
      type: 'title-optimization',
      priority: rules.needsTitleOptimization.priority as 'critical' | 'high' | 'medium' | 'low',
      action: rules.needsTitleOptimization.action,
      url: metric.url,
    });
  }
  
  if (pos >= rules.needsRewrite.range[0]) {
    recommendations.push({
      type: 'content-rewrite',
      priority: rules.needsRewrite.priority as 'critical' | 'high' | 'medium' | 'low',
      action: rules.needsRewrite.action,
      url: metric.url,
    });
  }
  
  // Check CTR-based rules
  const ctrRules = SEO_EVALUATION_RULES.ctr;
  if (metric.ctr < ctrRules.lowCTR.threshold && metric.impressions >= ctrRules.lowCTR.minImpressions) {
    recommendations.push({
      type: 'meta-description',
      priority: ctrRules.lowCTR.priority as 'critical' | 'high' | 'medium' | 'low',
      action: ctrRules.lowCTR.action,
      url: metric.url,
    });
  }
  
  // Check indexing
  if (!metric.isIndexed) {
    recommendations.push({
      type: 'indexing',
      priority: 'critical',
      action: SEO_EVALUATION_RULES.indexing.notIndexed.action,
      url: metric.url,
    });
  }
  
  return recommendations;
}

export interface SEORecommendation {
  type: 'internal-links' | 'title-optimization' | 'meta-description' | 'content-rewrite' | 'indexing' | 'cta-improvement';
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: string;
  url: string;
}

// ============================================
// MONTHLY REPORT TEMPLATE
// ============================================

export function generateMonthlyReportTemplate(metrics: SEOMetrics): MonthlyReport {
  const allRecommendations: SEORecommendation[] = [];
  
  // Evaluate all pages
  for (const page of metrics.pagePerformance) {
    const pageRecs = evaluatePage(page);
    allRecommendations.push(...pageRecs);
  }
  
  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allRecommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return {
    period: new Date().toISOString().slice(0, 7), // YYYY-MM
    summary: {
      indexedPages: metrics.indexedPages,
      totalImpressions: metrics.totalImpressions,
      totalClicks: metrics.totalClicks,
      averageCTR: metrics.averageCTR,
      averagePosition: metrics.averagePosition,
      organicSessions: metrics.organicSessions,
      organicConversions: metrics.organicConversions,
      organicRevenue: metrics.organicRevenue,
    },
    topPriorities: allRecommendations.slice(0, 10), // Top 10 actions
    allRecommendations,
    nextSteps: generateNextSteps(allRecommendations),
  };
}

export interface MonthlyReport {
  period: string;
  summary: {
    indexedPages: number;
    totalImpressions: number;
    totalClicks: number;
    averageCTR: number;
    averagePosition: number;
    organicSessions: number;
    organicConversions: number;
    organicRevenue: number;
  };
  topPriorities: SEORecommendation[];
  allRecommendations: SEORecommendation[];
  nextSteps: string[];
}

function generateNextSteps(recommendations: SEORecommendation[]): string[] {
  const steps: string[] = [];
  
  // Count by type
  const typeCounts = new Map<string, number>();
  for (const rec of recommendations) {
    typeCounts.set(rec.type, (typeCounts.get(rec.type) || 0) + 1);
  }
  
  // Generate actionable next steps
  if (typeCounts.has('indexing')) {
    steps.push(`Fix ${typeCounts.get('indexing')} indexing issues via Search Console`);
  }
  
  if (typeCounts.has('internal-links')) {
    steps.push(`Add internal links to ${typeCounts.get('internal-links')} pages ranking 11-30`);
  }
  
  if (typeCounts.has('title-optimization')) {
    steps.push(`Optimize titles for ${typeCounts.get('title-optimization')} pages close to page 1`);
  }
  
  if (typeCounts.has('meta-description')) {
    steps.push(`Rewrite meta descriptions for ${typeCounts.get('meta-description')} low-CTR pages`);
  }
  
  if (typeCounts.has('content-rewrite')) {
    steps.push(`Review and improve ${typeCounts.get('content-rewrite')} underperforming pages`);
  }
  
  return steps;
}

// ============================================
// QUICK HEALTH CHECK
// ============================================

export function quickHealthCheck(metrics: SEOMetrics): HealthCheckResult {
  const issues: string[] = [];
  const wins: string[] = [];
  
  // Check overall health indicators
  if (metrics.averageCTR < 2) {
    issues.push('Overall CTR below 2% - meta descriptions need improvement');
  } else if (metrics.averageCTR > 5) {
    wins.push('Strong CTR above 5% - titles and metas performing well');
  }
  
  if (metrics.averagePosition > 20) {
    issues.push('Average position below page 2 - content quality or link building needed');
  } else if (metrics.averagePosition < 10) {
    wins.push('Average position on page 1 - maintain current strategy');
  }
  
  const conversionRate = metrics.organicSessions > 0 
    ? (metrics.organicConversions / metrics.organicSessions) * 100 
    : 0;
  
  if (conversionRate < 1 && metrics.organicSessions > 100) {
    issues.push('Low conversion rate from organic - improve CTAs and internal linking to products');
  } else if (conversionRate > 3) {
    wins.push('Strong organic conversion rate above 3%');
  }
  
  const notIndexed = metrics.pagePerformance.filter(p => !p.isIndexed);
  if (notIndexed.length > 0) {
    issues.push(`${notIndexed.length} pages not indexed - check Search Console for errors`);
  }
  
  return {
    status: issues.length === 0 ? 'healthy' : issues.length <= 2 ? 'needs-attention' : 'critical',
    issues,
    wins,
  };
}

export interface HealthCheckResult {
  status: 'healthy' | 'needs-attention' | 'critical';
  issues: string[];
  wins: string[];
}

// ============================================
// SAMPLE USAGE FOR MONTHLY REVIEW
// ============================================

/*
  Monthly SEO Review Process:
  
  1. Export data from Google Search Console (Performance report)
  2. Export data from Google Analytics (Organic traffic report)
  3. Run the evaluation:
  
  const metrics: SEOMetrics = {
    indexedPages: 150,
    totalImpressions: 25000,
    totalClicks: 750,
    averageCTR: 3.0,
    averagePosition: 15.5,
    organicSessions: 1200,
    organicConversions: 24,
    organicRevenue: 1450,
    pagePerformance: [
      { url: '/blog/dog-car-safety', pageType: 'blog', impressions: 500, clicks: 25, ctr: 5, averagePosition: 8, isIndexed: true },
      // ... more pages
    ],
  };
  
  const report = generateMonthlyReportTemplate(metrics);
  const healthCheck = quickHealthCheck(metrics);
  
  console.log('Status:', healthCheck.status);
  console.log('Top Priorities:', report.topPriorities);
  console.log('Next Steps:', report.nextSteps);
*/
