/**
 * ULTRA GROWTH TRINITY — Autonomous Growth Brain Config
 * 
 * Combines: Sprint Acceleration + AI Growth Brain + High-Margin Domination
 */

// ─── HIGH-MARGIN CATEGORY MAP ───────────────────────────
export const HIGH_MARGIN_CATEGORIES = [
  {
    id: 'orthopedic-beds',
    name: 'Orthopedic & Calming Dog Beds',
    avgMargin: 59,
    searchVolume: 12100,
    emotionalIntensity: 'very high',
    pillarSlug: '/collections/dog-beds',
    supportPages: 8,
    buyerGuides: 5,
    comparisonPages: 3,
    faqHub: '/guides/orthopedic-dog-bed-faq',
    internalLinkWeight: 3, // 3x normal
  },
  {
    id: 'dog-car-safety',
    name: 'Dog Car Safety & Travel',
    avgMargin: 62,
    searchVolume: 8100,
    emotionalIntensity: 'high',
    pillarSlug: '/collections/best-dog-car-seats',
    supportPages: 6,
    buyerGuides: 4,
    comparisonPages: 3,
    faqHub: '/guides/dog-car-seat-safety-faq',
    internalLinkWeight: 3,
  },
  {
    id: 'pet-grooming',
    name: 'Pet Grooming Vacuum Kits',
    avgMargin: 56,
    searchVolume: 6600,
    emotionalIntensity: 'medium-high',
    pillarSlug: '/collections/pet-grooming-vacuum-kits',
    supportPages: 5,
    buyerGuides: 3,
    comparisonPages: 2,
    faqHub: '/guides/pet-grooming-vacuum-guide',
    internalLinkWeight: 2.5,
  },
] as const;

// ─── WEEKLY AUTOMATION PLAN ─────────────────────────────
export const WEEKLY_AUTOMATION = {
  contentGeneration: {
    longTailBlogs: 10,
    collectionExpansions: 3,
    comparisonPages: 2,
    authorityPillars: 1,
    totalPagesPerWeek: 16,
  },
  selfHealing: {
    thinPageExpansion: true,
    orphanDetection: true,
    cannibalizationCheck: true,
    duplicateIntentMerge: true,
    weakLinkRepair: true,
  },
  prioritization: {
    formula: '(SearchVolume × Intent × Margin × ConversionProb) ÷ Competition',
    topPercentFocus: 20, // Focus on top 20% RPS
    lowValueAction: 'noindex-or-merge',
  },
  schedule: {
    monday: ['keyword-analysis', 'content-queue-generation'],
    tuesday: ['blog-publishing', 'internal-link-audit'],
    wednesday: ['collection-expansion', 'comparison-publishing'],
    thursday: ['pillar-creation', 'schema-validation'],
    friday: ['performance-review', 'rps-recalculation'],
    saturday: ['thin-page-expansion', 'orphan-repair'],
    sunday: ['sitemap-cleanup', 'cannibalization-scan'],
  },
};

// ─── 30-DAY SALES ACCELERATION PLAN ────────────────────
export const SALES_ACCELERATION_30DAY = {
  week1: {
    focus: 'Product page conversion hardening',
    actions: [
      'Deploy HeroProductBoost for all 10 sprint products',
      'Add FAQ schema to all sprint product pages',
      'Ensure trust blocks and shipping clarity visible',
      'Publish 5 high-intent blog posts for top 3 products',
    ],
  },
  week2: {
    focus: 'Internal link flood & content push',
    actions: [
      'Publish 10 blog posts linking to sprint products',
      'Add Trending Now strip sitewide',
      'Create 3 comparison pages for high-margin products',
      'Submit all new URLs to indexing',
    ],
  },
  week3: {
    focus: 'Authority building & cluster expansion',
    actions: [
      'Publish 3 "Best for" buyer guides',
      'Create 1 problem-solution pillar page',
      'Expand collection content to 500+ words',
      'Add FAQ hubs for top 3 categories',
    ],
  },
  week4: {
    focus: 'Optimization & scale',
    actions: [
      'Analyze CTR data, optimize underperforming titles',
      'Expand content on pages ranking 8-20',
      'Recalculate RPS and shift priorities',
      'Launch autonomous weekly generation loop',
    ],
  },
};

// ─── 90-DAY REVENUE PROJECTION ──────────────────────────
export const REVENUE_PROJECTION_90DAY = {
  month1: {
    estimatedTraffic: 2500,
    conversionRate: 0.018,
    aov: 52,
    projectedRevenue: 2340,
    newPages: 48,
    salesTarget: 10,
  },
  month2: {
    estimatedTraffic: 5500,
    conversionRate: 0.022,
    aov: 55,
    projectedRevenue: 6655,
    newPages: 64,
    salesTarget: 15,
  },
  month3: {
    estimatedTraffic: 9000,
    conversionRate: 0.025,
    aov: 58,
    projectedRevenue: 13050,
    newPages: 64,
    salesTarget: 30,
  },
  total90Day: {
    totalRevenue: 22045,
    totalNewPages: 176,
    totalSalesTarget: 55,
    organicTrafficGrowth: '260%',
    dominantCategories: ['orthopedic-beds', 'dog-car-safety', 'pet-grooming'],
  },
};
