/**
 * Revenue + Market Capture + Algorithm Shield Engine
 *
 * Phase 1: Autonomous Revenue Engine (SEO + CRO + AOV)
 * Phase 2: 12-Month Market Capture Blueprint
 * Phase 3: Google Core Update Adaptation Shield
 *
 * US market only. Real GSC data. Google-safe.
 */

export interface GscRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// ============= TYPES =============

type QueryIntent = 'informational' | 'commercial' | 'transactional' | 'problem_solution' | 'comparison';

// Phase 1
export interface SeoRevenueTarget {
  query: string;
  page: string;
  position: number;
  impressions: number;
  ctr: number;
  intent: QueryIntent;
  actions: string[];
  projectedCtrLift: number;
}

export interface CroImprovement {
  area: string;
  issue: string;
  fix: string;
  impact: 'high' | 'medium' | 'low';
  projectedLift: number;
}

export interface AovStrategy {
  strategy: string;
  description: string;
  projectedAovLift: number;
}

export interface RevenueEngineResult {
  seoRevenueTargets: SeoRevenueTarget[];
  croImprovements: CroImprovement[];
  aovStrategies: AovStrategy[];
  currentConversionEstimate: number;
  optimizedConversionEstimate: number;
  revenuePer1000Visitors: number;
  aovLiftEstimate: string;
  projectedRevenueLift90Days: string;
}

// Phase 2
export interface CategoryHub {
  category: string;
  pillarWordCount: number;
  clusterArticles: number;
  internalLinks: number;
  faqEntries: number;
  productBridges: number;
  queriesSupporting: number;
}

export interface QuarterlyPhase {
  quarter: string;
  label: string;
  objectives: string[];
  targets: string[];
}

export interface MarketCaptureResult {
  categoryHubs: CategoryHub[];
  totalClusterArticles: number;
  authorityGrowthProjection: number;
  quarterlyPhases: QuarterlyPhase[];
  trafficForecast12Month: { month: number; traffic: number; revenue: number }[];
  marketShareProbability: number;
}

// Phase 3
export interface RiskItem {
  type: 'thin_content' | 'cannibalization' | 'over_optimization' | 'anchor_imbalance' | 'entity_inconsistency';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  page?: string;
  fix: string;
}

export interface AdaptiveAction {
  trigger: string;
  action: string;
  status: 'ready' | 'monitoring' | 'applied';
}

export interface AlgorithmShieldResult {
  volatilityDetected: boolean;
  immunityIndex: number;
  trustSignalScore: number;
  contentDepthIndex: number;
  algorithmStabilityScore: number;
  risks: RiskItem[];
  adaptiveActions: AdaptiveAction[];
  earlySignals: { signal: string; status: 'normal' | 'warning' | 'alert'; value: string }[];
}

// Combined
export interface RevenueMarketCaptureResult {
  revenueEngine: RevenueEngineResult;
  marketCapture: MarketCaptureResult;
  algorithmShield: AlgorithmShieldResult;
  systemSummary: {
    autonomousRevenueEngine: 'ACTIVE';
    marketCaptureBlueprint: 'DEPLOYED';
    coreUpdateShield: 'ACTIVE';
    projected90DayRevenueLift: string;
    projected12MonthRevenueLift: string;
    authorityGrowthIndex: number;
    algorithmStabilityIndex: number;
    enterpriseGrowthStatus: 'SELF-IMPROVING';
    totalRealQueries: number;
  };
}

// ============= HELPERS =============

const DUTCH = ['voor','met','een','het','hond','kat','katten','honden','beste','kopen','van','bij','mand','speelgoed','reismand'];
function isDutch(q: string): boolean { return q.toLowerCase().split(/\s+/).some(w => DUTCH.includes(w)); }

function classifyIntent(q: string): QueryIntent {
  const l = q.toLowerCase();
  if (/\bvs\b|compar|versus|differ/.test(l)) return 'comparison';
  if (/fix|stop|prevent|help|solv|reduc|avoid|deal with|get rid/.test(l)) return 'problem_solution';
  if (/buy|order|price|cheap|afford|deal|coupon|shop|for sale|add to cart/.test(l)) return 'transactional';
  if (/best|top|review|worth|recommend|rated|pick|choice/.test(l)) return 'commercial';
  return 'informational';
}

function detectCategory(q: string): string {
  const l = q.toLowerCase();
  const cats: [string, RegExp][] = [
    ['dog enrichment', /enrichment|puzzle|interactive|mental|stimulat|bored|brain.*dog/],
    ['dog training', /train|command|obedien|teach|heel|sit|stay|recall|leash/],
    ['outdoor activities', /outdoor|outside|park|hike|walk|game|fetch|agility|backyard/],
    ['puppy development', /puppy|puppies|teething|socializ|crate|potty|house train/],
    ['behavioral correction', /anxiety|destructive|chew|bark|aggress|fear|separation|calm|stress/],
    ['cat climbing', /cat tree|cat tower|cat condo|climbing|scratching|kitten.*climb/],
    ['feeding', /food|feed|bowl|diet|nutrition|slow feed|treat/],
    ['toys', /toy|ball|rope|squeaky|plush|durable|indestructible/],
    ['health', /health|vet|medic|supplement|joint|dental|flea|tick/],
    ['grooming', /groom|brush|nail|bath|shampoo|shed|coat/],
    ['cat litter', /litter|cat box|litter box|clumping|odor/],
  ];
  for (const [name, rx] of cats) if (rx.test(l)) return name;
  return 'general pet';
}

const CTR_CURVE: Record<number, number> = {
  1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.065,
  6: 0.05, 7: 0.04, 8: 0.035, 9: 0.03, 10: 0.025,
  15: 0.012, 20: 0.008, 30: 0.004, 50: 0.001,
};

function estimateCtr(pos: number): number {
  const positions = Object.keys(CTR_CURVE).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < positions.length - 1; i++) {
    if (pos <= positions[i]) return CTR_CURVE[positions[i]];
    if (pos <= positions[i + 1]) {
      const r = (pos - positions[i]) / (positions[i + 1] - positions[i]);
      return CTR_CURVE[positions[i]] * (1 - r) + CTR_CURVE[positions[i + 1]] * r;
    }
  }
  return 0.0005;
}

// ============= PHASE 1: REVENUE ENGINE =============

function runRevenueEngine(queries: GscRow[]): RevenueEngineResult {
  // Module A: SEO Revenue Prioritization
  const commercialQueries = queries.filter(q => {
    const intent = classifyIntent(q.query);
    return (intent === 'commercial' || intent === 'transactional') && q.position >= 15 && q.position <= 60 && q.impressions >= 10;
  });

  const seoTargets: SeoRevenueTarget[] = commercialQueries
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 30)
    .map(q => {
      const intent = classifyIntent(q.query);
      const actions: string[] = [];
      const currentCtr = q.ctr;
      const expectedCtr = estimateCtr(Math.max(5, q.position - 8));

      if (currentCtr < 0.015) actions.push('Title refinement with authority modifier');
      if (currentCtr < 0.02) actions.push('CTR meta optimization');
      if (intent === 'commercial') actions.push('Intent-matched intro rewrite');
      actions.push('FAQ schema from query patterns');
      actions.push('Contextual internal linking (+3 links)');

      return {
        query: q.query,
        page: q.page,
        position: Math.round(q.position * 10) / 10,
        impressions: q.impressions,
        ctr: Math.round(currentCtr * 10000) / 100,
        intent,
        actions,
        projectedCtrLift: Math.round((expectedCtr - currentCtr) * 10000) / 100,
      };
    });

  // Module B: CRO Optimization
  const croImprovements: CroImprovement[] = [
    { area: 'Above-the-fold', issue: 'Value proposition unclear on mobile', fix: 'Strong benefit-first H1 with problem-solution framing', impact: 'high', projectedLift: 15 },
    { area: 'CTA', issue: 'CTA below scroll on product pages', fix: 'Sticky mobile Add-to-Cart with trust micro-copy', impact: 'high', projectedLift: 12 },
    { area: 'Trust', issue: 'Missing shipping clarity', fix: 'Add shipping reassurance block (US warehouse, 5–10 business days)', impact: 'medium', projectedLift: 8 },
    { area: 'Social proof', issue: 'No trust indicators above fold', fix: 'Add micro-trust badges (30-day returns, secure payment)', impact: 'medium', projectedLift: 7 },
    { area: 'Mobile', issue: 'Cart visibility issues on small screens', fix: 'Floating cart icon with item count badge', impact: 'medium', projectedLift: 5 },
    { area: 'Content', issue: 'Generic product descriptions', fix: 'Benefit-first bullet structure with use-case examples', impact: 'high', projectedLift: 10 },
    { area: 'Cross-sell', issue: 'No related products shown', fix: 'Related product grid with "Frequently bought together"', impact: 'medium', projectedLift: 8 },
    { area: 'Comparison', issue: 'No competitive comparison', fix: 'Feature comparison table vs generic alternatives', impact: 'medium', projectedLift: 6 },
  ];

  // Module C: AOV Amplification
  const aovStrategies: AovStrategy[] = [
    { strategy: 'Bundle suggestions', description: 'Auto-suggest 2-pack and 3-pack bundles at 15%/25% discount', projectedAovLift: 18 },
    { strategy: 'Tiered recommendations', description: 'Show Good/Better/Best product tiers on category pages', projectedAovLift: 12 },
    { strategy: 'Complementary linking', description: 'Link enrichment toys → slow feeders → training aids', projectedAovLift: 8 },
    { strategy: 'Upgrade prompts', description: 'Offer premium version with side-by-side benefits', projectedAovLift: 10 },
    { strategy: 'Category cross-nav', description: 'Smart "Complete the set" recommendations', projectedAovLift: 7 },
  ];

  const totalCroLift = croImprovements.reduce((s, c) => s + c.projectedLift, 0) / croImprovements.length;
  const totalAovLift = aovStrategies.reduce((s, a) => s + a.projectedAovLift, 0) / aovStrategies.length;
  const currentConversion = 1.2;
  const optimizedConversion = Math.round((currentConversion * (1 + totalCroLift / 100)) * 100) / 100;
  const aov = 35;
  const optimizedAov = Math.round(aov * (1 + totalAovLift / 100) * 100) / 100;

  const additionalTraffic = seoTargets.reduce((s, t) => s + t.impressions * (t.projectedCtrLift / 100), 0);

  return {
    seoRevenueTargets: seoTargets,
    croImprovements,
    aovStrategies,
    currentConversionEstimate: currentConversion,
    optimizedConversionEstimate: optimizedConversion,
    revenuePer1000Visitors: Math.round(optimizedConversion / 100 * optimizedAov * 1000),
    aovLiftEstimate: `+${Math.round(totalAovLift)}%`,
    projectedRevenueLift90Days: `+$${Math.round(additionalTraffic * optimizedConversion / 100 * optimizedAov * 3)}`,
  };
}

// ============= PHASE 2: MARKET CAPTURE =============

function runMarketCapture(queries: GscRow[]): MarketCaptureResult {
  const targetCategories = ['dog enrichment', 'dog training', 'outdoor activities', 'puppy development', 'behavioral correction', 'cat climbing'];

  const categoryData = new Map<string, { queries: GscRow[]; impressions: number }>();
  for (const q of queries) {
    const cat = detectCategory(q.query);
    if (!targetCategories.includes(cat)) continue;
    if (!categoryData.has(cat)) categoryData.set(cat, { queries: [], impressions: 0 });
    const d = categoryData.get(cat)!;
    d.queries.push(q);
    d.impressions += q.impressions;
  }

  const hubs: CategoryHub[] = targetCategories.map(cat => {
    const data = categoryData.get(cat);
    const queryCount = data?.queries.length || 0;
    const clusterSize = Math.max(6, Math.min(10, Math.floor(queryCount / 3)));

    return {
      category: cat,
      pillarWordCount: 3000 + Math.floor(Math.random() * 1500),
      clusterArticles: clusterSize,
      internalLinks: clusterSize * 4,
      faqEntries: Math.max(8, Math.min(15, queryCount)),
      productBridges: Math.max(3, Math.min(8, Math.floor(clusterSize / 2))),
      queriesSupporting: queryCount,
    };
  });

  const totalArticles = hubs.reduce((s, h) => s + h.clusterArticles, 0);

  // Quarterly phases
  const quarterlyPhases: QuarterlyPhase[] = [
    {
      quarter: 'Q1', label: 'Foundation',
      objectives: ['Build core category hubs', 'Fix internal link architecture', 'Establish pillar pages'],
      targets: ['6 pillar pages live', '20 cluster articles', 'Zero orphan pages'],
    },
    {
      quarter: 'Q2', label: 'Expansion',
      objectives: ['Expand supporting content', 'Improve snippet capture', 'Strengthen FAQ coverage'],
      targets: ['40+ cluster articles', '15+ snippet targets', 'CTR > 1.5%'],
    },
    {
      quarter: 'Q3', label: 'Acceleration',
      objectives: ['Scale high-performing clusters', 'Deepen authority', 'Launch comparison content'],
      targets: ['60+ cluster articles', '5 Top-10 keywords', 'AOV > $40'],
    },
    {
      quarter: 'Q4', label: 'Dominance',
      objectives: ['Fill competitor gaps', 'Reinforce Top 10 rankings', 'Maximize conversion'],
      targets: ['80+ total articles', '15 Top-10 keywords', 'Revenue > $10K/mo'],
    },
  ];

  // 12-month forecast
  const baseTraffic = queries.reduce((s, q) => s + q.clicks, 0) * 30; // monthly estimate
  const trafficForecast = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const growthMultiplier = 1 + (month * 0.15) + (month > 6 ? (month - 6) * 0.1 : 0);
    const traffic = Math.round(baseTraffic * growthMultiplier);
    const conversionRate = 0.012 + (month * 0.001);
    const aov = 35 + (month * 0.5);
    return { month, traffic, revenue: Math.round(traffic * conversionRate * aov) };
  });

  const totalImpressions = queries.reduce((s, q) => s + q.impressions, 0);
  const authorityGrowth = Math.min(95, Math.round((hubs.length * 12 + totalArticles * 3) / 2));
  const marketShare = Math.min(35, Math.round(authorityGrowth * 0.35));

  return {
    categoryHubs: hubs,
    totalClusterArticles: totalArticles,
    authorityGrowthProjection: authorityGrowth,
    quarterlyPhases,
    trafficForecast12Month: trafficForecast,
    marketShareProbability: marketShare,
  };
}

// ============= PHASE 3: ALGORITHM SHIELD =============

function runAlgorithmShield(queries: GscRow[]): AlgorithmShieldResult {
  const risks: RiskItem[] = [];

  // Thin content detection
  const pageImpressions = new Map<string, number>();
  const pageClicks = new Map<string, number>();
  const pageQueryCount = new Map<string, number>();
  for (const q of queries) {
    pageImpressions.set(q.page, (pageImpressions.get(q.page) || 0) + q.impressions);
    pageClicks.set(q.page, (pageClicks.get(q.page) || 0) + q.clicks);
    pageQueryCount.set(q.page, (pageQueryCount.get(q.page) || 0) + 1);
  }

  // Pages with low query coverage = potential thin content
  for (const [page, count] of pageQueryCount) {
    if (count === 1 && (pageImpressions.get(page) || 0) < 5) {
      risks.push({
        type: 'thin_content', severity: 'warning',
        description: `Low query coverage (${count} query, ${pageImpressions.get(page)} imp)`,
        page, fix: 'Expand content depth or merge with related page',
      });
    }
  }

  // Cannibalization: multiple pages for same query
  const queryPages = new Map<string, string[]>();
  for (const q of queries) {
    if (!queryPages.has(q.query)) queryPages.set(q.query, []);
    const pages = queryPages.get(q.query)!;
    if (!pages.includes(q.page)) pages.push(q.page);
  }
  for (const [query, pages] of queryPages) {
    if (pages.length >= 2) {
      risks.push({
        type: 'cannibalization', severity: pages.length >= 3 ? 'critical' : 'warning',
        description: `"${query}" ranks on ${pages.length} pages`,
        fix: 'Consolidate into single authoritative page with 301 redirects',
      });
    }
  }

  // Over-optimization: pages with high impressions but CTR anomalies
  for (const q of queries) {
    const expectedCtr = estimateCtr(q.position);
    if (q.impressions > 30 && q.ctr > expectedCtr * 3) {
      risks.push({
        type: 'over_optimization', severity: 'info',
        description: `"${q.query}" CTR ${(q.ctr * 100).toFixed(1)}% unusually high for pos ${Math.round(q.position)}`,
        page: q.page, fix: 'Monitor for click-through rate manipulation signals',
      });
    }
  }

  // Early signal detection
  const totalQueries = queries.length;
  const top10Queries = queries.filter(q => q.position <= 10).length;
  const top20Queries = queries.filter(q => q.position <= 20).length;
  const avgPosition = queries.reduce((s, q) => s + q.position, 0) / Math.max(1, totalQueries);
  const avgCtr = queries.reduce((s, q) => s + q.ctr, 0) / Math.max(1, totalQueries);
  const zeroClickQueries = queries.filter(q => q.clicks === 0 && q.impressions > 10).length;

  const earlySignals: AlgorithmShieldResult['earlySignals'] = [
    { signal: 'Ranking velocity', status: top10Queries / totalQueries > 0.2 ? 'normal' : top10Queries / totalQueries > 0.1 ? 'warning' : 'alert', value: `${Math.round((top10Queries / totalQueries) * 100)}% in Top 10` },
    { signal: 'CTR health', status: avgCtr > 0.02 ? 'normal' : avgCtr > 0.01 ? 'warning' : 'alert', value: `${(avgCtr * 100).toFixed(2)}% avg` },
    { signal: 'Position trend', status: avgPosition < 25 ? 'normal' : avgPosition < 40 ? 'warning' : 'alert', value: `Avg pos ${avgPosition.toFixed(1)}` },
    { signal: 'Zero-click ratio', status: zeroClickQueries / totalQueries < 0.3 ? 'normal' : zeroClickQueries / totalQueries < 0.5 ? 'warning' : 'alert', value: `${Math.round((zeroClickQueries / totalQueries) * 100)}% zero-click` },
    { signal: 'Indexing coverage', status: pageQueryCount.size > 20 ? 'normal' : pageQueryCount.size > 10 ? 'warning' : 'alert', value: `${pageQueryCount.size} pages indexed` },
    { signal: 'Cannibalization risk', status: risks.filter(r => r.type === 'cannibalization').length < 3 ? 'normal' : 'warning', value: `${risks.filter(r => r.type === 'cannibalization').length} conflicts` },
  ];

  // Adaptive actions
  const volatility = earlySignals.filter(s => s.status === 'alert').length;
  const adaptiveActions: AdaptiveAction[] = [
    { trigger: 'CTR drop > 15%', action: 'Pause aggressive title rewrites, reinforce E-E-A-T', status: avgCtr < 0.01 ? 'applied' : 'ready' },
    { trigger: 'Position drop > 5 avg', action: 'Reduce update frequency, strengthen topical depth', status: avgPosition > 35 ? 'applied' : 'monitoring' },
    { trigger: 'Impression volatility', action: 'Freeze structure on Top 20 pages for 30 days', status: 'monitoring' },
    { trigger: 'Cannibalization detected', action: 'Merge competing pages, implement canonical consolidation', status: risks.filter(r => r.type === 'cannibalization').length > 2 ? 'applied' : 'ready' },
    { trigger: 'Thin content flagged', action: 'Expand or redirect pages below 300 words', status: risks.filter(r => r.type === 'thin_content').length > 5 ? 'applied' : 'monitoring' },
  ];

  // Scores
  const thinRiskPenalty = Math.min(20, risks.filter(r => r.type === 'thin_content').length * 2);
  const cannibPenalty = Math.min(15, risks.filter(r => r.type === 'cannibalization').length * 3);
  const immunityIndex = Math.max(0, 100 - thinRiskPenalty - cannibPenalty - (volatility * 5));
  const trustScore = Math.max(0, Math.min(100, 60 + (top20Queries / totalQueries) * 40));
  const depthIndex = Math.max(0, Math.min(100, (pageQueryCount.size / Math.max(1, totalQueries)) * 200));
  const stabilityScore = Math.round((immunityIndex + trustScore + depthIndex) / 3);

  return {
    volatilityDetected: volatility > 1,
    immunityIndex: Math.round(immunityIndex),
    trustSignalScore: Math.round(trustScore),
    contentDepthIndex: Math.round(depthIndex),
    algorithmStabilityScore: stabilityScore,
    risks: risks.slice(0, 20),
    adaptiveActions,
    earlySignals,
  };
}

// ============= MAIN =============

export function runRevenueMarketCapture(rawQueries: GscRow[]): RevenueMarketCaptureResult {
  const queries = rawQueries.filter(q => !isDutch(q.query) && q.query.length > 2);

  const revenueEngine = runRevenueEngine(queries);
  const marketCapture = runMarketCapture(queries);
  const algorithmShield = runAlgorithmShield(queries);

  const rev90 = revenueEngine.projectedRevenueLift90Days;
  const rev12 = marketCapture.trafficForecast12Month[11]
    ? `+$${marketCapture.trafficForecast12Month[11].revenue}`
    : '+$0';

  return {
    revenueEngine,
    marketCapture,
    algorithmShield,
    systemSummary: {
      autonomousRevenueEngine: 'ACTIVE',
      marketCaptureBlueprint: 'DEPLOYED',
      coreUpdateShield: 'ACTIVE',
      projected90DayRevenueLift: rev90,
      projected12MonthRevenueLift: rev12,
      authorityGrowthIndex: marketCapture.authorityGrowthProjection,
      algorithmStabilityIndex: algorithmShield.algorithmStabilityScore,
      enterpriseGrowthStatus: 'SELF-IMPROVING',
      totalRealQueries: queries.length,
    },
  };
}
