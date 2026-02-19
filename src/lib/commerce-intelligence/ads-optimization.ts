/**
 * Paid Traffic Optimization Engine
 * Intelligent budget allocation based on DemandScore, ROAS prediction, and margin factors.
 */

// Safety constants
const MIN_ROAS_THRESHOLD = 2.0; // minimum 2x ROAS to continue
const ROAS_SCALE_THRESHOLD = 4.0; // 4x ROAS → scale up
const ROAS_TEST_THRESHOLD = 2.5; // 2.5x → test phase

export interface AdsInput {
  productId: string;
  productName: string;
  slug: string;
  demandScore: number;
  revenuePotential30d: number;
  conversionRate: number;
  marginFactor: number;
  currentPrice: number;
  costPrice: number | null;
  category: string;
  searchIntent: 'commercial' | 'informational' | 'navigational' | 'mixed';
}

export type CampaignAction = 'scale' | 'test' | 'pause' | 'not_qualified';

export interface AdsRecommendation {
  productId: string;
  productName: string;
  slug: string;
  category: string;
  budgetWeight: number;
  predictedROAS: number;
  campaignAction: CampaignAction;
  reason: string;
  suggestedDailyBudget: number;
  projectedRevenue30d: number;
  projectedAdSpend30d: number;
  qualificationScore: number;
  landingPageReady: boolean;
}

export interface AdsOptimizationReport {
  generatedAt: string;
  totalProducts: number;
  qualifiedProducts: number;
  scaleCount: number;
  testCount: number;
  pauseCount: number;
  totalSuggestedDailyBudget: number;
  totalProjectedRevenue30d: number;
  avgPredictedROAS: number;
  recommendations: AdsRecommendation[];
  autoStopRules: string[];
}

/**
 * Classify search intent from category/product name
 */
function classifySearchIntent(category: string, productName: string): 'commercial' | 'informational' | 'mixed' {
  const lowerName = productName.toLowerCase();
  const lowerCat = category.toLowerCase();

  // Commercial intent keywords
  const commercialSignals = ['buy', 'best', 'top', 'premium', 'automatic', 'smart', 'professional'];
  const hasCommercial = commercialSignals.some(s => lowerName.includes(s) || lowerCat.includes(s));

  // Product categories are inherently commercial
  const commercialCategories = ['bed', 'tree', 'litter', 'cage', 'carrier', 'feeder', 'bowl', 'toy', 'collar', 'leash'];
  const isCatCommercial = commercialCategories.some(c => lowerCat.includes(c));

  if (hasCommercial || isCatCommercial) return 'commercial';
  return 'mixed';
}

/**
 * Calculate budget weight
 * BudgetWeight = RevenuePotential × ConversionRate × MarginFactor
 */
function calculateBudgetWeight(input: AdsInput): number {
  return input.revenuePotential30d * input.conversionRate * input.marginFactor;
}

/**
 * Predict ROAS based on signals
 */
function predictROAS(input: AdsInput, estimatedCPC: number = 0.80): number {
  if (input.conversionRate <= 0 || estimatedCPC <= 0) return 0;

  // Revenue per click = CVR × price
  const revenuePerClick = input.conversionRate * input.currentPrice;
  return revenuePerClick / estimatedCPC;
}

/**
 * Determine campaign action
 */
function determineCampaignAction(
  predictedROAS: number,
  demandScore: number,
  searchIntent: string,
  qualificationScore: number
): { action: CampaignAction; reason: string } {
  // Not qualified
  if (qualificationScore < 30) {
    return { action: 'not_qualified', reason: `Low qualification score (${qualificationScore}) — skip paid promotion` };
  }

  if (searchIntent === 'informational') {
    return { action: 'not_qualified', reason: 'Informational intent — organic only' };
  }

  if (predictedROAS < MIN_ROAS_THRESHOLD) {
    return { action: 'pause', reason: `Predicted ROAS ${predictedROAS.toFixed(1)}x below ${MIN_ROAS_THRESHOLD}x minimum` };
  }

  if (predictedROAS >= ROAS_SCALE_THRESHOLD && demandScore >= 60) {
    return { action: 'scale', reason: `Strong ROAS ${predictedROAS.toFixed(1)}x + DemandScore ${demandScore} — scale budget` };
  }

  if (predictedROAS >= ROAS_TEST_THRESHOLD) {
    return { action: 'test', reason: `Moderate ROAS ${predictedROAS.toFixed(1)}x — run test campaign` };
  }

  return { action: 'pause', reason: `ROAS ${predictedROAS.toFixed(1)}x marginal — hold for now` };
}

/**
 * Generate ads recommendation for a single product
 */
export function generateAdsRecommendation(input: AdsInput): AdsRecommendation {
  const searchIntent = classifySearchIntent(input.category, input.productName);
  const budgetWeight = calculateBudgetWeight(input);
  const predictedROAS = predictROAS(input);

  // Qualification score (0-100)
  const qualificationScore = Math.round(
    (input.demandScore * 0.35) +
    (Math.min(1, input.conversionRate / 0.03) * 100 * 0.30) +
    (input.marginFactor * 100 * 0.20) +
    (searchIntent === 'commercial' ? 15 : searchIntent === 'mixed' ? 7 : 0)
  );

  const { action, reason } = determineCampaignAction(predictedROAS, input.demandScore, searchIntent, qualificationScore);

  // Suggested daily budget based on action
  let dailyBudget = 0;
  if (action === 'scale') dailyBudget = Math.min(50, Math.max(10, budgetWeight * 2));
  else if (action === 'test') dailyBudget = Math.min(20, Math.max(5, budgetWeight));

  const projectedAdSpend = dailyBudget * 30;
  const projectedRevenue = projectedAdSpend * predictedROAS;

  return {
    productId: input.productId,
    productName: input.productName,
    slug: input.slug,
    category: input.category,
    budgetWeight: Math.round(budgetWeight * 100) / 100,
    predictedROAS: Math.round(predictedROAS * 10) / 10,
    campaignAction: action,
    reason,
    suggestedDailyBudget: Math.round(dailyBudget * 100) / 100,
    projectedRevenue30d: Math.round(projectedRevenue),
    projectedAdSpend30d: Math.round(projectedAdSpend),
    qualificationScore,
    landingPageReady: true, // Assume ready; LCP/CTA checks are external
  };
}

/**
 * Generate full ads optimization report
 */
export function generateAdsReport(inputs: AdsInput[]): AdsOptimizationReport {
  const recommendations = inputs
    .map(generateAdsRecommendation)
    .sort((a, b) => b.predictedROAS - a.predictedROAS);

  const qualified = recommendations.filter(r => r.campaignAction !== 'not_qualified');
  const scale = qualified.filter(r => r.campaignAction === 'scale');
  const test = qualified.filter(r => r.campaignAction === 'test');
  const pause = qualified.filter(r => r.campaignAction === 'pause');

  const totalBudget = qualified.reduce((s, r) => s + r.suggestedDailyBudget, 0);
  const totalRevenue = qualified.reduce((s, r) => s + r.projectedRevenue30d, 0);
  const avgROAS = qualified.length > 0
    ? qualified.reduce((s, r) => s + r.predictedROAS, 0) / qualified.length
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    totalProducts: inputs.length,
    qualifiedProducts: qualified.length,
    scaleCount: scale.length,
    testCount: test.length,
    pauseCount: pause.length,
    totalSuggestedDailyBudget: Math.round(totalBudget * 100) / 100,
    totalProjectedRevenue30d: Math.round(totalRevenue),
    avgPredictedROAS: Math.round(avgROAS * 10) / 10,
    recommendations: qualified.slice(0, 30), // top 30
    autoStopRules: [
      `Auto-pause if ROAS < ${MIN_ROAS_THRESHOLD}x`,
      'Auto-pause if LCP > 3.0s on landing page',
      'Auto-pause if conversion drops > 5% vs baseline',
      'Daily budget cap enforced per product',
    ],
  };
}
