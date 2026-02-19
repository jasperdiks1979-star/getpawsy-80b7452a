/**
 * Commerce Intelligence — Barrel export
 * Unified access to all three modules.
 */

export { calculateDemandScore, generateDemandReport } from './demand-prediction';
export type { DemandScore, DemandPredictionReport, DemandSignals } from './demand-prediction';

export { generatePricingRecommendation, generatePricingReport } from './pricing-intelligence';
export type { PricingRecommendation, PricingIntelligenceReport, PricingAction } from './pricing-intelligence';

export { generateAdsRecommendation, generateAdsReport } from './ads-optimization';
export type { AdsRecommendation, AdsOptimizationReport, AdsInput, CampaignAction } from './ads-optimization';
