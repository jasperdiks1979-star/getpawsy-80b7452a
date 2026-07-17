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