/**
 * Guide Title A/B Experiment System
 * 
 * SEO-safe: rotates on fixed weekly intervals (same for ALL users).
 * Never per-user randomization (prevents cloaking).
 * Decision rules: winner at >=300 impressions or 14 days with >=15% CTR uplift.
 */

// ============= TYPES =============

export interface TitleVariant {
  id: 'A' | 'B';
  title: string;
  metaDescription: string;
}

export interface GuideExperiment {
  slug: string;
  status: 'running' | 'completed' | 'paused';
  startDate: string; // ISO date
  activeVariant: 'A' | 'B';
  variantA: TitleVariant;
  variantB: TitleVariant;
  rotationIntervalDays: 7;
  metrics: {
    A: VariantMetrics;
    B: VariantMetrics;
  };
  winner?: 'A' | 'B' | null;
  winnerDecidedAt?: string;
  decisionReason?: string;
}

export interface VariantMetrics {
  impressions: number;
  clicks: number;
  ctr: number; // percentage
  avgPosition: number;
  startDate: string;
  endDate: string;
}

// ============= EXPERIMENT CONFIGURATIONS =============

export const GUIDE_EXPERIMENTS: GuideExperiment[] = [
  {
    slug: 'best-cat-litter-box-2026',
    status: 'running',
    startDate: '2026-02-10',
    activeVariant: 'A',
    rotationIntervalDays: 7,
    variantA: {
      id: 'A',
      title: 'Best Cat Litter Box (2026) – 12 Tested Picks for Odor Control, Large & Multi-Cat Homes',
      metaDescription: 'We tested the best cat litter boxes of 2026 for odor control, large breeds, and multi-cat homes. Compare features, pros & cons, and find your perfect fit in minutes.',
    },
    variantB: {
      id: 'B',
      title: '12 Best Cat Litter Boxes (2026) – Tested for Odor, Space & Big Cats | Pros & Cons',
      metaDescription: 'Reviewed & tested: the 12 best cat litter boxes of 2026. Real owner picks for odor control, large cats & small spaces. See pros, cons & our #1 pick.',
    },
    metrics: {
      A: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '2026-02-10', endDate: '' },
      B: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '', endDate: '' },
    },
  },
  {
    slug: 'how-many-litter-boxes-per-cat',
    status: 'running',
    startDate: '2026-02-10',
    activeVariant: 'A',
    rotationIntervalDays: 7,
    variantA: {
      id: 'A',
      title: 'How Many Litter Boxes Per Cat? The N+1 Rule Explained (2026) – Vet-Backed Guide',
      metaDescription: 'How many litter boxes do you need? Vets recommend the N+1 rule. We explain placement, multi-cat setups, and common mistakes with real owner tips.',
    },
    variantB: {
      id: 'B',
      title: 'How Many Litter Boxes Do You Really Need? N+1 Rule Tested for Multi-Cat Homes',
      metaDescription: 'Tested the N+1 litter box rule in real multi-cat homes. Find out how many boxes you need, where to place them & what mistakes to avoid. With pros & cons.',
    },
    metrics: {
      A: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '2026-02-10', endDate: '' },
      B: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '', endDate: '' },
    },
  },
  {
    slug: 'best-cat-litter-box-furniture-enclosures-2026',
    status: 'running',
    startDate: '2026-02-10',
    activeVariant: 'A',
    rotationIntervalDays: 7,
    variantA: {
      id: 'A',
      title: 'Best Cat Litter Box Furniture & Enclosures (2026) – Reviewed & Tested for Every Home',
      metaDescription: 'We reviewed the best litter box furniture and enclosures for 2026. Hidden designs, real owner feedback, and picks for small apartments to large homes.',
    },
    variantB: {
      id: 'B',
      title: '9 Best Litter Box Furniture Enclosures (2026) – Tested, Reviewed With Pros & Cons',
      metaDescription: '9 litter box enclosures tested in real homes. Discover which furniture hides your cat\'s box best. Pros, cons & our top picks for every budget.',
    },
    metrics: {
      A: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '2026-02-10', endDate: '' },
      B: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '', endDate: '' },
    },
  },
  {
    slug: 'best-litter-boxes-multi-cat',
    status: 'running',
    startDate: '2026-02-10',
    activeVariant: 'A',
    rotationIntervalDays: 7,
    variantA: {
      id: 'A',
      title: 'Best Litter Boxes for Multiple Cats (2026) – Tested Picks With Pros & Cons',
      metaDescription: 'Own 2+ cats? We tested the best litter boxes for multi-cat households. Compare size, odor control & durability. Real owner picks with pros & cons.',
    },
    variantB: {
      id: 'B',
      title: '7 Best Multi-Cat Litter Boxes (2026) – Real Owner Reviews, Tested for Odor & Space',
      metaDescription: 'Tested & reviewed: 7 best litter boxes for multiple cats in 2026. See which handles odor, space & heavy use best. Includes budget & premium picks.',
    },
    metrics: {
      A: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '2026-02-10', endDate: '' },
      B: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '', endDate: '' },
    },
  },
  {
    slug: 'best-extra-large-litter-boxes',
    status: 'running',
    startDate: '2026-02-10',
    activeVariant: 'A',
    rotationIntervalDays: 7,
    variantA: {
      id: 'A',
      title: 'Best Extra Large Litter Boxes for Big Cats (2026) – Tested for Maine Coons & Large Breeds',
      metaDescription: 'Need a bigger litter box? We tested extra-large options for Maine Coons and large breeds. Compare dimensions, materials & real owner feedback.',
    },
    variantB: {
      id: 'B',
      title: '8 Best XL Litter Boxes (2026) – Tested for Maine Coons, Large Cats | With Pros & Cons',
      metaDescription: '8 extra-large litter boxes tested with big cats. See which fits Maine Coons best, with real measurements, pros & cons, and our #1 pick for 2026.',
    },
    metrics: {
      A: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '2026-02-10', endDate: '' },
      B: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '', endDate: '' },
    },
  },
  {
    slug: 'best-cat-trees-small-apartments',
    status: 'running',
    startDate: '2026-02-10',
    activeVariant: 'A',
    rotationIntervalDays: 7,
    variantA: {
      id: 'A',
      title: 'Best Cat Trees for Small Apartments (2026) – Space-Saving Picks, Tested & Reviewed',
      metaDescription: 'Living small? We tested the best cat trees for apartments and small spaces. Compact, stylish picks with real owner reviews and space-saving tips.',
    },
    variantB: {
      id: 'B',
      title: '10 Best Cat Trees for Small Spaces (2026) – Tested in Real Apartments | Pros & Cons',
      metaDescription: '10 cat trees tested in real small apartments. Find the best space-saving cat tree for your home. Includes wall-mounted, corner & compact floor models.',
    },
    metrics: {
      A: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '2026-02-10', endDate: '' },
      B: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0, startDate: '', endDate: '' },
    },
  },
];

// ============= ROTATION LOGIC =============

/**
 * Determine which variant should be active based on the current date.
 * Uses week-based rotation: same variant for ALL users during a given week.
 * This prevents cloaking issues.
 */
export function getActiveVariant(experiment: GuideExperiment): 'A' | 'B' {
  // If experiment is completed, return the winner
  if (experiment.status === 'completed' && experiment.winner) {
    return experiment.winner;
  }

  const start = new Date(experiment.startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / experiment.rotationIntervalDays);

  // Even weeks = A, odd weeks = B
  return weekNumber % 2 === 0 ? 'A' : 'B';
}

/**
 * Get the current title and meta for a guide based on experiment state
 */
export function getExperimentVariant(slug: string): TitleVariant | null {
  const experiment = GUIDE_EXPERIMENTS.find(e => e.slug === slug);
  if (!experiment) return null;

  const activeId = getActiveVariant(experiment);
  return activeId === 'A' ? experiment.variantA : experiment.variantB;
}

// ============= DECISION RULES =============

export interface ExperimentDecision {
  shouldDecide: boolean;
  winner: 'A' | 'B' | null;
  reason: string;
  uplift: number; // percentage
}

const MIN_IMPRESSIONS = 300;
const MIN_DAYS = 14;
const MIN_UPLIFT_PCT = 15;

/**
 * Evaluate whether an experiment has enough data to declare a winner.
 */
export function evaluateExperiment(experiment: GuideExperiment): ExperimentDecision {
  const { A, B } = experiment.metrics;

  // Check if enough data
  const hasEnoughImpressions = A.impressions >= MIN_IMPRESSIONS && B.impressions >= MIN_IMPRESSIONS;
  const daysSinceStart = Math.floor(
    (Date.now() - new Date(experiment.startDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const hasEnoughDays = daysSinceStart >= MIN_DAYS;

  if (!hasEnoughImpressions && !hasEnoughDays) {
    return {
      shouldDecide: false,
      winner: null,
      reason: `Need ${MIN_IMPRESSIONS} impressions per variant or ${MIN_DAYS} days. Currently: A=${A.impressions}, B=${B.impressions}, ${daysSinceStart} days.`,
      uplift: 0,
    };
  }

  // Both need some data
  if (A.impressions === 0 || B.impressions === 0) {
    return {
      shouldDecide: false,
      winner: null,
      reason: 'One variant has no data yet.',
      uplift: 0,
    };
  }

  // Calculate CTR uplift
  const ctrA = A.clicks / A.impressions * 100;
  const ctrB = B.clicks / B.impressions * 100;
  const baseline = Math.max(ctrA, ctrB) === ctrA ? ctrA : ctrB;
  const challenger = baseline === ctrA ? ctrB : ctrA;
  const uplift = baseline > 0 ? ((Math.max(ctrA, ctrB) - Math.min(ctrA, ctrB)) / Math.min(ctrA, ctrB)) * 100 : 0;

  if (uplift >= MIN_UPLIFT_PCT) {
    const winner = ctrA > ctrB ? 'A' : 'B';
    return {
      shouldDecide: true,
      winner,
      reason: `Variant ${winner} wins with ${uplift.toFixed(1)}% CTR uplift (A: ${ctrA.toFixed(2)}%, B: ${ctrB.toFixed(2)}%).`,
      uplift,
    };
  }

  return {
    shouldDecide: hasEnoughImpressions || hasEnoughDays,
    winner: null,
    reason: `Uplift only ${uplift.toFixed(1)}% (need ${MIN_UPLIFT_PCT}%). Keeping A, will auto-generate new B.`,
    uplift,
  };
}

/**
 * Get all experiments with their current status and decisions
 */
export function getExperimentsSummary(): Array<GuideExperiment & { decision: ExperimentDecision; currentVariant: 'A' | 'B' }> {
  return GUIDE_EXPERIMENTS.map(exp => ({
    ...exp,
    decision: evaluateExperiment(exp),
    currentVariant: getActiveVariant(exp),
  }));
}
