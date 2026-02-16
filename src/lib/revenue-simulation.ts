/**
 * GetPawsy — US-Only Revenue Simulation Engine
 * 
 * Projects 30/60/90 day revenue uplift from SEO + CRO improvements.
 * ALL inputs must be US-only, Google organic + Shopping traffic only.
 * Excludes: NL traffic, direct traffic, test purchases, non-US sessions.
 */

export interface SimulationInputs {
  /** Current US Google organic impressions (28-day) */
  usImpressions: number;
  /** Current CTR (decimal, e.g. 0.012) */
  ctr: number;
  /** Current conversion rate (decimal, e.g. 0.015) */
  cvr: number;
  /** Average order value in USD */
  aov: number;
  /** LCP improvement factor (e.g. 0.10 = 10% session quality uplift) */
  lcpImpactFactor: number;
  /** Feed CTR uplift from title/desc optimization (e.g. 0.15 = 15%) */
  feedCtrUplift: number;
}

export interface ScenarioResult {
  label: string;
  impressionGrowth: number;
  newCtr: number;
  newCvr: number;
  projectedSessions: number;
  projectedOrders: number;
  projectedRevenue: number;
  revenueUpliftPct: number;
  incrementalRevenue: number;
}

export interface SimulationOutput {
  baseline: {
    sessions: number;
    orders: number;
    revenue: number;
  };
  scenarios: {
    conservative: ScenarioResult;
    expected: ScenarioResult;
    aggressive: ScenarioResult;
  };
  confidenceLevel: string;
  primaryGrowthDriver: string;
  dataPolicy: string;
}

const SCENARIO_MULTIPLIERS = {
  conservative: {
    impressionGrowth: { d30: 0.03, d60: 0.07, d90: 0.10 },
    ctrUplift: 0.00,
    cvrUplift: 0.02,
  },
  expected: {
    impressionGrowth: { d30: 0.06, d60: 0.12, d90: 0.18 },
    ctrUplift: 0.025,
    cvrUplift: 0.035,
  },
  aggressive: {
    impressionGrowth: { d30: 0.10, d60: 0.20, d90: 0.30 },
    ctrUplift: 0.05,
    cvrUplift: 0.05,
  },
} as const;

type ScenarioMultipliers = {
  impressionGrowth: { d30: number; d60: number; d90: number };
  ctrUplift: number;
  cvrUplift: number;
};

function projectScenario(
  inputs: SimulationInputs,
  label: string,
  multipliers: ScenarioMultipliers,
  days: 30 | 60 | 90,
): ScenarioResult {
  const dKey = `d${days}` as 'd30' | 'd60' | 'd90';
  const impGrowth = multipliers.impressionGrowth[dKey];
  
  const newImpressions = Math.round(inputs.usImpressions * (1 + impGrowth));
  const newCtr = inputs.ctr * (1 + multipliers.ctrUplift + inputs.feedCtrUplift);
  const newCvr = inputs.cvr * (1 + multipliers.cvrUplift + inputs.lcpImpactFactor);
  
  const sessions = Math.round(newImpressions * newCtr);
  const orders = Math.round(sessions * newCvr);
  const revenue = orders * inputs.aov;
  
  const baselineSessions = Math.round(inputs.usImpressions * inputs.ctr);
  const baselineOrders = Math.round(baselineSessions * inputs.cvr);
  const baselineRevenue = baselineOrders * inputs.aov;
  
  const upliftPct = baselineRevenue > 0 ? ((revenue - baselineRevenue) / baselineRevenue) * 100 : 0;
  
  return {
    label,
    impressionGrowth: impGrowth,
    newCtr,
    newCvr,
    projectedSessions: sessions,
    projectedOrders: orders,
    projectedRevenue: revenue,
    revenueUpliftPct: Math.round(upliftPct * 10) / 10,
    incrementalRevenue: Math.round((revenue - baselineRevenue) * 100) / 100,
  };
}

export function runSimulation(inputs: SimulationInputs, days: 30 | 60 | 90 = 90): SimulationOutput {
  const baselineSessions = Math.round(inputs.usImpressions * inputs.ctr);
  const baselineOrders = Math.round(baselineSessions * inputs.cvr);
  const baselineRevenue = baselineOrders * inputs.aov;

  const conservative = projectScenario(inputs, 'Conservative', SCENARIO_MULTIPLIERS.conservative, days);
  const expected = projectScenario(inputs, 'Expected', SCENARIO_MULTIPLIERS.expected, days);
  const aggressive = projectScenario(inputs, 'Aggressive', SCENARIO_MULTIPLIERS.aggressive, days);

  // Determine primary growth driver
  const ctrImpact = inputs.feedCtrUplift;
  const cvrImpact = inputs.lcpImpactFactor;
  const impImpact = SCENARIO_MULTIPLIERS.expected.impressionGrowth[`d${days}`];
  
  let primaryDriver = 'Impression Growth (SEO Authority)';
  if (ctrImpact > impImpact && ctrImpact > cvrImpact) primaryDriver = 'Feed CTR Optimization';
  else if (cvrImpact > impImpact) primaryDriver = 'CWV / Conversion Rate Improvement';

  return {
    baseline: { sessions: baselineSessions, orders: baselineOrders, revenue: baselineRevenue },
    scenarios: { conservative, expected, aggressive },
    confidenceLevel: inputs.usImpressions > 5000 ? 'Medium' : 'Low',
    primaryGrowthDriver: primaryDriver,
    dataPolicy: 'US-only, Google organic + Shopping. Excludes NL, direct, test, non-US.',
  };
}

/** Default inputs based on current GetPawsy US metrics */
export const DEFAULT_INPUTS: SimulationInputs = {
  usImpressions: 8000,
  ctr: 0.012,
  cvr: 0.015,
  aov: 35,
  lcpImpactFactor: 0.05,
  feedCtrUplift: 0.10,
};
