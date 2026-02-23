/**
 * Growth Intelligence Engine
 * 
 * Data-driven revenue simulation, authority scoring, and 90-day execution planning.
 * All metrics are US-only, Google organic focus.
 */

// ============= REVENUE SIMULATION =============

export interface RevenueScenario {
  name: string;
  label: string;
  indexedPagesLift: number;    // e.g. 0.15 = +15%
  positionImprovement: number; // spots gained
  ctrLift: number;             // absolute % points
  description: string;
}

export interface RevenueSimulationResult {
  scenario: RevenueScenario;
  currentTraffic: number;
  projectedTraffic: number;
  trafficDelta: number;
  currentConversions: number;
  projectedConversions: number;
  conversionDelta: number;
  currentMonthlyRevenue: number;
  projectedMonthlyRevenue: number;
  monthlyRevenueDelta: number;
  sixMonthCumulativeLift: number;
  roiMultiple: number;
}

export const SCENARIOS: RevenueScenario[] = [
  {
    name: 'conservative',
    label: 'Conservative',
    indexedPagesLift: 0.15,
    positionImprovement: 3,
    ctrLift: 0.005,
    description: '+15% indexed pages, +3 position improvement, +0.5% CTR',
  },
  {
    name: 'aggressive',
    label: 'Aggressive',
    indexedPagesLift: 0.40,
    positionImprovement: 6,
    ctrLift: 0.012,
    description: '+40% indexed pages, +6 position improvement, +1.2% CTR',
  },
  {
    name: 'breakout',
    label: 'Authority Breakout',
    indexedPagesLift: 0.60,
    positionImprovement: 10,
    ctrLift: 0.025,
    description: 'Top 5 collections reach top 3, 2 pillars rank page 1, blog CTR 4.5%',
  },
];

// CTR curve by position (approximate Google organic CTR)
const CTR_BY_POSITION: Record<number, number> = {
  1: 0.276, 2: 0.154, 3: 0.109, 4: 0.073, 5: 0.053,
  6: 0.039, 7: 0.030, 8: 0.023, 9: 0.019, 10: 0.016,
  11: 0.012, 12: 0.010, 13: 0.009, 14: 0.008, 15: 0.007,
  16: 0.006, 17: 0.005, 18: 0.005, 19: 0.004, 20: 0.004,
};

function getCtrForPosition(pos: number): number {
  const rounded = Math.max(1, Math.min(20, Math.round(pos)));
  return CTR_BY_POSITION[rounded] || 0.004;
}

export interface BaselineMetrics {
  impressions: number;
  avgPosition: number;
  ctr: number;
  indexedPages: number;
  conversionRate: number;
  aov: number;
  monthlySeoCost: number;
}

export const DEFAULT_BASELINE: BaselineMetrics = {
  impressions: 8000,
  avgPosition: 28,
  ctr: 0.012,
  indexedPages: 316,
  conversionRate: 0.015,
  aov: 35,
  monthlySeoCost: 500,
};

export function simulateRevenue(
  baseline: BaselineMetrics,
  scenario: RevenueScenario,
): RevenueSimulationResult {
  const currentTraffic = Math.round(baseline.impressions * baseline.ctr);
  const currentConversions = Math.round(currentTraffic * baseline.conversionRate);
  const currentMonthlyRevenue = currentConversions * baseline.aov;

  // New position and its CTR
  const newPosition = Math.max(1, baseline.avgPosition - scenario.positionImprovement);
  const positionCtrBoost = getCtrForPosition(newPosition) - getCtrForPosition(baseline.avgPosition);

  // New impressions from more indexed pages
  const newImpressions = Math.round(baseline.impressions * (1 + scenario.indexedPagesLift));

  // New CTR combines position-based improvement + direct CTR lift
  const newCtr = Math.min(0.30, baseline.ctr + positionCtrBoost + scenario.ctrLift);

  const projectedTraffic = Math.round(newImpressions * newCtr);
  const projectedConversions = Math.round(projectedTraffic * baseline.conversionRate);
  const projectedMonthlyRevenue = projectedConversions * baseline.aov;

  const monthlyDelta = projectedMonthlyRevenue - currentMonthlyRevenue;
  // ROI = 6-month revenue lift / 6-month SEO cost
  const sixMonthCost = baseline.monthlySeoCost * 6;
  const sixMonthLift = monthlyDelta * 6;

  return {
    scenario,
    currentTraffic,
    projectedTraffic,
    trafficDelta: projectedTraffic - currentTraffic,
    currentConversions,
    projectedConversions,
    conversionDelta: projectedConversions - currentConversions,
    currentMonthlyRevenue,
    projectedMonthlyRevenue,
    monthlyRevenueDelta: monthlyDelta,
    sixMonthCumulativeLift: sixMonthLift,
    roiMultiple: sixMonthCost > 0 ? Math.round((sixMonthLift / sixMonthCost) * 10) / 10 : 0,
  };
}

// ============= AUTHORITY CLUSTER SCORING =============

export interface AuthorityCluster {
  name: string;
  namespace: 'dog' | 'cat' | 'small_pets';
  blogPosts: number;
  guides: number;
  collections: number;
  hasComparison: boolean;
  hasBest2026: boolean;
  hasBuyerGuide: boolean;
  pillarCoverage: number;     // 0–100
  keywordCoverage: number;    // 0–100
  internalLinkScore: number;  // 0–100
  authorityScore: number;     // 0–100
  gaps: string[];
}

export interface ClusterInput {
  name: string;
  namespace: 'dog' | 'cat' | 'small_pets';
  blogKeywords: string[];     // keywords to match against blog titles
  collectionSlugs: string[];  // slugs we expect
  requiredContent: string[];  // required content types
}

export const CLUSTER_DEFINITIONS: ClusterInput[] = [
  {
    name: 'Orthopedic Dog Beds',
    namespace: 'dog',
    blogKeywords: ['orthopedic', 'dog bed', 'memory foam', 'senior dog bed'],
    collectionSlugs: ['best-orthopedic-dog-beds', 'orthopedic-dog-beds', 'orthopedic-dog-bed-senior-dogs', 'orthopedic-dog-bed-under-100', 'best-orthopedic-dog-bed-large-dogs'],
    requiredContent: ['comparison', 'best-2026', 'buyer-guide', 'vs-post'],
  },
  {
    name: 'Dog Car Travel Safety',
    namespace: 'dog',
    blogKeywords: ['dog car', 'car seat', 'dog travel', 'crash tested', 'car safety'],
    collectionSlugs: ['best-dog-car-seats', 'crash-tested-dog-car-seat', 'dog-car-seat-for-small-dogs', 'dog-car-seat-anxious-dogs'],
    requiredContent: ['comparison', 'best-2026', 'buyer-guide'],
  },
  {
    name: 'Dog Anxiety Solutions',
    namespace: 'dog',
    blogKeywords: ['anxiety', 'calming', 'separation anxiety', 'anxious dog'],
    collectionSlugs: ['best-dog-toy-for-separation-anxiety', 'dog-car-seat-anxious-dogs'],
    requiredContent: ['comparison', 'best-2026', 'buyer-guide'],
  },
  {
    name: 'Dog Enrichment',
    namespace: 'dog',
    blogKeywords: ['enrichment', 'interactive', 'puzzle', 'dog toy'],
    collectionSlugs: ['best-interactive-dog-toys', 'best-dog-toys-for-puppies', 'indestructible-dog-toys-guide'],
    requiredContent: ['comparison', 'best-2026', 'buyer-guide'],
  },
  {
    name: 'Cat Trees (Large / Apartment)',
    namespace: 'cat',
    blogKeywords: ['cat tree', 'cat tower', 'cat condo', 'maine coon'],
    collectionSlugs: ['cat-tree-for-large-cats', 'best-cat-trees-for-small-apartments', 'best-cat-tree-maine-coon', 'cat-tree-for-two-cats', 'tall-cat-tree-big-cats'],
    requiredContent: ['comparison', 'best-2026', 'buyer-guide', 'vs-post'],
  },
  {
    name: 'Litter Box Guides',
    namespace: 'cat',
    blogKeywords: ['litter box', 'litter', 'self-cleaning', 'odor'],
    collectionSlugs: ['best-cat-litter-boxes', 'self-cleaning-litter-box-guide', 'best-litter-box-for-large-cats', 'best-litter-box-for-odor-control'],
    requiredContent: ['comparison', 'best-2026', 'buyer-guide'],
  },
  {
    name: 'Cat Furniture',
    namespace: 'cat',
    blogKeywords: ['cat furniture', 'cat bed', 'cat shelf', 'cat perch', 'cat scratching'],
    collectionSlugs: ['best-cat-beds', 'best-cat-scratching-posts', 'best-cat-window-perches', 'cat-condos'],
    requiredContent: ['comparison', 'best-2026', 'buyer-guide'],
  },
  {
    name: 'Cat Behavior & Toys',
    namespace: 'cat',
    blogKeywords: ['cat toy', 'cat behavior', 'bored cat', 'indoor cat'],
    collectionSlugs: ['best-cat-toys-for-indoor-cats', 'best-cat-toys-for-bored-cats', 'best-interactive-cat-toys'],
    requiredContent: ['comparison', 'best-2026', 'buyer-guide'],
  },
];

export function scoreCluster(
  def: ClusterInput,
  blogPosts: { slug: string; title: string; category: string }[],
  collections: { slug: string; name: string }[],
): AuthorityCluster {
  // Count matching blog posts
  const matchingBlogs = blogPosts.filter(p => {
    const lowerTitle = (p.title || '').toLowerCase();
    return def.blogKeywords.some(kw => lowerTitle.includes(kw.toLowerCase()));
  });

  // Count matching collections
  const matchingCollections = collections.filter(c =>
    def.collectionSlugs.includes(c.slug)
  );

  const gaps: string[] = [];

  // Check required content types
  const hasComparison = matchingBlogs.some(b =>
    b.title?.toLowerCase().includes('vs') || b.title?.toLowerCase().includes('comparison')
  );
  const hasBest2026 = matchingBlogs.some(b =>
    b.title?.toLowerCase().includes('best') && b.title?.includes('2026')
  ) || matchingCollections.some(c => c.name.includes('2026'));
  const hasBuyerGuide = matchingBlogs.some(b =>
    b.title?.toLowerCase().includes('guide') || b.title?.toLowerCase().includes('buying')
  );

  if (!hasComparison) gaps.push('Missing comparison page');
  if (!hasBest2026) gaps.push('Missing "Best 2026" content');
  if (!hasBuyerGuide) gaps.push('Missing buyer guide');

  // Collection coverage
  const collectionCoverage = (matchingCollections.length / Math.max(def.collectionSlugs.length, 1)) * 100;
  if (collectionCoverage < 60) gaps.push(`Low collection coverage (${Math.round(collectionCoverage)}%)`);

  // Blog depth
  if (matchingBlogs.length < 5) gaps.push(`Only ${matchingBlogs.length} supporting blog posts`);

  // Calculate scores
  const blogScore = Math.min(100, (matchingBlogs.length / 10) * 100);
  const collScore = Math.min(100, collectionCoverage);
  const contentTypeScore = [hasComparison, hasBest2026, hasBuyerGuide].filter(Boolean).length / 3 * 100;
  const internalLinkScore = Math.min(100, (matchingBlogs.length * 3 + matchingCollections.length * 15));

  const authorityScore = Math.round(
    blogScore * 0.30 + collScore * 0.25 + contentTypeScore * 0.25 + internalLinkScore * 0.20
  );

  return {
    name: def.name,
    namespace: def.namespace,
    blogPosts: matchingBlogs.length,
    guides: matchingBlogs.filter(b => b.title?.toLowerCase().includes('guide')).length,
    collections: matchingCollections.length,
    hasComparison,
    hasBest2026,
    hasBuyerGuide,
    pillarCoverage: Math.round(collectionCoverage),
    keywordCoverage: Math.round(blogScore),
    internalLinkScore: Math.round(internalLinkScore),
    authorityScore,
    gaps,
  };
}

// ============= 90-DAY EXECUTION PLAN =============

export interface ExecutionWeek {
  week: number;
  phase: 'Optimize' | 'Publish' | 'Authority';
  tasks: string[];
  kpis: string[];
}

export function generate90DayPlan(): ExecutionWeek[] {
  return [
    // PHASE 1: Days 1-30 (Weeks 1-4)
    {
      week: 1,
      phase: 'Optimize',
      tasks: [
        'Audit & rewrite titles for top 10 traffic pages (CTR focus)',
        'Add FAQ schema to 5 highest-impression collections',
        'Fix any CWV issues on revenue pages (LCP < 2.5s)',
      ],
      kpis: ['Title CTR improvement tracked in GSC', 'FAQ rich results appearing'],
    },
    {
      week: 2,
      phase: 'Optimize',
      tasks: [
        'Rewrite titles for next 10 traffic pages',
        'Add comparison tables to top 5 commercial collections',
        'Add 3+ internal links to each optimized page',
      ],
      kpis: ['20 pages optimized total', 'Comparison table engagement'],
    },
    {
      week: 3,
      phase: 'Optimize',
      tasks: [
        'Deploy structured data (BreadcrumbList, Product) on all collections',
        'Audit and fix canonical tags across all indexed pages',
        'Ping Google with updated sitemaps',
      ],
      kpis: ['0 canonical errors in GSC', 'Rich results validation'],
    },
    {
      week: 4,
      phase: 'Optimize',
      tasks: [
        'Review Phase 1 GSC data (impressions, CTR delta)',
        'Identify underperforming pages for Phase 2 content',
        'Baseline snapshot of all KPIs for comparison',
      ],
      kpis: ['Phase 1 CTR delta measured', 'Content gap list finalized'],
    },
    // PHASE 2: Days 31-60 (Weeks 5-8)
    {
      week: 5,
      phase: 'Publish',
      tasks: [
        'Publish 3 buyer guides targeting "best [product] 2026"',
        'Publish 3 comparison posts "[product] vs [product]"',
        'Auto-link all new posts to pillar pages',
      ],
      kpis: ['6 new posts indexed', 'Internal links verified'],
    },
    {
      week: 6,
      phase: 'Publish',
      tasks: [
        'Publish 3 problem-solving posts ("for small apartments", "under $100")',
        'Publish 3 more buyer guides for secondary clusters',
        'Update sitemaps with fresh lastmod',
      ],
      kpis: ['12 total new posts', 'Sitemap submission confirmed'],
    },
    {
      week: 7,
      phase: 'Publish',
      tasks: [
        'Publish 3 comparison posts for cat clusters',
        'Publish 3 problem-solving posts for dog clusters',
        'Build internal link network between all new content',
      ],
      kpis: ['18 total new posts', 'Link density score improved'],
    },
    {
      week: 8,
      phase: 'Publish',
      tasks: [
        'Publish final 6 posts (mix of guides + comparisons)',
        'Review Phase 2 indexing status',
        'Measure traffic delta from new content',
      ],
      kpis: ['24 total new posts published', 'Indexing rate > 80%'],
    },
    // PHASE 3: Days 61-90 (Weeks 9-12)
    {
      week: 9,
      phase: 'Authority',
      tasks: [
        'Publish 3 authority articles on Medium (parasite SEO)',
        'Create 5 Pinterest pins linking to top collections',
        'Begin refreshing 10 older blog posts with 2026 updates',
      ],
      kpis: ['External links acquired', 'Pinterest impressions'],
    },
    {
      week: 10,
      phase: 'Authority',
      tasks: [
        'Refresh 10 more blog posts (year references, new data)',
        'Add 2+ internal links to each refreshed post',
        'Submit refreshed URLs for re-indexing',
      ],
      kpis: ['20 posts refreshed', 'Re-indexing requests submitted'],
    },
    {
      week: 11,
      phase: 'Authority',
      tasks: [
        'Refresh final 10 blog posts',
        'Publish 2 more Medium articles',
        'Create Reddit value-first posts in pet subreddits',
      ],
      kpis: ['30 total posts refreshed', 'Reddit engagement tracked'],
    },
    {
      week: 12,
      phase: 'Authority',
      tasks: [
        'Full 90-day performance review',
        'Generate revenue impact report',
        'Plan next quarter based on ROI data',
      ],
      kpis: ['Traffic growth vs baseline', 'Revenue lift measured', 'Top keyword movements'],
    },
  ];
}

// ============= BREAKOUT KEYWORDS =============

export interface BreakoutKeyword {
  keyword: string;
  estimatedVolume: number;
  currentPosition: number | null;
  targetPosition: number;
  intent: 'commercial' | 'informational' | 'comparison';
  cluster: string;
  potentialTraffic: number;
}

export const BREAKOUT_KEYWORDS: BreakoutKeyword[] = [
  { keyword: 'best orthopedic dog bed 2026', estimatedVolume: 2400, currentPosition: 18, targetPosition: 5, intent: 'commercial', cluster: 'Orthopedic Dog Beds', potentialTraffic: 127 },
  { keyword: 'cat tree for large cats', estimatedVolume: 3600, currentPosition: 22, targetPosition: 5, intent: 'commercial', cluster: 'Cat Trees', potentialTraffic: 191 },
  { keyword: 'crash tested dog car seat', estimatedVolume: 1900, currentPosition: 15, targetPosition: 3, intent: 'commercial', cluster: 'Dog Car Travel', potentialTraffic: 207 },
  { keyword: 'best cat litter box 2026', estimatedVolume: 2800, currentPosition: 25, targetPosition: 7, intent: 'commercial', cluster: 'Litter Boxes', potentialTraffic: 84 },
  { keyword: 'orthopedic dog bed for arthritis', estimatedVolume: 1600, currentPosition: 12, targetPosition: 3, intent: 'commercial', cluster: 'Orthopedic Dog Beds', potentialTraffic: 174 },
  { keyword: 'self cleaning litter box pros cons', estimatedVolume: 2100, currentPosition: null, targetPosition: 5, intent: 'informational', cluster: 'Litter Boxes', potentialTraffic: 111 },
  { keyword: 'dog bed vs crate pad', estimatedVolume: 1400, currentPosition: null, targetPosition: 5, intent: 'comparison', cluster: 'Orthopedic Dog Beds', potentialTraffic: 74 },
  { keyword: 'best interactive dog toys', estimatedVolume: 3200, currentPosition: 20, targetPosition: 5, intent: 'commercial', cluster: 'Dog Enrichment', potentialTraffic: 170 },
  { keyword: 'cat tree for maine coon', estimatedVolume: 2900, currentPosition: 14, targetPosition: 3, intent: 'commercial', cluster: 'Cat Trees', potentialTraffic: 316 },
  { keyword: 'indestructible dog toys for aggressive chewers', estimatedVolume: 4100, currentPosition: 19, targetPosition: 5, intent: 'commercial', cluster: 'Dog Enrichment', potentialTraffic: 217 },
];
