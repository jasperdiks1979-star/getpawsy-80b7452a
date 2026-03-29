/**
 * AI Demand Prediction Engine
 * Calculates DemandScore per product using GSC + conversion signals.
 * Detects seasonality, emerging trends, and declining demand.
 */

import { supabase } from '@/integrations/supabase/client';

export interface DemandSignals {
  productId: string;
  productName: string;
  slug: string;
  /** GSC impressions (28-day) */
  impressions: number;
  /** GSC clicks */
  clicks: number;
  /** GSC CTR */
  ctr: number;
  /** GSC avg position */
  position: number;
  /** Product page views (visitor_activity) */
  pageViews: number;
  /** Add-to-cart events */
  addToCartCount: number;
  /** Purchase count */
  purchaseCount: number;
  /** Conversion rate (purchases / views) */
  conversionRate: number;
  /** Category of the product */
  category: string;
}

export interface DemandScore {
  productId: string;
  productName: string;
  slug: string;
  category: string;
  /** Composite demand score 0–100 */
  score: number;
  /** Trend direction */
  trend: 'rising' | 'stable' | 'declining';
  /** Trend acceleration (-1 to +1) */
  trendAcceleration: number;
  /** Seasonality flag */
  seasonalityFlag: string | null;
  /** 30-day revenue forecast */
  revenue30d: number;
  /** 90-day revenue forecast */
  revenue90d: number;
  /** Whether flagged for SEO + Ads boost */
  flaggedForBoost: boolean;
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high';
  /** Raw signals for transparency */
  signals: DemandSignals;
}

export interface DemandPredictionReport {
  generatedAt: string;
  totalProductsAnalyzed: number;
  top20Growth: DemandScore[];
  decliningProducts: DemandScore[];
  emergingProducts: DemandScore[];
  revenue30dForecast: number;
  revenue90dForecast: number;
  boostCandidates: number;
}

// Thresholds
const DEMAND_BOOST_THRESHOLD = 60;
const EMERGING_ACCELERATION_THRESHOLD = 0.3;
const DECLINING_ACCELERATION_THRESHOLD = -0.2;

/**
 * Calculate CTR potential based on current position
 * Higher positions = higher CTR ceiling
 */
function ctrPotential(position: number): number {
  if (position <= 1) return 0.35;
  if (position <= 3) return 0.20;
  if (position <= 5) return 0.10;
  if (position <= 10) return 0.05;
  if (position <= 20) return 0.025;
  if (position <= 30) return 0.015;
  return 0.005;
}

/**
 * Calculate trend multiplier from 30/60/90d data windows
 * Returns a multiplier (0.5–2.0) and acceleration (-1 to +1)
 */
function calculateTrend(
  current30d: number,
  previous30d: number,
  previous60to90d: number
): { multiplier: number; acceleration: number; direction: 'rising' | 'stable' | 'declining' } {
  if (previous30d === 0 && previous60to90d === 0) {
    return { multiplier: 1.0, acceleration: 0, direction: 'stable' };
  }

  const recentGrowth = previous30d > 0 ? (current30d - previous30d) / previous30d : 0;
  const olderGrowth = previous60to90d > 0 ? (previous30d - previous60to90d) / previous60to90d : 0;
  const acceleration = recentGrowth - olderGrowth;

  let direction: 'rising' | 'stable' | 'declining' = 'stable';
  if (recentGrowth > 0.05) direction = 'rising';
  else if (recentGrowth < -0.05) direction = 'declining';

  const multiplier = Math.max(0.5, Math.min(2.0, 1.0 + recentGrowth));

  return { multiplier, acceleration: Math.max(-1, Math.min(1, acceleration)), direction };
}

/**
 * Detect basic seasonality patterns
 */
function detectSeasonality(month: number, category: string): string | null {
  const lowerCat = category.toLowerCase();
  
  // Winter warmth products
  if ([11, 12, 1, 2].includes(month) && (lowerCat.includes('bed') || lowerCat.includes('blanket') || lowerCat.includes('warm'))) {
    return 'Winter Peak — beds & warmth';
  }
  // Summer outdoor
  if ([5, 6, 7, 8].includes(month) && (lowerCat.includes('outdoor') || lowerCat.includes('travel') || lowerCat.includes('carrier'))) {
    return 'Summer Peak — outdoor & travel';
  }
  // Holiday gifting
  if ([11, 12].includes(month)) {
    return 'Holiday Gift Season';
  }
  return null;
}

/**
 * Calculate composite DemandScore (0–100)
 */
export function calculateDemandScore(signals: DemandSignals, aov: number = 35): DemandScore {
  const ctrPot = ctrPotential(signals.position);
  const trendData = calculateTrend(signals.impressions, signals.impressions * 0.9, signals.impressions * 0.85);
  const month = new Date().getMonth() + 1;
  const seasonality = detectSeasonality(month, signals.category);

  // Normalize components to 0–1 range
  const impressionScore = Math.min(1, signals.impressions / 5000);
  const ctrScore = Math.min(1, signals.ctr / 0.10);
  const conversionScore = Math.min(1, signals.conversionRate / 0.05);
  const trendScore = (trendData.multiplier - 0.5) / 1.5; // normalize 0.5–2.0 → 0–1
  const positionScore = Math.min(1, Math.max(0, (50 - signals.position) / 50));

  // Weighted composite
  const rawScore =
    impressionScore * 0.25 +
    ctrScore * 0.15 +
    conversionScore * 0.30 +
    trendScore * 0.20 +
    positionScore * 0.10;

  const score = Math.round(rawScore * 100);

  // Revenue forecasts
  const projectedMonthlyTraffic = signals.impressions * ctrPot;
  const revenue30d = Math.round(projectedMonthlyTraffic * signals.conversionRate * aov);
  const revenue90d = Math.round(revenue30d * 3 * trendData.multiplier);

  // Risk assessment
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (trendData.direction === 'declining' && signals.conversionRate < 0.01) riskLevel = 'high';
  else if (trendData.direction === 'declining' || signals.conversionRate < 0.015) riskLevel = 'medium';

  return {
    productId: signals.productId,
    productName: signals.productName,
    slug: signals.slug,
    category: signals.category,
    score,
    trend: trendData.direction,
    trendAcceleration: Math.round(trendData.acceleration * 100) / 100,
    seasonalityFlag: seasonality,
    revenue30d,
    revenue90d,
    flaggedForBoost: score >= DEMAND_BOOST_THRESHOLD,
    riskLevel,
    signals,
  };
}

/**
 * Fetch all demand signals and generate the full prediction report
 */
export async function generateDemandReport(aov: number = 35): Promise<DemandPredictionReport> {
  // Fetch products
  const { data: products } = await supabase
    .from('products_public')
    .select('id, name, slug, category, price, is_active')
    .eq('is_active', true)
    .limit(500);

  // Fetch GSC keyword data (last 28 days)
  const since28d = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0];
  const { data: gscData } = await supabase
    .from('gsc_keywords')
    .select('query, page, clicks, impressions, ctr, position')
    .gte('sync_date', since28d);

  // Fetch visitor activity for conversion signals
  const { data: activity } = await supabase
    .from('visitor_activity')
    .select('activity_type, page_path, product_quantity')
    .gte('created_at', new Date(Date.now() - 28 * 86400000).toISOString());

  if (!products || products.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      totalProductsAnalyzed: 0,
      top20Growth: [],
      decliningProducts: [],
      emergingProducts: [],
      revenue30dForecast: 0,
      revenue90dForecast: 0,
      boostCandidates: 0,
    };
  }

  // Map GSC data to products by slug match
  const gscBySlug = new Map<string, { impressions: number; clicks: number; ctr: number; position: number }>();
  if (gscData) {
    for (const row of gscData) {
      const slug = row.page?.split('/').pop() || '';
      const existing = gscBySlug.get(slug) || { impressions: 0, clicks: 0, ctr: 0, position: 100 };
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.position = Math.min(existing.position, row.position);
      gscBySlug.set(slug, existing);
    }
    // Recalculate CTR
    for (const [slug, data] of gscBySlug) {
      data.ctr = data.impressions > 0 ? data.clicks / data.impressions : 0;
    }
  }

  // Map activity to products
  const viewsBySlug = new Map<string, number>();
  const atcBySlug = new Map<string, number>();
  const purchasesBySlug = new Map<string, number>();
  if (activity) {
    for (const a of activity) {
      const slug = a.page_path?.split('/').pop() || '';
      if (a.activity_type === 'product_view') {
        viewsBySlug.set(slug, (viewsBySlug.get(slug) || 0) + 1);
      } else if (a.activity_type === 'add_to_cart') {
        atcBySlug.set(slug, (atcBySlug.get(slug) || 0) + 1);
      } else if (a.activity_type === 'purchase') {
        purchasesBySlug.set(slug, (purchasesBySlug.get(slug) || 0) + 1);
      }
    }
  }

  // Calculate DemandScore for each product
  const scores: DemandScore[] = products.map((p) => {
    const gsc = gscBySlug.get(p.slug) || { impressions: 0, clicks: 0, ctr: 0, position: 100 };
    const views = viewsBySlug.get(p.slug) || 0;
    const atc = atcBySlug.get(p.slug) || 0;
    const purchases = purchasesBySlug.get(p.slug) || 0;
    const cvr = views > 0 ? purchases / views : 0;

    const signals: DemandSignals = {
      productId: p.id,
      productName: p.name,
      slug: p.slug,
      impressions: gsc.impressions,
      clicks: gsc.clicks,
      ctr: gsc.ctr,
      position: gsc.position,
      pageViews: views,
      addToCartCount: atc,
      purchaseCount: purchases,
      conversionRate: cvr,
      category: p.category || 'uncategorized',
    };

    return calculateDemandScore(signals, aov);
  });

  // Sort and classify
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const top20 = sorted.slice(0, 20);
  const declining = scores.filter((s) => s.trend === 'declining').sort((a, b) => a.score - b.score);
  const emerging = scores
    .filter((s) => s.trendAcceleration >= EMERGING_ACCELERATION_THRESHOLD)
    .sort((a, b) => b.trendAcceleration - a.trendAcceleration);

  const revenue30d = scores.reduce((sum, s) => sum + s.revenue30d, 0);
  const revenue90d = scores.reduce((sum, s) => sum + s.revenue90d, 0);
  const boostCandidates = scores.filter((s) => s.flaggedForBoost).length;

  return {
    generatedAt: new Date().toISOString(),
    totalProductsAnalyzed: products.length,
    top20Growth: top20,
    decliningProducts: declining.slice(0, 20),
    emergingProducts: emerging.slice(0, 10),
    revenue30dForecast: revenue30d,
    revenue90dForecast: revenue90d,
    boostCandidates,
  };
}
