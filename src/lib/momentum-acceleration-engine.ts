/**
 * Momentum Acceleration Engine
 * 45-day ranking acceleration with controlled weekly injections, CTR tactics, volatility monitoring
 */

export interface AccelerationTarget {
  slug: string;
  cluster: 'dog-beds' | 'cat-litter';
  currentPosition: number;
  currentImpressions: number;
  currentCTR: number;
}

export interface WeeklyInjectionPlan {
  week: 1 | 2;
  contextualLinks: number;
  comparisonTable: boolean;
  faqQuestionsToAdd: number;
  introClarity: boolean;
  snippetAnswer: boolean;
}

export const ROTATION_CYCLE_DAYS = 14;
export const TOTAL_ACCELERATION_DAYS = 45;
export const MAX_WEEKLY_INJECTIONS = 10;

export function selectAccelerationTargets(
  dogBedsPages: Array<{ slug: string; position: number; impressions: number }>,
  catLitterPages: Array<{ slug: string; position: number; impressions: number }>
): { dogBeds: AccelerationTarget | null; catLitter: AccelerationTarget | null } {
  const dogBedsCandidate = dogBedsPages
    .filter(p => p.position < 30)
    .sort((a, b) => b.impressions - a.impressions)[0];

  const catLitterCandidate = catLitterPages
    .filter(p => p.position < 30)
    .sort((a, b) => b.impressions - a.impressions)[0];

  return {
    dogBeds: dogBedsCandidate
      ? { slug: dogBedsCandidate.slug, cluster: 'dog-beds', currentPosition: dogBedsCandidate.position, currentImpressions: dogBedsCandidate.impressions, currentCTR: 0 }
      : null,
    catLitter: catLitterCandidate
      ? { slug: catLitterCandidate.slug, cluster: 'cat-litter', currentPosition: catLitterCandidate.position, currentImpressions: catLitterCandidate.impressions, currentCTR: 0 }
      : null,
  };
}

export function generateWeeklyInjectionPlan(weekInCycle: 1 | 2): WeeklyInjectionPlan {
  if (weekInCycle === 1) {
    return { week: 1, contextualLinks: 4, comparisonTable: true, faqQuestionsToAdd: 2, introClarity: false, snippetAnswer: false };
  }
  return { week: 2, contextualLinks: 3, comparisonTable: false, faqQuestionsToAdd: 0, introClarity: true, snippetAnswer: true };
}

export function shouldTriggerCTRMomentum(position: number): boolean {
  return position >= 15 && position <= 25;
}

export function shouldTriggerSnippetAcceleration(position: number): boolean {
  return position >= 8 && position <= 15;
}

export function analyzeImpressionDelta(prev: number, current: number) {
  const deltaPercent = prev > 0 ? Math.round(((current - prev) / prev) * 100) : 0;
  let trigger: 'boost' | 'pause' | 'none' = 'none';
  if (deltaPercent > 25) trigger = 'boost';
  else if (deltaPercent < -20) trigger = 'pause';
  return { previousWeekImpressions: prev, currentWeekImpressions: current, deltaPercent, trigger, actions: [] };
}

export function calculateVolatilityScore(positionHistory: number[], impressionHistory: number[], ctrHistory: number[]): number {
  const calcStdDev = (arr: number[]) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  };
  const posScore = Math.min(100, (calcStdDev(positionHistory) / 5) * 100);
  const impScore = Math.min(100, (calcStdDev(impressionHistory) / 50) * 100);
  const ctrScore = Math.min(100, (calcStdDev(ctrHistory) / 2) * 100);
  return Math.round((posScore * 0.4 + impScore * 0.35 + ctrScore * 0.25) / 3);
}

export function assessVolatilityRisk(volatilityScore: number) {
  if (volatilityScore < 30) return { riskLevel: 'low' as const, recommendation: 'Proceed with full acceleration plan.' };
  if (volatilityScore < 60) return { riskLevel: 'medium' as const, recommendation: 'Reduce injections by 25% next cycle.' };
  return { riskLevel: 'high' as const, recommendation: 'Reduce injections by 50% next cycle.' };
}

export function calculate45DayProgress(startDate: string, pagesInTop20: number, pagesInTop15: number, avgInboundLinks: number) {
  const daysElapsed = Math.floor((new Date().getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, TOTAL_ACCELERATION_DAYS - daysElapsed);
  const progressPercent = Math.min(100, (daysElapsed / TOTAL_ACCELERATION_DAYS) * 100);
  return {
    daysElapsed,
    daysRemaining,
    progressPercent,
    targets: {
      top20Met: pagesInTop20 >= 2,
      top15Met: pagesInTop15 >= 1,
      inboundLinksMet: avgInboundLinks >= 8,
      volatilityMet: true,
    },
  };
}
