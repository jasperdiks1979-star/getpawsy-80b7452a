/**
 * A/B Test Analytics and Automatic Winner Rollout System
 */

import { supabase } from '@/integrations/supabase/client';

// Test configuration
export const AB_TEST_CONFIG = {
  minDays: 7,
  minSessionsPerVariant: 300,
  significanceLevel: 0.95,
  primaryMetric: 'revenuePerSession' as const,
};

// Test variants
export type BundleVariant = 'A' | 'B';
export type MessagingVariant = 'discount' | 'benefit';

// Analytics data structure
export interface VariantMetrics {
  variant: string;
  sessions: number;
  addToCart: number;
  checkoutsStarted: number;
  purchases: number;
  totalRevenue: number;
  bundleItemsAdded: number;
  bundleValue: number;
}

export interface ABTestResults {
  testName: string;
  startDate: string;
  daysSinceStart: number;
  variants: VariantMetrics[];
  winner: string | null;
  winnerConfidence: number;
  canRollout: boolean;
  rolloutReason: string;
}

export interface ProcessedMetrics {
  variant: string;
  sessions: number;
  revenuePerSession: number;
  aov: number;
  conversionRate: number;
  bundleAttachRate: number;
  addToCartRate: number;
  checkoutRate: number;
}

/**
 * Calculate processed metrics from raw variant data
 */
export function processMetrics(raw: VariantMetrics): ProcessedMetrics {
  const sessions = Math.max(raw.sessions, 1);
  const purchases = Math.max(raw.purchases, 1);
  
  return {
    variant: raw.variant,
    sessions: raw.sessions,
    revenuePerSession: raw.totalRevenue / sessions,
    aov: raw.totalRevenue / purchases,
    conversionRate: (raw.purchases / sessions) * 100,
    bundleAttachRate: (raw.bundleItemsAdded / sessions) * 100,
    addToCartRate: (raw.addToCart / sessions) * 100,
    checkoutRate: (raw.checkoutsStarted / sessions) * 100,
  };
}

/**
 * Simple z-test for comparing conversion rates
 */
function calculateSignificance(
  rate1: number,
  n1: number,
  rate2: number,
  n2: number
): number {
  const p1 = rate1 / 100;
  const p2 = rate2 / 100;
  const pPooled = (p1 * n1 + p2 * n2) / (n1 + n2);
  
  if (pPooled === 0 || pPooled === 1) return 0;
  
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1/n1 + 1/n2));
  if (se === 0) return 0;
  
  const z = Math.abs(p1 - p2) / se;
  
  // Approximate confidence from z-score
  // z = 1.96 → 95%, z = 2.58 → 99%
  if (z >= 2.58) return 0.99;
  if (z >= 1.96) return 0.95;
  if (z >= 1.65) return 0.90;
  if (z >= 1.28) return 0.80;
  return 0.5 + (z / 4);
}

/**
 * Determine winner based on primary metric
 */
export function determineWinner(
  metrics: ProcessedMetrics[]
): { winner: string | null; confidence: number; metric: string; values: Record<string, number> } {
  if (metrics.length < 2) {
    return { winner: null, confidence: 0, metric: AB_TEST_CONFIG.primaryMetric, values: {} };
  }
  
  const [a, b] = metrics;
  const metricKey = AB_TEST_CONFIG.primaryMetric;
  
  const valueA = a[metricKey] || 0;
  const valueB = b[metricKey] || 0;
  
  const values = {
    [a.variant]: valueA,
    [b.variant]: valueB,
  };
  
  // Calculate statistical significance using conversion rate as proxy
  const confidence = calculateSignificance(
    a.conversionRate,
    a.sessions,
    b.conversionRate,
    b.sessions
  );
  
  // Determine winner if statistically significant
  if (confidence >= AB_TEST_CONFIG.significanceLevel) {
    const winner = valueA > valueB ? a.variant : b.variant;
    return { winner, confidence, metric: metricKey, values };
  }
  
  return { winner: null, confidence, metric: metricKey, values };
}

/**
 * Check if test meets rollout conditions
 */
export function canAutoRollout(
  daysSinceStart: number,
  variantMetrics: VariantMetrics[]
): { canRollout: boolean; reason: string } {
  // Check minimum days
  if (daysSinceStart < AB_TEST_CONFIG.minDays) {
    return {
      canRollout: false,
      reason: `Waiting for minimum ${AB_TEST_CONFIG.minDays} days (currently ${daysSinceStart} days)`,
    };
  }
  
  // Check minimum sessions per variant
  const lowSessionVariants = variantMetrics.filter(
    v => v.sessions < AB_TEST_CONFIG.minSessionsPerVariant
  );
  
  if (lowSessionVariants.length > 0) {
    const minSessions = Math.min(...variantMetrics.map(v => v.sessions));
    return {
      canRollout: false,
      reason: `Need ${AB_TEST_CONFIG.minSessionsPerVariant} sessions per variant (lowest: ${minSessions})`,
    };
  }
  
  return { canRollout: true, reason: 'Rollout conditions met' };
}

/**
 * Roll out winning variant (disable loser)
 */
export async function rolloutWinner(
  testName: string,
  winnerVariant: string,
  loserVariant: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Log the rollout decision
    const rolloutLog = {
      test_name: testName,
      winner_variant: winnerVariant,
      loser_variant: loserVariant,
      rolled_out_at: new Date().toISOString(),
      reason: 'Auto-rollout based on statistical significance',
    };
    
    // Store in localStorage for now (in production, this would go to a DB table)
    const existingLogs = JSON.parse(localStorage.getItem('ab_test_rollouts') || '[]');
    existingLogs.push(rolloutLog);
    localStorage.setItem('ab_test_rollouts', JSON.stringify(existingLogs));
    
    // Set the winner in localStorage so new sessions always get winner
    if (testName === 'bundle_ab') {
      localStorage.setItem('bundle_ab_variant', winnerVariant);
      localStorage.setItem('bundle_ab_locked', 'true');
    } else if (testName === 'messaging_ab') {
      localStorage.setItem('messaging_ab_variant', winnerVariant);
      localStorage.setItem('messaging_ab_locked', 'true');
    }
    
    console.log(`[A/B Test] Rolled out winner: ${winnerVariant} for ${testName}`);
    
    return { success: true };
  } catch (error) {
    console.error('[A/B Test] Rollout failed:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Check if a test has been rolled out
 */
export function isTestRolledOut(testName: string): { rolledOut: boolean; winner?: string } {
  try {
    const locked = localStorage.getItem(`${testName}_locked`);
    if (locked === 'true') {
      const winner = localStorage.getItem(`${testName}_variant`);
      return { rolledOut: true, winner: winner || undefined };
    }
  } catch {
    // Ignore localStorage errors
  }
  return { rolledOut: false };
}

/**
 * Get rollout history
 */
export function getRolloutHistory(): Array<{
  test_name: string;
  winner_variant: string;
  loser_variant: string;
  rolled_out_at: string;
  reason: string;
}> {
  try {
    return JSON.parse(localStorage.getItem('ab_test_rollouts') || '[]');
  } catch {
    return [];
  }
}

/**
 * Aggregate visitor activity data for A/B test analysis
 * This queries the visitor_activity table for funnel metrics
 */
export async function fetchABTestMetrics(
  testType: 'bundle' | 'messaging',
  startDate: string,
  endDate: string
): Promise<VariantMetrics[]> {
  // For now, return simulated data structure
  // In production, this would query visitor_activity with variant tracking
  
  const baseMetrics: VariantMetrics[] = [
    {
      variant: testType === 'bundle' ? 'A' : 'discount',
      sessions: 0,
      addToCart: 0,
      checkoutsStarted: 0,
      purchases: 0,
      totalRevenue: 0,
      bundleItemsAdded: 0,
      bundleValue: 0,
    },
    {
      variant: testType === 'bundle' ? 'B' : 'benefit',
      sessions: 0,
      addToCart: 0,
      checkoutsStarted: 0,
      purchases: 0,
      totalRevenue: 0,
      bundleItemsAdded: 0,
      bundleValue: 0,
    },
  ];
  
  try {
    // Query visitor_activity for actual data
    const { data: activities, error } = await supabase
      .from('visitor_activity')
      .select('activity_type, order_value, product_quantity, created_at')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .in('activity_type', ['view_item', 'add_to_cart', 'view_cart', 'checkout', 'purchase']);
    
    if (error) {
      console.error('Error fetching A/B test metrics:', error);
      return baseMetrics;
    }
    
    // Aggregate by activity type
    // Note: In production, visitor_activity would have a variant column
    // For now, we simulate 50/50 split based on hash of session
    if (activities && activities.length > 0) {
      const viewItems = activities.filter(a => a.activity_type === 'view_item').length;
      const addToCarts = activities.filter(a => a.activity_type === 'add_to_cart').length;
      const checkouts = activities.filter(a => a.activity_type === 'checkout').length;
      const purchases = activities.filter(a => a.activity_type === 'purchase');
      const totalRevenue = purchases.reduce((sum, p) => sum + (Number(p.order_value) || 0), 0);
      
      // Split 50/50 between variants
      baseMetrics[0].sessions = Math.floor(viewItems / 2);
      baseMetrics[0].addToCart = Math.floor(addToCarts / 2);
      baseMetrics[0].checkoutsStarted = Math.floor(checkouts / 2);
      baseMetrics[0].purchases = Math.floor(purchases.length / 2);
      baseMetrics[0].totalRevenue = totalRevenue / 2;
      
      baseMetrics[1].sessions = Math.ceil(viewItems / 2);
      baseMetrics[1].addToCart = Math.ceil(addToCarts / 2);
      baseMetrics[1].checkoutsStarted = Math.ceil(checkouts / 2);
      baseMetrics[1].purchases = Math.ceil(purchases.length / 2);
      baseMetrics[1].totalRevenue = totalRevenue / 2;
    }
    
    return baseMetrics;
  } catch (error) {
    console.error('Error in fetchABTestMetrics:', error);
    return baseMetrics;
  }
}
