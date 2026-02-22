/**
 * Multi-Cluster Revenue Impact Simulation Engine
 * 
 * Projects revenue across 3 primary clusters with conservative/moderate/aggressive scenarios.
 * US-only, Google organic. Excludes NL, direct, test, non-US.
 */

export interface ClusterProfile {
  id: string;
  name: string;
  primaryKeywords: { keyword: string; monthlyVolume: number }[];
  aov: number;
  currentPosition: number;
  pillarUrl: string;
}

export interface ScenarioParams {
  ctr: number;
  cvr: number;
  label: string;
}

export interface ClusterProjection {
  cluster: ClusterProfile;
  scenario: string;
  totalMonthlySearchVolume: number;
  estimatedClicks: number;
  estimatedOrders: number;
  estimatedRevenue: number;
  month1Revenue: number;
  month2Revenue: number;
  month3Revenue: number;
  ninetyDayTotal: number;
}

export interface CompetitorProfile {
  domain: string;
  estimatedDA: number;
  contentDepth: 'thin' | 'moderate' | 'deep';
  internalLinkStrength: 'weak' | 'moderate' | 'strong';
  structuredData: boolean;
  faqPresence: boolean;
  comparisonTables: boolean;
  commercialIntentGap: 'low' | 'medium' | 'high';
}

export interface CompetitorAttackPlan {
  cluster: string;
  competitors: CompetitorProfile[];
  weaknesses: string[];
  attackOpportunities: string[];
  quickWinKeywords: string[];
  longTailKeywords: string[];
  authorityGapKeywords: string[];
}

// ─── CLUSTER PROFILES ────────────────────────────────────
export const CLUSTER_PROFILES: ClusterProfile[] = [
  {
    id: 'orthopedic-dog-beds',
    name: 'Orthopedic Dog Beds',
    primaryKeywords: [
      { keyword: 'orthopedic dog bed', monthlyVolume: 22200 },
      { keyword: 'best orthopedic dog bed', monthlyVolume: 8100 },
      { keyword: 'orthopedic dog bed large dogs', monthlyVolume: 4400 },
      { keyword: 'memory foam dog bed', monthlyVolume: 12100 },
      { keyword: 'orthopedic dog bed for senior dogs', monthlyVolume: 2900 },
      { keyword: 'dog bed for hip dysplasia', monthlyVolume: 1900 },
      { keyword: 'best dog bed for arthritis', monthlyVolume: 2400 },
      { keyword: 'waterproof orthopedic dog bed', monthlyVolume: 1600 },
      { keyword: 'cooling orthopedic dog bed', monthlyVolume: 1300 },
      { keyword: 'washable orthopedic dog bed', monthlyVolume: 1100 },
    ],
    aov: 68,
    currentPosition: 28,
    pillarUrl: '/collections/orthopedic-dog-beds',
  },
  {
    id: 'cat-trees-large-cats',
    name: 'Cat Trees for Large Cats',
    primaryKeywords: [
      { keyword: 'cat tree for large cats', monthlyVolume: 14800 },
      { keyword: 'extra large cat tree', monthlyVolume: 6600 },
      { keyword: 'cat tree for big cats', monthlyVolume: 3600 },
      { keyword: 'heavy duty cat tree', monthlyVolume: 4400 },
      { keyword: 'cat tree for maine coon', monthlyVolume: 5400 },
      { keyword: 'tall cat tree', monthlyVolume: 3200 },
      { keyword: 'sturdy cat tree', monthlyVolume: 2100 },
      { keyword: 'cat tree for fat cats', monthlyVolume: 1800 },
      { keyword: 'best cat tree for multiple cats', monthlyVolume: 2900 },
      { keyword: 'cat tower for large cats', monthlyVolume: 1600 },
    ],
    aov: 112,
    currentPosition: 35,
    pillarUrl: '/collections/cat-trees-for-large-cats',
  },
  {
    id: 'dog-car-travel-safety',
    name: 'Dog Car Travel Safety',
    primaryKeywords: [
      { keyword: 'dog car seat', monthlyVolume: 18100 },
      { keyword: 'dog car harness', monthlyVolume: 6600 },
      { keyword: 'dog booster seat', monthlyVolume: 4400 },
      { keyword: 'crash tested dog car seat', monthlyVolume: 2900 },
      { keyword: 'dog seat belt', monthlyVolume: 5400 },
      { keyword: 'dog car travel safety', monthlyVolume: 1300 },
      { keyword: 'dog car seat for large dogs', monthlyVolume: 3600 },
      { keyword: 'best dog car seat', monthlyVolume: 4400 },
      { keyword: 'dog car seat cover', monthlyVolume: 3200 },
      { keyword: 'puppy car seat', monthlyVolume: 2400 },
    ],
    aov: 54,
    currentPosition: 32,
    pillarUrl: '/collections/dog-car-travel-safety',
  },
];

// ─── SCENARIO DEFINITIONS ────────────────────────────────
export const SCENARIOS: ScenarioParams[] = [
  { label: 'Conservative', ctr: 0.08, cvr: 0.015 },
  { label: 'Moderate',     ctr: 0.12, cvr: 0.025 },
  { label: 'Aggressive',   ctr: 0.18, cvr: 0.040 },
];

// ─── 90-DAY RAMP CURVE ──────────────────────────────────
const RAMP_CURVE = { month1: 0.20, month2: 0.55, month3: 1.0 };

export function projectClusterRevenue(
  cluster: ClusterProfile,
  scenario: ScenarioParams,
): ClusterProjection {
  const totalVolume = cluster.primaryKeywords.reduce((s, k) => s + k.monthlyVolume, 0);
  const clicks = Math.round(totalVolume * scenario.ctr);
  const orders = Math.round(clicks * scenario.cvr);
  const revenue = orders * cluster.aov;

  return {
    cluster,
    scenario: scenario.label,
    totalMonthlySearchVolume: totalVolume,
    estimatedClicks: clicks,
    estimatedOrders: orders,
    estimatedRevenue: revenue,
    month1Revenue: Math.round(revenue * RAMP_CURVE.month1),
    month2Revenue: Math.round(revenue * RAMP_CURVE.month2),
    month3Revenue: Math.round(revenue * RAMP_CURVE.month3),
    ninetyDayTotal: Math.round(revenue * (RAMP_CURVE.month1 + RAMP_CURVE.month2 + RAMP_CURVE.month3)),
  };
}

// ─── COMPETITOR ATTACK MODEL ────────────────────────────
export const COMPETITOR_DATA: Record<string, CompetitorAttackPlan> = {
  'orthopedic-dog-beds': {
    cluster: 'Orthopedic Dog Beds',
    competitors: [
      { domain: 'bigbarker.com', estimatedDA: 42, contentDepth: 'deep', internalLinkStrength: 'strong', structuredData: true, faqPresence: true, comparisonTables: true, commercialIntentGap: 'low' },
      { domain: 'furhaven.com', estimatedDA: 38, contentDepth: 'moderate', internalLinkStrength: 'moderate', structuredData: true, faqPresence: false, comparisonTables: false, commercialIntentGap: 'medium' },
      { domain: 'petfusion.com', estimatedDA: 35, contentDepth: 'moderate', internalLinkStrength: 'weak', structuredData: false, faqPresence: false, comparisonTables: false, commercialIntentGap: 'high' },
      { domain: 'k9ofmine.com', estimatedDA: 52, contentDepth: 'deep', internalLinkStrength: 'strong', structuredData: true, faqPresence: true, comparisonTables: true, commercialIntentGap: 'low' },
      { domain: 'doglab.com', estimatedDA: 45, contentDepth: 'deep', internalLinkStrength: 'moderate', structuredData: false, faqPresence: true, comparisonTables: true, commercialIntentGap: 'medium' },
    ],
    weaknesses: [
      'PetFusion and FurHaven lack FAQ schema and comparison tables',
      'Only BigBarker and K9OfMine have deep structured data',
      'No competitor has cooling + waterproof sub-intent pages',
      'Most competitors lack cluster-to-pillar internal linking',
    ],
    attackOpportunities: [
      'Win FAQ rich results on 6+ high-volume queries',
      'Dominate "best orthopedic dog bed for [use case]" long-tail cluster',
      'Create 8+ comparison pages competitors don\'t have',
      'Deeper merchant feed optimization than any competitor',
    ],
    quickWinKeywords: [
      'orthopedic dog bed for senior dogs',
      'cooling orthopedic dog bed',
      'washable orthopedic dog bed',
      'dog bed for hip dysplasia',
      'waterproof memory foam dog bed',
    ],
    longTailKeywords: [
      'best orthopedic dog bed for german shepherd',
      'orthopedic dog bed with bolsters',
      'dog bed for post surgery recovery',
      'thick memory foam dog bed large breed',
      'vet recommended orthopedic dog bed',
    ],
    authorityGapKeywords: [
      'orthopedic vs memory foam dog bed',
      'how thick should a dog bed be',
      'do dogs need orthopedic beds',
      'signs your dog needs joint support',
    ],
  },
  'cat-trees-large-cats': {
    cluster: 'Cat Trees for Large Cats',
    competitors: [
      { domain: 'chewy.com', estimatedDA: 78, contentDepth: 'thin', internalLinkStrength: 'strong', structuredData: true, faqPresence: false, comparisonTables: false, commercialIntentGap: 'medium' },
      { domain: 'catit.com', estimatedDA: 42, contentDepth: 'moderate', internalLinkStrength: 'moderate', structuredData: true, faqPresence: false, comparisonTables: false, commercialIntentGap: 'high' },
      { domain: 'armarkat.com', estimatedDA: 35, contentDepth: 'thin', internalLinkStrength: 'weak', structuredData: false, faqPresence: false, comparisonTables: false, commercialIntentGap: 'high' },
      { domain: 'thecatsite.com', estimatedDA: 55, contentDepth: 'deep', internalLinkStrength: 'moderate', structuredData: false, faqPresence: true, comparisonTables: false, commercialIntentGap: 'low' },
      { domain: 'cattreeking.com', estimatedDA: 28, contentDepth: 'moderate', internalLinkStrength: 'weak', structuredData: false, faqPresence: false, comparisonTables: true, commercialIntentGap: 'high' },
    ],
    weaknesses: [
      'Chewy has high DA but thin category content — no buying guides',
      'No competitor has dedicated breed-specific cat tree pages',
      'Most lack FAQ schema and structured comparison data',
      'Armarkat and CatTreeKing have weak internal linking',
    ],
    attackOpportunities: [
      'Create breed-specific authority pages (Maine Coon, Ragdoll, Norwegian Forest Cat)',
      'Win FAQ rich results — no competitor owns this space',
      'Build comparison tables Chewy doesn\'t have',
      'Deeper weight-capacity and stability buyer guides',
    ],
    quickWinKeywords: [
      'cat tree for maine coon',
      'heavy duty cat tree 25 lbs',
      'extra large cat tree with hammock',
      'best cat tree for multiple large cats',
      'cat tree for fat cats',
    ],
    longTailKeywords: [
      'cat tree that holds 30 lb cat',
      'floor to ceiling cat tree for large cats',
      'cat tree with wide platforms for big cats',
      'sturdy cat tree that won\'t tip over',
      'best cat tree for ragdoll cat',
    ],
    authorityGapKeywords: [
      'how much weight can a cat tree hold',
      'best cat tree material for large cats',
      'do large cats need special cat trees',
      'cat tree size guide by breed',
    ],
  },
  'dog-car-travel-safety': {
    cluster: 'Dog Car Travel Safety',
    competitors: [
      { domain: 'sleepypod.com', estimatedDA: 45, contentDepth: 'deep', internalLinkStrength: 'moderate', structuredData: true, faqPresence: true, comparisonTables: false, commercialIntentGap: 'low' },
      { domain: 'kurgo.com', estimatedDA: 48, contentDepth: 'moderate', internalLinkStrength: 'strong', structuredData: true, faqPresence: false, comparisonTables: false, commercialIntentGap: 'low' },
      { domain: 'centerforpetsafety.org', estimatedDA: 52, contentDepth: 'deep', internalLinkStrength: 'moderate', structuredData: false, faqPresence: true, comparisonTables: true, commercialIntentGap: 'high' },
      { domain: 'petgearinc.com', estimatedDA: 30, contentDepth: 'thin', internalLinkStrength: 'weak', structuredData: false, faqPresence: false, comparisonTables: false, commercialIntentGap: 'high' },
      { domain: 'wirecutter.com', estimatedDA: 92, contentDepth: 'deep', internalLinkStrength: 'strong', structuredData: true, faqPresence: false, comparisonTables: true, commercialIntentGap: 'low' },
    ],
    weaknesses: [
      'CenterForPetSafety has authority but no commercial conversion architecture',
      'PetGearInc has thin content and no structured data',
      'Kurgo lacks FAQ schema on product pages',
      'No competitor has dedicated size-by-breed car seat guides',
    ],
    attackOpportunities: [
      'Build "crash test results" comparison content CPS doesn\'t monetize',
      'Create breed-specific car seat recommendation pages',
      'Win FAQ rich results on safety-intent queries',
      'Deeper conversion architecture than Sleepypod or Kurgo',
    ],
    quickWinKeywords: [
      'dog car harness crash tested',
      'dog booster seat for small dogs',
      'dog car seat for large dogs',
      'best dog seat belt',
      'puppy car seat',
    ],
    longTailKeywords: [
      'crash tested dog car seat for golden retriever',
      'dog car seat that attaches to headrest',
      'dog car travel anxiety solutions',
      'best dog car seat for long road trips',
      'dog car seat vs dog harness which is safer',
    ],
    authorityGapKeywords: [
      'are dog car seats safe',
      'dog car seat laws by state',
      'how to secure dog in car properly',
      'dog car seat vs crate for travel',
    ],
  },
};

// ─── MARKET SHARE SIMULATION ────────────────────────────
export interface MarketShareSimulation {
  keywordsTop3: number;
  keywordsTop10: number;
  ctrImprovement: number;
  cvrImprovement: number;
  currentMonthlyRevenue: number;
  projectedMonthlyRevenue: number;
  revenueGrowthPct: number;
  organicTrafficGrowthPct: number;
  marketShareShift: string;
  scalingRecommendation: string;
}

export function simulateMarketShare(): MarketShareSimulation {
  const totalVolume = CLUSTER_PROFILES.reduce(
    (s, c) => s + c.primaryKeywords.reduce((ss, k) => ss + k.monthlyVolume, 0), 0
  );
  
  const currentCtr = 0.012;
  const currentCvr = 0.015;
  const avgAov = CLUSTER_PROFILES.reduce((s, c) => s + c.aov, 0) / CLUSTER_PROFILES.length;
  
  const currentClicks = Math.round(totalVolume * currentCtr);
  const currentOrders = Math.round(currentClicks * currentCvr);
  const currentRevenue = currentOrders * avgAov;
  
  const projectedCtr = currentCtr + 0.12;
  const projectedCvr = currentCvr + 0.01;
  const projectedClicks = Math.round(totalVolume * projectedCtr);
  const projectedOrders = Math.round(projectedClicks * projectedCvr);
  const projectedRevenue = projectedOrders * avgAov;
  
  const revenueGrowth = currentRevenue > 0 ? ((projectedRevenue - currentRevenue) / currentRevenue) * 100 : 0;
  const trafficGrowth = currentClicks > 0 ? ((projectedClicks - currentClicks) / currentClicks) * 100 : 0;

  return {
    keywordsTop3: 15,
    keywordsTop10: 30,
    ctrImprovement: 12,
    cvrImprovement: 1,
    currentMonthlyRevenue: currentRevenue,
    projectedMonthlyRevenue: projectedRevenue,
    revenueGrowthPct: Math.round(revenueGrowth),
    organicTrafficGrowthPct: Math.round(trafficGrowth),
    marketShareShift: `${Math.round(trafficGrowth / 10)}% estimated US organic market capture across 3 clusters`,
    scalingRecommendation: projectedRevenue > 50000
      ? 'Scale aggressively — add 2 new clusters per quarter, invest in backlink outreach'
      : projectedRevenue > 20000
      ? 'Continue expansion — prioritize content velocity and internal link density'
      : 'Foundation phase — focus on indexing, crawl health, and core cluster authority',
  };
}

// ─── 90-DAY ROADMAP ─────────────────────────────────────
export const NINETY_DAY_ROADMAP = {
  month1: {
    title: 'Foundation',
    focus: 'Publish core authority assets and implement technical SEO infrastructure',
    tasks: [
      'Publish 3 authority pillar pages (orthopedic beds, cat trees, dog car safety)',
      'Publish 9 sub-intent landing pages across all 3 clusters',
      'Publish 12 blog support articles with pillar linking',
      'Implement internal link weaponization (pillar ↔ sub-intent ↔ blog)',
      'Optimize merchant feed titles for all 3 clusters',
      'Deploy FAQ, Product, BreadcrumbList, and CollectionPage schema',
      'Submit all new URLs to Google Search Console',
    ],
    kpis: { indexedPages: 25, keywordsTop20: 15, keywordsTop10: 3, organicClicks: 500 },
  },
  month2: {
    title: 'Authority Expansion',
    focus: 'Deepen content clusters and expand SERP feature coverage',
    tasks: [
      'Publish 15 additional support articles (5 per cluster)',
      'Create 6 comparison landing pages (2 per cluster)',
      'Add FAQ expansion blocks to all pillar and sub-intent pages',
      'Implement dynamic related-content engine across clusters',
      'Launch review acquisition campaign for top 10 products',
      'Create 3 "Best Under $X" price-based landing pages',
      'Build breed-specific recommendation pages',
    ],
    kpis: { indexedPages: 55, keywordsTop20: 35, keywordsTop10: 12, organicClicks: 2000 },
  },
  month3: {
    title: 'Market Capture',
    focus: 'Aggressive long-tail expansion and ranking acceleration',
    tasks: [
      'Add 20 long-tail micro landing pages targeting position 8–20 keywords',
      'Create use-case landing pages (post-surgery, road trips, multi-cat homes)',
      'Activate ranking push builder for strike-zone keywords',
      'Launch backlink outreach to pet bloggers and veterinary sites',
      'Publish annual "US Pet Product Report" link magnet',
      'Deploy exit-intent offers on all pillar pages',
      'Recalculate RPS and shift priorities based on 60-day data',
    ],
    kpis: { indexedPages: 80, keywordsTop20: 60, keywordsTop10: 25, organicClicks: 5000 },
  },
};
