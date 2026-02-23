/**
 * SERP War Revenue Model — Per-Cluster Revenue Projections
 * 
 * Models organic revenue at Conservative (pos 6–8), Growth (pos 3–5),
 * and Domination (pos 1–2) scenarios for each priority keyword cluster.
 * 
 * CTR curve source: Advanced Web Ranking / Sistrix aggregated US data.
 */

// ── CTR by position (US organic, commercial intent, mobile+desktop blended) ──
const CTR_CURVE: Record<number, number> = {
  1: 0.275,
  2: 0.158,
  3: 0.110,
  4: 0.080,
  5: 0.062,
  6: 0.048,
  7: 0.038,
  8: 0.031,
  9: 0.026,
  10: 0.022,
};

export interface ClusterRevenueInput {
  cluster: string;
  slug: string;
  /** Estimated US monthly search volume (sum of cluster keywords) */
  monthlySearchVolume: number;
  /** Current estimated average position */
  currentPosition: number;
  /** Average order value in USD */
  aov: number;
  /** Monthly fixed costs (hosting, tools, content) for break-even calc */
  monthlyCost: number;
}

export interface ScenarioProjection {
  label: string;
  positionRange: string;
  avgPosition: number;
  estimatedCtr: number;
  monthlyClicks: number;
  /** 3 CVR scenarios */
  conversions: {
    conservative: { cvr: number; orders: number; revenue: number };
    moderate: { cvr: number; orders: number; revenue: number };
    optimistic: { cvr: number; orders: number; revenue: number };
  };
  /** Using moderate CVR */
  expectedMonthlyRevenue: number;
  annualRevenue: number;
  breakEvenMonths: number | null;
  first10SalesDays: number;
}

export interface ClusterRevenueReport {
  cluster: string;
  slug: string;
  searchVolume: number;
  aov: number;
  currentPosition: number;
  currentMonthlyRevenue: number;
  scenarios: {
    conservative: ScenarioProjection;
    growth: ScenarioProjection;
    domination: ScenarioProjection;
  };
  revenueUpliftAtDomination: number;
  revenueUpliftPct: number;
}

function getCtr(position: number): number {
  const floored = Math.max(1, Math.min(10, Math.round(position)));
  return CTR_CURVE[floored] || 0.015;
}

function buildScenario(
  label: string,
  posRange: string,
  avgPos: number,
  input: ClusterRevenueInput,
): ScenarioProjection {
  const ctr = getCtr(avgPos);
  const clicks = Math.round(input.monthlySearchVolume * ctr);

  const cvrs = [
    { label: 'conservative', cvr: 0.008 },
    { label: 'moderate', cvr: 0.015 },
    { label: 'optimistic', cvr: 0.025 },
  ] as const;

  const conversions = {} as ScenarioProjection['conversions'];
  for (const c of cvrs) {
    const orders = Math.round(clicks * c.cvr * 100) / 100;
    conversions[c.label] = {
      cvr: c.cvr,
      orders: Math.round(orders),
      revenue: Math.round(orders * input.aov),
    };
  }

  const expectedRevenue = conversions.moderate.revenue;
  const annualRevenue = expectedRevenue * 12;
  const breakEvenMonths = expectedRevenue > 0
    ? Math.ceil(input.monthlyCost / expectedRevenue) || null
    : null;

  // Days to first 10 sales at moderate CVR
  const dailyOrders = conversions.moderate.orders / 30;
  const first10Days = dailyOrders > 0 ? Math.ceil(10 / dailyOrders) : 999;

  return {
    label,
    positionRange: posRange,
    avgPosition: avgPos,
    estimatedCtr: ctr,
    monthlyClicks: clicks,
    conversions,
    expectedMonthlyRevenue: expectedRevenue,
    annualRevenue,
    breakEvenMonths,
    first10SalesDays: first10Days,
  };
}

export function simulateClusterRevenue(input: ClusterRevenueInput): ClusterRevenueReport {
  const currentCtr = getCtr(input.currentPosition);
  const currentClicks = Math.round(input.monthlySearchVolume * currentCtr);
  const currentRevenue = Math.round(currentClicks * 0.015 * input.aov);

  const conservative = buildScenario('Conservative', 'Position 6–8', 7, input);
  const growth = buildScenario('Growth', 'Position 3–5', 4, input);
  const domination = buildScenario('Domination', 'Position 1–2', 1.5, input);

  const domRev = domination.expectedMonthlyRevenue;

  return {
    cluster: input.cluster,
    slug: input.slug,
    searchVolume: input.monthlySearchVolume,
    aov: input.aov,
    currentPosition: input.currentPosition,
    currentMonthlyRevenue: currentRevenue,
    scenarios: { conservative, growth, domination },
    revenueUpliftAtDomination: domRev - currentRevenue,
    revenueUpliftPct: currentRevenue > 0 ? Math.round(((domRev - currentRevenue) / currentRevenue) * 100) : 999,
  };
}

// ── Priority Cluster Inputs ──

export const PRIORITY_CLUSTER_INPUTS: ClusterRevenueInput[] = [
  {
    cluster: 'Orthopedic Dog Beds',
    slug: 'orthopedic-dog-beds',
    monthlySearchVolume: 14800,
    currentPosition: 12,
    aov: 65,
    monthlyCost: 200,
  },
  {
    cluster: 'Cat Trees for Large Cats',
    slug: 'cat-trees-for-large-cats',
    monthlySearchVolume: 9200,
    currentPosition: 15,
    aov: 120,
    monthlyCost: 200,
  },
  {
    cluster: 'Dog Car Travel Safety',
    slug: 'dog-car-travel-safety',
    monthlySearchVolume: 6400,
    currentPosition: 18,
    aov: 55,
    monthlyCost: 200,
  },
];

export function runFullRevenueSimulation(): ClusterRevenueReport[] {
  return PRIORITY_CLUSTER_INPUTS.map(simulateClusterRevenue);
}
