/**
 * Organic Confidence — primary executive KPI for the Revenue Operating
 * System. Answers the only question that matters for long-term business
 * health:
 *
 *     "What would still sell if we stopped all advertising today?"
 *
 * RULES:
 * - Inputs MUST come from Layer 1 (Organic Truth) + market evidence only.
 * - Paid traffic, ad spend, ROAS, CPA, CPC, CPM, paid impressions are
 *   FORBIDDEN as positive inputs. Paid presence may only contribute a
 *   *penalty* via the `paid_dependence` ratio, never as positive evidence.
 *
 * The weights, thresholds and market-demand boost are NOT hardcoded — they
 * are loaded from the configurable `organic_confidence_models` table (see
 * the `organic-confidence-config` edge function). This module only ships a
 * compatibility fallback so the lib keeps working if the model fetch fails.
 *
 * See: mem://architecture/organic-confidence-kpi
 */

export const ORGANIC_CONFIDENCE_FALLBACK_WEIGHTS = {
  organic_visitors: 0.15,
  organic_engagement: 0.20,
  organic_conversion: 0.25,
  organic_revenue: 0.15,
  returning_quality: 0.10,
  paid_independence: 0.15,
} as const;
/** @deprecated Use the active model from `organic_confidence_models`. */
export const ORGANIC_CONFIDENCE_WEIGHTS = ORGANIC_CONFIDENCE_FALLBACK_WEIGHTS;

export type OrganicConfidenceWeights = Record<string, number>;

export interface OrganicConfidenceThresholds {
  emerging?:        { min_visitors?: number; min_score?: number };
  validated?:       { min_visitors?: number; min_score?: number; min_purchases?: number; min_atc_rate?: number };
  organic_winner?:  { min_purchases?: number; min_score?: number };
  scale_candidate?: { min_purchases?: number; min_score?: number; min_cvr?: number; max_paid_share?: number };
}

export const ORGANIC_CONFIDENCE_FALLBACK_THRESHOLDS: OrganicConfidenceThresholds = {
  emerging:        { min_visitors: 10, min_score: 20 },
  validated:       { min_visitors: 50, min_score: 45, min_purchases: 1, min_atc_rate: 0.05 },
  organic_winner:  { min_purchases: 2, min_score: 65 },
  scale_candidate: { min_purchases: 3, min_score: 80, min_cvr: 0.02, max_paid_share: 0.5 },
};
export const ORGANIC_CONFIDENCE_FALLBACK_MARKET_BOOST = 5;

export interface OrganicConfidenceModel {
  version: number;
  weights: OrganicConfidenceWeights;
  negative_weights?: OrganicConfidenceWeights;
  thresholds: OrganicConfidenceThresholds;
  market_demand_boost: number;
}

export const FALLBACK_ORGANIC_CONFIDENCE_MODEL: OrganicConfidenceModel = {
  version: 0,
  weights: { ...ORGANIC_CONFIDENCE_FALLBACK_WEIGHTS },
  thresholds: ORGANIC_CONFIDENCE_FALLBACK_THRESHOLDS,
  market_demand_boost: ORGANIC_CONFIDENCE_FALLBACK_MARKET_BOOST,
};

export type OrganicConfidenceLevel =
  | "hypothesis"
  | "emerging"
  | "validated"
  | "organic_winner"
  | "scale_candidate";

export interface OrganicConfidenceInput {
  organic_visitors: number;
  organic_product_views: number;
  organic_add_to_cart: number;
  organic_purchases: number;
  organic_revenue: number;
  organic_returning_sessions: number;
  paid_visitors: number;            // ONLY used to compute dependence penalty
  market_demand_index?: number;     // 0..1 trends-based boost (optional)
  /** Optional configurable negative-signal values, each 0..1. */
  negatives?: Record<string, number>;
}

export interface OrganicConfidenceResult {
  score: number;                    // 0..100
  level: OrganicConfidenceLevel;
  level_index: 1 | 2 | 3 | 4 | 5;
  reasons: string[];
  components: Record<string, number>;
  paid_share: number;
  organic_conversion_rate: number;
  recommended_action: string;
  evidence_source: "organic_behaviour" | "market_demand" | "blended";
  model_version: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const log01 = (n: number, ceiling: number) =>
  clamp01(Math.log1p(Math.max(0, n)) / Math.log1p(ceiling));

export function scoreOrganicConfidence(
  input: OrganicConfidenceInput,
  model: OrganicConfidenceModel = FALLBACK_ORGANIC_CONFIDENCE_MODEL,
): OrganicConfidenceResult {
  const totalAcq = input.organic_visitors + input.paid_visitors;
  const paid_share = totalAcq > 0 ? input.paid_visitors / totalAcq : 0;

  const view_rate = input.organic_visitors > 0
    ? clamp01(input.organic_product_views / input.organic_visitors) : 0;
  const atc_rate = input.organic_product_views > 0
    ? clamp01(input.organic_add_to_cart / input.organic_product_views) : 0;
  const cvr = input.organic_product_views > 0
    ? clamp01(input.organic_purchases / input.organic_product_views) : 0;

  const components: Record<string, number> = {
    organic_visitors:   log01(input.organic_visitors, 1000),
    organic_engagement: 0.5 * view_rate + 0.5 * Math.min(1, atc_rate * 8),
    organic_conversion: Math.min(1, cvr * 25),
    organic_revenue:    log01(input.organic_revenue, 5000),
    returning_quality:  log01(input.organic_returning_sessions, 200),
    paid_independence:  clamp01(1 - paid_share),
  };

  const weights = model.weights ?? ORGANIC_CONFIDENCE_FALLBACK_WEIGHTS;
  let score = 0;
  for (const [k, w] of Object.entries(weights)) {
    const c = components[k] ?? 0;
    score += c * Number(w) * 100;
  }
  // Negative signals (configurable). Each value 0..1 from `input.negatives`.
  if (input.negatives && model.negative_weights) {
    for (const [k, w] of Object.entries(model.negative_weights)) {
      const v = clamp01(Number(input.negatives[k] ?? 0));
      score -= v * Number(w) * 100;
    }
  }
  const boost = Number(model.market_demand_boost ?? 0);
  if (typeof input.market_demand_index === "number" && boost > 0) {
    score = Math.min(100, score + clamp01(input.market_demand_index) * boost);
  }
  score = Math.max(0, Math.min(100, score));

  const reasons: string[] = [];
  if (input.organic_visitors >= 50) reasons.push("✓ Real organic reach");
  if (view_rate >= 0.3) reasons.push("✓ Strong organic CTR to PDP");
  if (cvr >= 0.01) reasons.push("✓ Organic conversion above baseline");
  if (input.organic_returning_sessions >= 5) reasons.push("✓ Returning visitors");
  if (paid_share <= 0.2) reasons.push("✓ Minimal advertising dependence");
  if (input.organic_purchases >= 2) reasons.push("✓ Repeatable organic sales");
  if (paid_share >= 0.6) reasons.push("✗ High paid dependence");
  if (input.organic_visitors < 10) reasons.push("✗ Insufficient organic evidence");

  const t = { ...ORGANIC_CONFIDENCE_FALLBACK_THRESHOLDS, ...(model.thresholds ?? {}) };
  let level: OrganicConfidenceLevel = "hypothesis";
  let level_index: 1 | 2 | 3 | 4 | 5 = 1;
  if (input.organic_visitors >= (t.emerging?.min_visitors ?? 10) &&
      score >= (t.emerging?.min_score ?? 20)) { level = "emerging"; level_index = 2; }
  if (input.organic_visitors >= (t.validated?.min_visitors ?? 50) &&
      score >= (t.validated?.min_score ?? 45) &&
      (input.organic_purchases >= (t.validated?.min_purchases ?? 1) ||
       atc_rate >= (t.validated?.min_atc_rate ?? 0.05))) { level = "validated"; level_index = 3; }
  if (input.organic_purchases >= (t.organic_winner?.min_purchases ?? 2) &&
      score >= (t.organic_winner?.min_score ?? 65)) { level = "organic_winner"; level_index = 4; }
  if (input.organic_purchases >= (t.scale_candidate?.min_purchases ?? 3) &&
      cvr >= (t.scale_candidate?.min_cvr ?? 0.02) &&
      score >= (t.scale_candidate?.min_score ?? 80) &&
      paid_share <= (t.scale_candidate?.max_paid_share ?? 0.5)) {
    level = "scale_candidate"; level_index = 5;
  }

  const recommended_action =
    level_index === 5 ? "Scale with Pinterest Organic, then add paid amplification"
    : level_index === 4 ? "Promote organically across boards and refresh creatives"
    : level_index === 3 ? "Add fresh organic content + improve PDP / SEO"
    : level_index === 2 ? "Generate more creatives, test new hooks, gather evidence"
    : "Hold for evidence — produce content, do not allocate paid budget";

  const evidence_source: OrganicConfidenceResult["evidence_source"] =
    input.organic_visitors >= 10 ? "organic_behaviour"
    : typeof input.market_demand_index === "number" ? "market_demand"
    : "blended";

  return {
    score: Math.round(score * 100) / 100,
    level, level_index,
    reasons,
    components,
    paid_share,
    organic_conversion_rate: cvr,
    recommended_action,
    evidence_source,
    model_version: model.version,
  };
}

export const ORGANIC_CONFIDENCE_LEVEL_LABELS: Record<OrganicConfidenceLevel, string> = {
  hypothesis:      "L1 · Hypothesis",
  emerging:        "L2 · Emerging",
  validated:       "L3 · Validated",
  organic_winner:  "L4 · Organic Winner",
  scale_candidate: "L5 · Scale Candidate",
};
