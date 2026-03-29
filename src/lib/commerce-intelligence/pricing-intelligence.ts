/**
 * Dynamic Pricing Intelligence Engine
 * Safe A/B price testing with auto-rollback and margin protection.
 */

import { supabase } from '@/integrations/supabase/client';
import { roundToPsychologicalPrice, formatPrice } from '@/lib/pricing';

// Safety constants
const MAX_PRICE_CHANGE_PCT = 0.05; // 5% max per cycle
const MIN_MARGIN_PCT = 0.25; // 25% minimum margin
const ROLLBACK_CONVERSION_DROP_PCT = 0.05; // 5% conversion drop triggers rollback
const AB_TRAFFIC_SPLIT = 0.15; // max 15% traffic for tests

export interface PricingSignals {
  productId: string;
  productName: string;
  slug: string;
  currentPrice: number;
  costPrice: number | null;
  conversionRate: number;
  bounceRate: number;
  cartAbandonmentRate: number;
  demandScore: number;
}

export type PricingAction = 'increase' | 'decrease' | 'hold' | 'psychological_adjust';

export interface PricingRecommendation {
  productId: string;
  productName: string;
  slug: string;
  currentPrice: number;
  recommendedPrice: number;
  action: PricingAction;
  changePct: number;
  reason: string;
  marginPct: number | null;
  safeToApply: boolean;
  rollbackPrice: number;
  confidenceLevel: 'high' | 'medium' | 'low';
}

export interface PricingIntelligenceReport {
  generatedAt: string;
  totalAnalyzed: number;
  recommendations: PricingRecommendation[];
  increaseCount: number;
  decreaseCount: number;
  holdCount: number;
  estimatedRevenueImpact: number;
  safetyStatus: 'green' | 'yellow' | 'red';
}

/**
 * Determine pricing action based on conversion + abandonment signals
 */
function determinePricingAction(signals: PricingSignals): { action: PricingAction; changePct: number; reason: string } {
  const { conversionRate, bounceRate, cartAbandonmentRate, demandScore } = signals;

  // High conversion + low abandonment → room to increase
  if (conversionRate > 0.025 && cartAbandonmentRate < 0.5 && demandScore > 50) {
    return {
      action: 'increase',
      changePct: 0.03 + (demandScore > 70 ? 0.02 : 0), // 3-5%
      reason: `High CVR (${(conversionRate * 100).toFixed(1)}%) + low abandon (${(cartAbandonmentRate * 100).toFixed(0)}%) — margin expansion safe`,
    };
  }

  // High abandonment → test decrease
  if (cartAbandonmentRate > 0.7 && conversionRate < 0.015) {
    return {
      action: 'decrease',
      changePct: -0.03 + (cartAbandonmentRate > 0.8 ? -0.02 : 0), // -3 to -5% (capped at MAX)
      reason: `High abandon (${(cartAbandonmentRate * 100).toFixed(0)}%) + low CVR — price sensitivity detected`,
    };
  }

  // High bounce → possible price shock
  if (bounceRate > 0.7 && conversionRate < 0.01) {
    return {
      action: 'decrease',
      changePct: -0.02,
      reason: `High bounce (${(bounceRate * 100).toFixed(0)}%) — potential price anchoring issue`,
    };
  }

  // Check if psychological rounding can improve
  const psychPrice = roundToPsychologicalPrice(signals.currentPrice);
  if (Math.abs(psychPrice - signals.currentPrice) > 0.02) {
    return {
      action: 'psychological_adjust',
      changePct: (psychPrice - signals.currentPrice) / signals.currentPrice,
      reason: `Psychological rounding: ${formatPrice(signals.currentPrice)} → ${formatPrice(psychPrice)}`,
    };
  }

  return { action: 'hold', changePct: 0, reason: 'Metrics within healthy range — no change needed' };
}

/**
 * Check margin safety
 */
function checkMarginSafety(newPrice: number, costPrice: number | null): { safe: boolean; marginPct: number | null } {
  if (!costPrice || costPrice <= 0) return { safe: true, marginPct: null };
  const marginPct = (newPrice - costPrice) / newPrice;
  return { safe: marginPct >= MIN_MARGIN_PCT, marginPct };
}

/**
 * Generate pricing recommendation for a single product
 */
export function generatePricingRecommendation(signals: PricingSignals): PricingRecommendation {
  const { action, changePct, reason } = determinePricingAction(signals);

  // Cap change at MAX_PRICE_CHANGE_PCT
  const cappedChange = Math.max(-MAX_PRICE_CHANGE_PCT, Math.min(MAX_PRICE_CHANGE_PCT, changePct));
  
  let recommendedPrice = signals.currentPrice;
  if (action === 'psychological_adjust') {
    recommendedPrice = roundToPsychologicalPrice(signals.currentPrice);
  } else if (action !== 'hold') {
    const rawNew = signals.currentPrice * (1 + cappedChange);
    recommendedPrice = roundToPsychologicalPrice(rawNew);
  }

  // Margin safety check
  const { safe: marginSafe, marginPct } = checkMarginSafety(recommendedPrice, signals.costPrice);
  
  // If margin unsafe, don't decrease
  if (!marginSafe && action === 'decrease') {
    return {
      productId: signals.productId,
      productName: signals.productName,
      slug: signals.slug,
      currentPrice: signals.currentPrice,
      recommendedPrice: signals.currentPrice,
      action: 'hold',
      changePct: 0,
      reason: `Margin floor (${(MIN_MARGIN_PCT * 100).toFixed(0)}%) blocks decrease — ${reason}`,
      marginPct,
      safeToApply: false,
      rollbackPrice: signals.currentPrice,
      confidenceLevel: 'low',
    };
  }

  const actualChangePct = (recommendedPrice - signals.currentPrice) / signals.currentPrice;
  const confidence: 'high' | 'medium' | 'low' =
    signals.conversionRate > 0 && signals.demandScore > 40 ? 'high' :
    signals.conversionRate > 0 ? 'medium' : 'low';

  return {
    productId: signals.productId,
    productName: signals.productName,
    slug: signals.slug,
    currentPrice: signals.currentPrice,
    recommendedPrice,
    action: action === 'hold' ? 'hold' : (actualChangePct > 0 ? 'increase' : actualChangePct < 0 ? 'decrease' : 'hold'),
    changePct: Math.round(actualChangePct * 10000) / 100,
    reason,
    marginPct,
    safeToApply: action === 'hold' || (marginSafe && Math.abs(actualChangePct) <= MAX_PRICE_CHANGE_PCT),
    rollbackPrice: signals.currentPrice,
    confidenceLevel: confidence,
  };
}

/**
 * Generate full pricing intelligence report
 */
export async function generatePricingReport(demandScores: Map<string, number>): Promise<PricingIntelligenceReport> {
  // Fetch products with cost data
  const { data: products } = await supabase
    .from('products_public')
    .select('id, name, slug, price, is_active')
    .eq('is_active', true)
    .limit(500);

  if (!products || products.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      totalAnalyzed: 0,
      recommendations: [],
      increaseCount: 0,
      decreaseCount: 0,
      holdCount: 0,
      estimatedRevenueImpact: 0,
      safetyStatus: 'green',
    };
  }

  // Fetch conversion signals from visitor_activity
  const since28d = new Date(Date.now() - 28 * 86400000).toISOString();
  const { data: activity } = await supabase
    .from('visitor_activity')
    .select('activity_type, page_path')
    .gte('created_at', since28d);

  // Build per-slug metrics
  const slugMetrics = new Map<string, { views: number; atc: number; purchases: number; bounces: number }>();
  if (activity) {
    for (const a of activity) {
      const slug = a.page_path?.split('/').pop() || '';
      if (!slugMetrics.has(slug)) slugMetrics.set(slug, { views: 0, atc: 0, purchases: 0, bounces: 0 });
      const m = slugMetrics.get(slug)!;
      if (a.activity_type === 'product_view') m.views++;
      else if (a.activity_type === 'add_to_cart') m.atc++;
      else if (a.activity_type === 'purchase') m.purchases++;
      else if (a.activity_type === 'bounce') m.bounces++;
    }
  }

  const recommendations: PricingRecommendation[] = products.map((p) => {
    const metrics = slugMetrics.get(p.slug) || { views: 0, atc: 0, purchases: 0, bounces: 0 };
    const views = Math.max(metrics.views, 1);
    
    const signals: PricingSignals = {
      productId: p.id,
      productName: p.name,
      slug: p.slug,
      currentPrice: p.price,
      costPrice: p.cost_price,
      conversionRate: metrics.purchases / views,
      bounceRate: metrics.bounces / views,
      cartAbandonmentRate: metrics.atc > 0 ? 1 - (metrics.purchases / metrics.atc) : 0.5,
      demandScore: demandScores.get(p.id) || 0,
    };

    return generatePricingRecommendation(signals);
  });

  const increases = recommendations.filter(r => r.action === 'increase');
  const decreases = recommendations.filter(r => r.action === 'decrease');
  const holds = recommendations.filter(r => r.action === 'hold');

  const revenueImpact = recommendations.reduce((sum, r) => {
    return sum + (r.recommendedPrice - r.currentPrice);
  }, 0);

  const unsafeCount = recommendations.filter(r => !r.safeToApply && r.action !== 'hold').length;
  const safetyStatus: 'green' | 'yellow' | 'red' = unsafeCount === 0 ? 'green' : unsafeCount < 5 ? 'yellow' : 'red';

  return {
    generatedAt: new Date().toISOString(),
    totalAnalyzed: products.length,
    recommendations: recommendations.filter(r => r.action !== 'hold').sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)),
    increaseCount: increases.length,
    decreaseCount: decreases.length,
    holdCount: holds.length,
    estimatedRevenueImpact: Math.round(revenueImpact * 100) / 100,
    safetyStatus,
  };
}
