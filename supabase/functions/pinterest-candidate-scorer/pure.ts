// Pure classifier + request schema for pinterest-candidate-scorer.
// No Supabase, no network, no side effects — safe to import from tests
// without resolving heavy npm deps.

import { z } from "https://esm.sh/zod@3.23.8";

export const RequestSchema = z
  .object({
    run_id: z.string().uuid(),
    product_ids: z.array(z.string().uuid()).min(1).max(50),
    species_targets: z
      .object({
        cat: z.number().int().min(0).max(50).optional(),
        dog: z.number().int().min(0).max(50).optional(),
        other: z.number().int().min(0).max(50).optional(),
      })
      .optional(),
    max_candidates: z.number().int().min(1).max(50),
    max_paid_calls: z.number().int().min(0).max(50),
    max_credit_spend: z.number().min(0).max(0.5),
    use_cache: z.boolean().default(true),
    allow_tier_b_evaluation: z.boolean().default(true),
    publication_allowed: z.literal(false),
    queue_writes_allowed: z.literal(false),
  })
  .strict();

export type ScoringRequest = z.infer<typeof RequestSchema>;

export const TIER_A = {
  MIN_OCCUPANCY: 0.4,
  MIN_IDENTITY: 0.98,
  MIN_PDP_SIMILARITY: 0.97,
  MIN_SPECIES_CONF: 0.95,
} as const;

export const TIER_B = {
  MIN_IDENTITY: 0.92,
  MAX_IDENTITY: 0.98,
  MIN_PDP_SIMILARITY: 1.0,
  MIN_SPECIES_CONF: 0.98,
  MIN_OCCUPANCY: 0.4,
} as const;

export interface ScoreSignals {
  occupancy: number | null;
  identity_confidence: number | null;
  pdp_similarity: number | null;
  species_confidence: number | null;
  variant_match: boolean | null;
  color_match: boolean | null;
  shape_match: boolean | null;
  watermark_detected: boolean | null;
  supplier_text_detected: boolean | null;
  collage_detected: boolean | null;
  image_decode_status: "pass" | "fail" | "unknown";
  gallery_membership_verified: boolean;
  species_applicable: boolean;
  no_competing_variant: boolean;
  product_not_obscured: boolean;
  destination_integrity_pass: boolean;
  product_pin_integrity_pass: boolean;
}

export interface Classification {
  tier_a_result: "tier_a_ready" | "not_ready";
  tier_b_potential_result: "tier_b_canary_candidate" | "not_eligible";
  rejection_reasons: string[];
}

export type CacheCompatibilityDecision =
  | "HIT"
  | "MISS"
  | "CACHE_INCOMPATIBLE";

export interface CacheRowLike {
  cache_key?: string | null;
  scorer?: string | null;
  scoring_version?: string | null;
  image_hash?: string | null;
  pdp_hero_hash?: string | null;
  product_id?: string | null;
  result?: Record<string, unknown> | null;
  passed?: boolean | null;
  created_at?: string | null;
  last_hit_at?: string | null;
}

export interface CacheExpectation {
  product_id: string;
  image_hash: string;
  pdp_hero_hash: string;
  scorer: string;
  compatible_scoring_versions: string[];
}

export interface CacheCompatibility {
  decision: CacheCompatibilityDecision;
  reasons: string[];
  result: VisionScoreResult | null;
}

export interface VisionScoreResult {
  occupancy: number;
  identity_confidence: number;
  pdp_similarity: number;
  species_confidence: number;
  variant_match: boolean;
  color_match: boolean;
  shape_match: boolean;
  watermark_detected: boolean;
  supplier_text_detected: boolean;
  collage_detected: boolean;
}

const REQUIRED_STRUCTURED_FIELDS: Array<keyof VisionScoreResult> = [
  "occupancy",
  "identity_confidence",
  "pdp_similarity",
  "species_confidence",
  "variant_match",
  "color_match",
  "shape_match",
  "watermark_detected",
  "supplier_text_detected",
  "collage_detected",
];

const LEGACY_REQUIRED_SCORERS = [
  "occupancy",
  "identity",
  "pdp_similarity",
  "species",
  "variant_match",
  "color_match",
  "shape_match",
  "watermark",
  "supplier_text",
  "collage",
] as const;

function numberField(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function booleanField(raw: Record<string, unknown>, key: string): boolean | null {
  const value = raw[key];
  if (typeof value === "boolean") return value;
  return null;
}

function legacyValue(row: CacheRowLike): unknown {
  return row.result && Object.prototype.hasOwnProperty.call(row.result, "value")
    ? row.result.value
    : undefined;
}

function legacyPassBoolean(row: CacheRowLike): boolean | null {
  const value = legacyValue(row);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "pass" || normalized === "true") return true;
    if (normalized === "fail" || normalized === "false") return false;
  }
  if (typeof row.passed === "boolean") return row.passed;
  return null;
}

function legacyZeroMeansAbsent(row: CacheRowLike): boolean | null {
  const value = legacyValue(row);
  if (typeof value === "number") return value === 0;
  if (typeof value === "boolean") return value === false;
  if (typeof row.passed === "boolean") return row.passed;
  return null;
}

export function evaluateStructuredCacheRow(
  row: CacheRowLike | null,
  expected: CacheExpectation,
): CacheCompatibility {
  if (!row) return { decision: "MISS", reasons: ["cache_row_missing"], result: null };

  const reasons: string[] = [];
  if (row.product_id !== expected.product_id) reasons.push("product_id_mismatch");
  if (row.image_hash !== expected.image_hash) reasons.push("image_hash_mismatch");
  if (row.pdp_hero_hash !== expected.pdp_hero_hash) reasons.push("pdp_hero_hash_mismatch");
  if (row.scorer !== expected.scorer) reasons.push("scorer_mismatch");
  if (!row.scoring_version || !expected.compatible_scoring_versions.includes(row.scoring_version)) {
    reasons.push("scoring_version_incompatible");
  }

  const raw = row.result ?? {};
  const missing = REQUIRED_STRUCTURED_FIELDS.filter((field) => raw[field] == null);
  if (missing.length > 0) reasons.push(`missing_required_fields:${missing.join(",")}`);

  const result: VisionScoreResult = {
    occupancy: numberField(raw, "occupancy") ?? NaN,
    identity_confidence: numberField(raw, "identity_confidence") ?? NaN,
    pdp_similarity: numberField(raw, "pdp_similarity") ?? NaN,
    species_confidence: numberField(raw, "species_confidence") ?? NaN,
    variant_match: booleanField(raw, "variant_match") ?? false,
    color_match: booleanField(raw, "color_match") ?? false,
    shape_match: booleanField(raw, "shape_match") ?? false,
    watermark_detected: booleanField(raw, "watermark_detected") ?? false,
    supplier_text_detected: booleanField(raw, "supplier_text_detected") ?? false,
    collage_detected: booleanField(raw, "collage_detected") ?? false,
  };

  const numericBad = [
    result.occupancy,
    result.identity_confidence,
    result.pdp_similarity,
    result.species_confidence,
  ].some((n) => !Number.isFinite(n));
  if (numericBad) reasons.push("numeric_field_invalid");

  if (reasons.length > 0) return { decision: "CACHE_INCOMPATIBLE", reasons, result: null };
  return { decision: "HIT", reasons: [], result };
}

export function assembleLegacyCacheRows(
  rows: CacheRowLike[],
  expected: Omit<CacheExpectation, "scorer">,
): CacheCompatibility {
  if (rows.length === 0) return { decision: "MISS", reasons: ["legacy_cache_rows_missing"], result: null };

  const reasons: string[] = [];
  const byScorer = new Map<string, CacheRowLike>();
  for (const row of rows) {
    if (row.product_id !== expected.product_id) reasons.push(`product_id_mismatch:${row.scorer ?? "unknown"}`);
    if (row.image_hash !== expected.image_hash) reasons.push(`image_hash_mismatch:${row.scorer ?? "unknown"}`);
    if (row.pdp_hero_hash !== expected.pdp_hero_hash) reasons.push(`pdp_hero_hash_mismatch:${row.scorer ?? "unknown"}`);
    if (!row.scoring_version || !expected.compatible_scoring_versions.includes(row.scoring_version)) {
      reasons.push(`scoring_version_incompatible:${row.scorer ?? "unknown"}`);
    }
    if (row.scorer) byScorer.set(row.scorer, row);
  }

  const missing = LEGACY_REQUIRED_SCORERS.filter((scorer) => !byScorer.has(scorer));
  if (missing.length > 0) reasons.push(`missing_required_fields:${missing.join(",")}`);

  const num = (scorer: string): number | null => {
    const row = byScorer.get(scorer);
    const value = row ? legacyValue(row) : null;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  const result: VisionScoreResult = {
    occupancy: num("occupancy") ?? NaN,
    identity_confidence: num("identity") ?? NaN,
    pdp_similarity: num("pdp_similarity") ?? NaN,
    species_confidence: num("species") ?? NaN,
    variant_match: byScorer.get("variant_match") ? legacyPassBoolean(byScorer.get("variant_match")!) ?? false : false,
    color_match: byScorer.get("color_match") ? legacyPassBoolean(byScorer.get("color_match")!) ?? false : false,
    shape_match: byScorer.get("shape_match") ? legacyPassBoolean(byScorer.get("shape_match")!) ?? false : false,
    watermark_detected: byScorer.get("watermark") ? !(legacyZeroMeansAbsent(byScorer.get("watermark")!) ?? false) : true,
    supplier_text_detected: byScorer.get("supplier_text") ? !(legacyZeroMeansAbsent(byScorer.get("supplier_text")!) ?? false) : true,
    collage_detected: byScorer.get("collage") ? !(legacyZeroMeansAbsent(byScorer.get("collage")!) ?? false) : true,
  };

  const numericBad = [
    result.occupancy,
    result.identity_confidence,
    result.pdp_similarity,
    result.species_confidence,
  ].some((n) => !Number.isFinite(n));
  if (numericBad) reasons.push("numeric_field_invalid");

  if (reasons.length > 0) return { decision: "CACHE_INCOMPATIBLE", reasons: Array.from(new Set(reasons)), result: null };
  return { decision: "HIT", reasons: [], result };
}

export function classifyCandidate(
  s: ScoreSignals,
  allow_tier_b: boolean,
): Classification {
  const reasons: string[] = [];

  if (s.image_decode_status !== "pass") reasons.push("image_decode_fail");
  if (s.watermark_detected === true) reasons.push("watermark_detected");
  if (s.supplier_text_detected === true) reasons.push("supplier_text_detected");
  if (s.collage_detected === true) reasons.push("collage_detected");
  if (s.variant_match === false) reasons.push("variant_mismatch");
  if (s.color_match === false) reasons.push("color_mismatch");
  if ((s.occupancy ?? 0) < TIER_A.MIN_OCCUPANCY) reasons.push("low_occupancy");

  const hard_fail = reasons.length > 0;

  let tier_a: "tier_a_ready" | "not_ready" = "not_ready";
  const ta_reasons: string[] = [];
  if ((s.identity_confidence ?? 0) < TIER_A.MIN_IDENTITY) ta_reasons.push("identity_below_tier_a");
  if ((s.pdp_similarity ?? 0) < TIER_A.MIN_PDP_SIMILARITY) ta_reasons.push("pdp_similarity_below_tier_a");
  if (s.species_applicable && (s.species_confidence ?? 0) < TIER_A.MIN_SPECIES_CONF) ta_reasons.push("species_confidence_below_tier_a");
  if (!s.gallery_membership_verified) ta_reasons.push("gallery_membership_unverified");
  if (!hard_fail && ta_reasons.length === 0) tier_a = "tier_a_ready";
  else reasons.push(...ta_reasons);

  let tier_b: "tier_b_canary_candidate" | "not_eligible" = "not_eligible";
  if (allow_tier_b && tier_a !== "tier_a_ready" && !hard_fail) {
    const id = s.identity_confidence ?? 0;
    const ok =
      id >= TIER_B.MIN_IDENTITY &&
      id < TIER_B.MAX_IDENTITY &&
      s.gallery_membership_verified &&
      (s.pdp_similarity ?? 0) >= TIER_B.MIN_PDP_SIMILARITY &&
      s.variant_match === true &&
      s.color_match === true &&
      s.shape_match === true &&
      s.no_competing_variant &&
      s.product_not_obscured &&
      (!s.species_applicable ||
        (s.species_confidence ?? 0) >= TIER_B.MIN_SPECIES_CONF) &&
      (s.occupancy ?? 0) >= TIER_B.MIN_OCCUPANCY &&
      s.watermark_detected === false &&
      s.supplier_text_detected === false &&
      s.collage_detected === false &&
      s.destination_integrity_pass &&
      s.product_pin_integrity_pass;
    if (ok) tier_b = "tier_b_canary_candidate";
  }

  return {
    tier_a_result: tier_a,
    tier_b_potential_result: tier_b,
    rejection_reasons: Array.from(new Set(reasons)),
  };
}