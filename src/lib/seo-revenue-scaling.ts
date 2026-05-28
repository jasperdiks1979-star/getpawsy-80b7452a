/**
 * 12-Month SEO → Revenue Scaling Blueprint
 * Phase-based growth framework with revenue intelligence overlay.
 */

// ============= PHASE TYPES =============

export interface ScalingPhase {
  id: 1 | 2 | 3 | 4;
  name: string;
  months: string;
  status: 'active' | 'upcoming' | 'completed';
  objectives: string[];
  kpis: { label: string; target: string; current: string; progress: number }[];
}

export interface ScalingTarget {
  month: 3 | 6 | 12;
  impressions: { min: number; max: number; current: number };
  clicks: { min: number; max: number; current: number };
  top10Keywords: { target: number; current: number };
  indexedPages: { target: number; current: number };
  organicRevenue: { target: number; current: number };
}

export interface RevenueMatrixItem {
  url: string;
  keyword: string;
  category: string;
  impressions: number;
  clicks: number;
  avgPosition: number;
  ctr: number;
  revenue: number;
  conversionRate: number;
  addToCartRate: number;
  revenuePerSession: number;
  matrix: 'priority' | 'visibility' | 'conversion' | 'underperforming';
}

export interface SuccessMetric {
  label: string;
  value: string | number;
  trend: 'up' | 'down' | 'stable';
  delta: string;
  color: 'green' | 'yellow' | 'red';
}

export interface WeeklyLoopAction {
  id: string;
  type: 'ranking_push' | 'content_expansion' | 'authority_reinforcement' | 'revenue_optimization';
  title: string;
  description: string;
  target: string;
  impact: 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'completed';
}

export interface MonthlyProjection {
  month: number;
  impressions: number;
  clicks: number;
  organicSessions: number;
  top10Keywords: number;
  indexedPages: number;
  organicRevenue: number;
  revenuePerSession: number;
  crawlEfficiency: number;
}

// ============= PHASE GENERATOR =============

export function generatePhases(): ScalingPhase[] {
  return [
    {
      id: 1, name: 'Foundation & Concentration', months: 'Months 1–3', status: 'active',
      objectives: [
        'Crawl stabilization & waste elimination',
        'Cluster concentration (Cat Trees first)',
        'Push 3–5 pages into Top 20',
        'CTR optimization on high-impression pages',
        'Internal link ladder construction',
      ],
      kpis: [
        { label: 'Crawl Waste Score', target: '<30', current: '42', progress: 60 },
        { label: 'Top 20 Keywords', target: '5', current: '2', progress: 40 },
        { label: 'Avg CTR', target: '2.5%', current: '1.8%', progress: 72 },
        { label: 'Indexed Pages', target: '50', current: '34', progress: 68 },
        { label: 'Monthly Impressions', target: '10K', current: '3.2K', progress: 32 },
      ],
    },
    {
      id: 2, name: 'Expansion & Authority', months: 'Months 4–6', status: 'upcoming',
      objectives: [
        'Expand 2nd authority cluster (Dog Beds)',
        'Add 15–20 comparison guides',
        'Build 30–50 quality backlinks',
        'Strengthen internal authority ladder',
        'Launch FAQ schema across priority pages',
      ],
      kpis: [
        { label: 'Active Clusters', target: '3', current: '1', progress: 33 },
        { label: 'Backlinks', target: '50', current: '3', progress: 6 },
        { label: 'Comparison Guides', target: '20', current: '0', progress: 0 },
        { label: 'Monthly Clicks', target: '1000', current: '89', progress: 9 },
        { label: 'Authority Score', target: '75', current: '58', progress: 77 },
      ],
    },
    {
      id: 3, name: 'Conversion & Dominance', months: 'Months 7–9', status: 'upcoming',
      objectives: [
        'Expand product category depth',
        'Conversion optimization layer on top traffic pages',
        'Improve snippet dominance (Featured Snippets, PAA)',
        'Structured data enhancement across all product pages',
        'Revenue-per-session optimization',
      ],
      kpis: [
        { label: 'Featured Snippets', target: '8', current: '0', progress: 0 },
        { label: 'Avg Conv Rate', target: '3.5%', current: '2.1%', progress: 60 },
        { label: 'Schema Coverage', target: '100%', current: '45%', progress: 45 },
        { label: 'Revenue/Session', target: '$0.85', current: '$0.42', progress: 49 },
        { label: 'Top 10 Keywords', target: '15', current: '2', progress: 13 },
      ],
    },
    {
      id: 4, name: 'Scale & Compound', months: 'Months 10–12', status: 'upcoming',
      objectives: [
        'Scale topical authority to 150+ guides',
        'Expand into adjacent niches (Pet Comfort, Pet Health)',
        'Authority reinforcement via cross-cluster linking',
        'Revenue-maximization refinement',
        'Build sustainable organic revenue engine',
      ],
      kpis: [
        { label: 'Total Guides', target: '150', current: '12', progress: 8 },
        { label: 'Monthly Impressions', target: '100K', current: '3.2K', progress: 3 },
        { label: 'Monthly Clicks', target: '4000', current: '89', progress: 2 },
        { label: 'Organic Revenue', target: '$7K/mo', current: '$280/mo', progress: 4 },
        { label: 'Top 10 Keywords', target: '30', current: '2', progress: 7 },
      ],
    },
  ];
}

// ============= SCALING TARGETS =============

export function generateScalingTargets(): ScalingTarget[] {
  return [
    {
      month: 3,
      impressions: { min: 5000, max: 10000, current: 3200 },
      clicks: { min: 100, max: 300, current: 89 },
      top10Keywords: { target: 5, current: 2 },
      indexedPages: { target: 50, current: 34 },
      organicRevenue: { target: 500, current: 280 },
    },
    {
      month: 6,
      impressions: { min: 25000, max: 50000, current: 3200 },
      clicks: { min: 500, max: 1000, current: 89 },
      top10Keywords: { target: 15, current: 2 },
      indexedPages: { target: 120, current: 34 },
      organicRevenue: { target: 2500, current: 280 },
    },
    {
      month: 12,
      impressions: { min: 100000, max: 200000, current: 3200 },
      clicks: { min: 2000, max: 4000, current: 89 },
      top10Keywords: { target: 30, current: 2 },
      indexedPages: { target: 300, current: 34 },
      organicRevenue: { target: 7000, current: 280 },
    },
  ];
}

// ============= REVENUE MATRIX =============

export function generateRevenueMatrix(): RevenueMatrixItem[] {
  return [
    { url: '/products/luxury-cat-tree-xl', keyword: 'large cat tree', category: 'Cat Trees', impressions: 278, clicks: 11, avgPosition: 14.6, ctr: 4.0, revenue: 1240, conversionRate: 3.1, addToCartRate: 8.2, revenuePerSession: 1.42, matrix: 'priority' },
    { url: '/products/orthopedic-dog-bed-large', keyword: 'orthopedic dog bed large', category: 'Dog Beds', impressions: 156, clicks: 9, avgPosition: 11.2, ctr: 5.8, revenue: 1680, conversionRate: 4.2, addToCartRate: 9.1, revenuePerSession: 2.18, matrix: 'priority' },
    { url: '/products/sisal-scratching-post', keyword: 'sisal scratching post', category: 'Cat Trees', impressions: 89, clicks: 3, avgPosition: 22.1, ctr: 3.4, revenue: 1120, conversionRate: 5.8, addToCartRate: 12.5, revenuePerSession: 3.85, matrix: 'visibility' },
    { url: '/products/interactive-dog-toy', keyword: 'interactive dog toy', category: 'Dog Activities', impressions: 45, clicks: 1, avgPosition: 28.4, ctr: 2.2, revenue: 980, conversionRate: 4.9, addToCartRate: 11.2, revenuePerSession: 4.12, matrix: 'visibility' },
    { url: '/products/self-cleaning-litter-box', keyword: 'self cleaning litter box', category: 'Cat Litter', impressions: 312, clicks: 14, avgPosition: 16.8, ctr: 4.5, revenue: 420, conversionRate: 1.1, addToCartRate: 3.2, revenuePerSession: 0.31, matrix: 'conversion' },
    { url: '/products/dog-cooling-mat', keyword: 'dog cooling mat', category: 'Dog Comfort', impressions: 198, clicks: 5, avgPosition: 20.1, ctr: 2.5, revenue: 280, conversionRate: 1.5, addToCartRate: 4.2, revenuePerSession: 0.58, matrix: 'conversion' },
    { url: '/products/cat-window-perch', keyword: 'cat window perch', category: 'Cat Trees', impressions: 234, clicks: 0, avgPosition: 19.5, ctr: 0, revenue: 0, conversionRate: 0, addToCartRate: 0, revenuePerSession: 0, matrix: 'underperforming' },
    { url: '/products/elevated-dog-bowl', keyword: 'elevated dog bowl', category: 'Dog Feeding', impressions: 178, clicks: 6, avgPosition: 15.3, ctr: 3.4, revenue: 340, conversionRate: 2.1, addToCartRate: 5.1, revenuePerSession: 0.62, matrix: 'conversion' },
    { url: '/products/modern-cat-condo', keyword: 'modern cat condo', category: 'Cat Trees', impressions: 167, clicks: 7, avgPosition: 13.5, ctr: 4.2, revenue: 890, conversionRate: 2.8, addToCartRate: 6.8, revenuePerSession: 1.48, matrix: 'priority' },
    { url: '/products/heated-cat-bed', keyword: 'heated cat bed', category: 'Cat Comfort', impressions: 142, clicks: 4, avgPosition: 17.9, ctr: 2.8, revenue: 560, conversionRate: 3.4, addToCartRate: 7.3, revenuePerSession: 1.45, matrix: 'priority' },
  ];
}

// ============= WEEKLY LOOP =============

export function generateWeeklyLoop(): WeeklyLoopAction[] {
  return [
    { id: 'w1', type: 'ranking_push', title: 'Push "best cat trees 2026" into Top 10', description: 'Add 3 internal links + FAQ schema expansion. Current: pos 12.3', target: '/guides/best-cat-trees-2026', impact: 'high', status: 'pending' },
    { id: 'w2', type: 'ranking_push', title: 'Boost "best dog bed 2026" CTR', description: 'A/B test title with "for Large Dogs" variant. Current: pos 15.7, CTR 2.5%', target: '/guides/best-dog-bed-2026', impact: 'high', status: 'pending' },
    { id: 'w3', type: 'ranking_push', title: 'Accelerate "cat litter box" rankings', description: 'Add comparison table + 2 FAQ entries. Current: pos 18.2', target: '/guides/best-cat-litter-box-2026', impact: 'medium', status: 'pending' },
    { id: 'w4', type: 'content_expansion', title: 'Create "Best Cat Trees for Small Apartments" guide', description: 'Missing subtopic with 890 monthly search volume. New page candidate.', target: 'Cat Trees cluster', impact: 'high', status: 'pending' },
    { id: 'w5', type: 'content_expansion', title: 'Create "Best Cooling Dog Beds for Summer" guide', description: 'Seasonal opportunity with 720 monthly search volume. Peak May–August.', target: 'Dog Beds cluster', impact: 'medium', status: 'pending' },
    { id: 'w6', type: 'authority_reinforcement', title: 'Add internal links to "indoor cat enrichment"', description: 'Only 2 inbound links. Add 4 contextual links from related cat guides.', target: '/guides/indoor-cat-enrichment', impact: 'high', status: 'pending' },
    { id: 'w7', type: 'authority_reinforcement', title: 'Repair orphan: "cat tree safety tips"', description: 'Zero inbound links detected. Add links from cornerstone + 2 product pages.', target: '/guides/cat-tree-safety-tips', impact: 'medium', status: 'pending' },
    { id: 'w8', type: 'revenue_optimization', title: 'Optimize "self-cleaning litter box" conversion', description: 'High traffic (312 imp) but 1.1% conversion. Improve CTA placement and add trust signals.', target: '/products/self-cleaning-litter-box', impact: 'high', status: 'pending' },
  ];
}

// ============= SUCCESS METRICS =============

export function generateSuccessMetrics(): SuccessMetric[] {
  return [
    { label: 'Organic Sessions', value: '412', trend: 'up', delta: '+18% WoW', color: 'green' },
    { label: 'Top 10 Keywords', value: 2, trend: 'stable', delta: '0 change', color: 'yellow' },
    { label: 'Indexed Pages', value: 34, trend: 'up', delta: '+6 this month', color: 'green' },
    { label: 'Crawl Efficiency', value: '68%', trend: 'up', delta: '+4% WoW', color: 'yellow' },
    { label: 'Organic Revenue', value: '$280', trend: 'up', delta: '+$42 WoW', color: 'green' },
    { label: 'Revenue/Session', value: '$0.68', trend: 'up', delta: '+$0.08', color: 'yellow' },
  ];
}

// ============= 12-MONTH PROJECTIONS =============

export function generate12MonthProjections(): MonthlyProjection[] {
  const projections: MonthlyProjection[] = [];
  for (let m = 1; m <= 12; m++) {
    const growth = Math.pow(1.35, m); // ~35% compound monthly growth
    projections.push({
      month: m,
      impressions: Math.round(3200 * growth),
      clicks: Math.round(89 * growth),
      organicSessions: Math.round(350 * growth * 0.85),
      top10Keywords: Math.min(30, Math.round(2 + m * 2.5)),
      indexedPages: Math.min(300, Math.round(34 + m * 22)),
      organicRevenue: Math.round(280 * growth * 0.9),
      revenuePerSession: Math.round((0.68 + m * 0.05) * 100) / 100,
      crawlEfficiency: Math.min(95, Math.round(68 + m * 2.2)),
    });
  }
  return projections;
}
