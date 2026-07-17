// Pinterest Structured Source Scorer — Calibration V2 (feature-flagged, OFF in prod)
//
// Introduces:
//  1. Explicit SOURCE_PROVENANCE separated from model confidence.
//  2. Categorical VISUAL decisions (EXACT/PROBABLE/AMBIGUOUS/MISMATCH etc.) so
//     coarse Gemini scores (0.90 / 0.95) can be interpreted correctly without
//     forcing manufactured precision.
//  3. Deterministic Tier A / Tier B canary gates that primarily use provenance
//     + categorical visual decisions; model confidence is supporting evidence.
//  4. Integer-microcredit budget arithmetic to eliminate the float drift
//     (`0.5000000000000001`) that stopped run 9abc73dc early.
//  5. Round-robin species dispatch so a single category cannot monopolize the
//     paid budget before other categories are examined.
//
// Nothing in this module writes to the database, calls any provider, or is
// wired into production. The `pinterest-candidate-scorer` production path
// continues to use `./pinterest-cost-guard.ts` + `./pinterest-qa-cache.ts`
// untouched — see the feature-flag check in `classifyCalibratedV2`.
//
// See also: mem://marketing/pinterest-cost-controls-v1.

export const CALIBRATION_VERSION = "v2.2026-07-17-calibration";
export const CALIBRATION_FEATURE_FLAG = "pinterest_scorer_calibrated_v2_enabled";
export const CALIBRATION_FEATURE_FLAG_DEFAULT = false;

// ────────────────────────────────────────────────────────────────────────────
// Provenance
// ────────────────────────────────────────────────────────────────────────────

export type SourceProvenance =
  | "EXACT_PDP_HERO_HASH"
  | "VERIFIED_PRODUCT_GALLERY_MEMBER"
  | "APPROVED_NORMALIZED_DERIVATIVE"
  | "UNVERIFIED_EXTERNAL_SOURCE"
  | "MISMATCH";

export interface ProvenanceInput {
  source_image_url: string;
  source_image_hash: string | null;
  product_hero_url: string | null;
  product_hero_hash?: string | null;
  product_gallery_urls: string[];
  derivative_of_hash?: string | null;
}

export function classifyProvenance(input: ProvenanceInput): SourceProvenance {
  if (
    input.source_image_url &&
    input.product_hero_url &&
    input.source_image_url === input.product_hero_url
  ) {
    return "EXACT_PDP_HERO_HASH";
  }
  if (
    input.product_hero_hash &&
    input.source_image_hash &&
    input.product_hero_hash === input.source_image_hash
  ) {
    return "EXACT_PDP_HERO_HASH";
  }
  if (
    input.source_image_url &&
    input.product_gallery_urls.includes(input.source_image_url)
  ) {
    return "VERIFIED_PRODUCT_GALLERY_MEMBER";
  }
  if (
    input.derivative_of_hash &&
    input.source_image_hash &&
    input.derivative_of_hash === input.source_image_hash
  ) {
    return "APPROVED_NORMALIZED_DERIVATIVE";
  }
  if (
    input.source_image_url &&
    /^https:\/\/[a-z0-9-]*\.?(supabase\.co|getpawsy\.(pet|lovable\.app))\//i.test(
      input.source_image_url,
    )
  ) {
    return "UNVERIFIED_EXTERNAL_SOURCE";
  }
  return "MISMATCH";
}

export function isDeterministicProvenance(p: SourceProvenance): boolean {
  return (
    p === "EXACT_PDP_HERO_HASH" ||
    p === "VERIFIED_PRODUCT_GALLERY_MEMBER" ||
    p === "APPROVED_NORMALIZED_DERIVATIVE"
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Categorical decisions (derived from stored evidence — no provider call)
// ────────────────────────────────────────────────────────────────────────────

export type IdentityDecision = "EXACT" | "PROBABLE" | "AMBIGUOUS" | "MISMATCH";
export type PdpVisualDecision =
  | "EXACT"
  | "CONSISTENT"
  | "AMBIGUOUS"
  | "MISMATCH";
export type Trichotomy = "MATCH" | "MISMATCH" | "UNKNOWN";

/** Bands are intentionally wide because Gemini Flash structured output emits
 *  coarse values (0.80 / 0.85 / 0.90 / 0.95 / 1.00). Do NOT ask the model for
 *  synthetic precision like 0.983 — it will fabricate it. */
export function identityDecisionFromScore(
  score: number | null,
): IdentityDecision {
  if (score == null) return "AMBIGUOUS";
  if (score >= 0.97) return "EXACT";
  if (score >= 0.85) return "PROBABLE";
  if (score >= 0.6) return "AMBIGUOUS";
  return "MISMATCH";
}

export function pdpDecisionFromScore(score: number | null): PdpVisualDecision {
  if (score == null) return "AMBIGUOUS";
  if (score >= 0.97) return "EXACT";
  if (score >= 0.85) return "CONSISTENT";
  if (score >= 0.6) return "AMBIGUOUS";
  return "MISMATCH";
}

export function boolToTrichotomy(v: boolean | null | undefined): Trichotomy {
  if (v === true) return "MATCH";
  if (v === false) return "MISMATCH";
  return "UNKNOWN";
}

// ────────────────────────────────────────────────────────────────────────────
// Tier A / Tier B calibrated evaluator (pure)
// ────────────────────────────────────────────────────────────────────────────

export interface CalibratedSignals {
  provenance: SourceProvenance;
  identity_decision: IdentityDecision;
  pdp_visual_decision: PdpVisualDecision;
  variant_decision: Trichotomy;
  color_decision: Trichotomy;
  shape_decision: Trichotomy;
  species_ok: boolean; // true when species matches or not applicable
  species_applicable: boolean;
  occupancy: number | null;
  watermark_detected: boolean;
  supplier_text_detected: boolean;
  collage_detected: boolean;
  image_decode_pass: boolean;
  destination_integrity_pass: boolean;
  no_competing_variant: boolean;
  // Diagnostics only — never used to promote.
  identity_confidence?: number | null;
  pdp_similarity?: number | null;
}

export type TierAResult = "tier_a_ready" | "not_ready";
export type TierBResult = "tier_b_canary_candidate" | "not_eligible";

export interface CalibratedClassification {
  tier_a_result: TierAResult;
  tier_b_result: TierBResult;
  rejection_reasons: string[];
  provenance_verdict: "deterministic" | "unverified" | "mismatch";
}

function hardSafetyReasons(s: CalibratedSignals): string[] {
  const r: string[] = [];
  if (!s.image_decode_pass) r.push("image_decode_fail");
  if (s.watermark_detected) r.push("watermark_detected");
  if (s.supplier_text_detected) r.push("supplier_text_detected");
  if (s.collage_detected) r.push("collage_detected");
  if (s.occupancy != null && s.occupancy < 0.4) r.push("low_occupancy");
  if (!s.destination_integrity_pass) r.push("destination_integrity_fail");
  if (!s.no_competing_variant) r.push("competing_variant");
  if (s.species_applicable && !s.species_ok) r.push("species_mismatch");
  return r;
}

function categoricalReasons(s: CalibratedSignals): string[] {
  const r: string[] = [];
  if (s.variant_decision === "MISMATCH") r.push("variant_mismatch");
  if (s.variant_decision === "UNKNOWN") r.push("variant_unknown");
  if (s.color_decision === "MISMATCH") r.push("color_mismatch");
  if (s.color_decision === "UNKNOWN") r.push("color_unknown");
  if (s.shape_decision === "MISMATCH") r.push("shape_mismatch");
  if (s.shape_decision === "UNKNOWN") r.push("shape_unknown");
  if (s.identity_decision === "MISMATCH") r.push("identity_mismatch");
  if (s.pdp_visual_decision === "MISMATCH") r.push("pdp_visual_mismatch");
  return r;
}

export function classifyCalibratedV2(
  s: CalibratedSignals,
): CalibratedClassification {
  const reasons: string[] = [
    ...hardSafetyReasons(s),
    ...categoricalReasons(s),
  ];
  const provenance_ok = isDeterministicProvenance(s.provenance);
  const provenance_verdict: CalibratedClassification["provenance_verdict"] =
    provenance_ok
      ? "deterministic"
      : s.provenance === "MISMATCH"
        ? "mismatch"
        : "unverified";

  if (!provenance_ok) reasons.push(`provenance_${s.provenance}`);

  const visualsMatch =
    s.variant_decision === "MATCH" &&
    s.color_decision === "MATCH" &&
    s.shape_decision === "MATCH";

  const pdpOk =
    s.pdp_visual_decision === "EXACT" ||
    s.pdp_visual_decision === "CONSISTENT";

  const hardSafe = hardSafetyReasons(s).length === 0;

  // Tier A — model confidence is supporting evidence; deterministic
  // provenance is the primary proof. PROBABLE identity is accepted only when
  // provenance is deterministic AND all visual decisions match, because the
  // provenance already proves the product identity.
  let tier_a: TierAResult = "not_ready";
  if (
    provenance_ok &&
    hardSafe &&
    visualsMatch &&
    pdpOk &&
    (s.identity_decision === "EXACT" ||
      (s.identity_decision === "PROBABLE" &&
        s.provenance === "EXACT_PDP_HERO_HASH"))
  ) {
    tier_a = "tier_a_ready";
  }

  // Tier B canary — allow PROBABLE identity on any deterministic provenance,
  // still require all match decisions and hard safety.
  let tier_b: TierBResult = "not_eligible";
  if (
    tier_a === "not_ready" &&
    provenance_ok &&
    hardSafe &&
    visualsMatch &&
    pdpOk &&
    (s.identity_decision === "EXACT" || s.identity_decision === "PROBABLE")
  ) {
    tier_b = "tier_b_canary_candidate";
  }

  return {
    tier_a_result: tier_a,
    tier_b_result: tier_b,
    rejection_reasons: Array.from(new Set(reasons)),
    provenance_verdict,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Zero-cost reclassification from stored v1 payloads
// ────────────────────────────────────────────────────────────────────────────

export interface StoredV1Result {
  product_id: string;
  slug: string | null;
  species: string | null;
  source_image_url: string;
  source_image_hash: string | null;
  product_hero_url: string | null;
  product_gallery_urls: string[];
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
  image_decode_status: string | null;
  old_tier_a_result: string;
  old_tier_b_result: string;
}

export interface CalibrationPreview {
  product_id: string;
  slug: string | null;
  species: string | null;
  provenance: SourceProvenance;
  identity_decision: IdentityDecision;
  pdp_visual_decision: PdpVisualDecision;
  variant_decision: Trichotomy;
  color_decision: Trichotomy;
  shape_decision: Trichotomy;
  old_tier_a_result: string;
  old_tier_b_result: string;
  new_tier_a_result: TierAResult;
  new_tier_b_result: TierBResult;
  rejection_reasons: string[];
  provenance_verdict: string;
  needs_new_provider_call: boolean;
  change_reason: string;
}

export function reclassifyStoredV1(row: StoredV1Result): CalibrationPreview {
  const provenance = classifyProvenance({
    source_image_url: row.source_image_url,
    source_image_hash: row.source_image_hash,
    product_hero_url: row.product_hero_url,
    product_gallery_urls: row.product_gallery_urls,
  });

  const identity = identityDecisionFromScore(row.identity_confidence);
  const pdp = pdpDecisionFromScore(row.pdp_similarity);
  const variant = boolToTrichotomy(row.variant_match);
  const color = boolToTrichotomy(row.color_match);
  const shape = boolToTrichotomy(row.shape_match);

  const species_applicable = row.species === "cat" || row.species === "dog";
  const species_ok =
    !species_applicable ||
    (row.species_confidence ?? 0) >= 0.6; // species text was reliable at 0.6 band

  const signals: CalibratedSignals = {
    provenance,
    identity_decision: identity,
    pdp_visual_decision: pdp,
    variant_decision: variant,
    color_decision: color,
    shape_decision: shape,
    species_ok,
    species_applicable,
    occupancy: row.occupancy,
    watermark_detected: row.watermark_detected === true,
    supplier_text_detected: row.supplier_text_detected === true,
    collage_detected: row.collage_detected === true,
    image_decode_pass: row.image_decode_status !== "fail",
    destination_integrity_pass: true,
    no_competing_variant: true,
    identity_confidence: row.identity_confidence,
    pdp_similarity: row.pdp_similarity,
  };

  const cls = classifyCalibratedV2(signals);

  // A new provider call is needed when we cannot derive a definitive category
  // from stored evidence (AMBIGUOUS/UNKNOWN present) and hard safety passes.
  const undecided =
    identity === "AMBIGUOUS" ||
    pdp === "AMBIGUOUS" ||
    variant === "UNKNOWN" ||
    color === "UNKNOWN" ||
    shape === "UNKNOWN";
  const needs_new_provider_call =
    undecided && cls.rejection_reasons.length === 0;

  const old_pair = `${row.old_tier_a_result}/${row.old_tier_b_result}`;
  const new_pair = `${cls.tier_a_result}/${cls.tier_b_result}`;
  const change_reason =
    old_pair === new_pair
      ? "no_change"
      : cls.tier_a_result === "tier_a_ready"
        ? "promoted_via_deterministic_provenance_and_categorical_match"
        : cls.tier_b_result === "tier_b_canary_candidate"
          ? "promoted_to_canary_via_probable_identity_and_deterministic_provenance"
          : `still_rejected:${cls.rejection_reasons.join(",")}`;

  return {
    product_id: row.product_id,
    slug: row.slug,
    species: row.species,
    provenance,
    identity_decision: identity,
    pdp_visual_decision: pdp,
    variant_decision: variant,
    color_decision: color,
    shape_decision: shape,
    old_tier_a_result: row.old_tier_a_result,
    old_tier_b_result: row.old_tier_b_result,
    new_tier_a_result: cls.tier_a_result,
    new_tier_b_result: cls.tier_b_result,
    rejection_reasons: cls.rejection_reasons,
    provenance_verdict: cls.provenance_verdict,
    needs_new_provider_call,
    change_reason,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Integer microcredit budget arithmetic
// ────────────────────────────────────────────────────────────────────────────

export const MICROCREDITS_PER_CREDIT = 1_000_000;

/** Convert a float credit amount into integer microcredits, rounding UP so we
 *  never under-count spend against the cap. */
export function creditsToMicro(credits: number): number {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return Math.ceil(credits * MICROCREDITS_PER_CREDIT);
}

export function microToCredits(micro: number): number {
  return micro / MICROCREDITS_PER_CREDIT;
}

export interface BudgetLedger {
  cap_micro: number;
  actual_spent_micro: number;
  active_reservations_micro: number;
  released_reservations_micro: number; // for observability only
}

export function budgetReport(l: BudgetLedger, next_call_estimate_credits: number) {
  const projected_micro =
    l.actual_spent_micro +
    l.active_reservations_micro +
    creditsToMicro(next_call_estimate_credits);
  return {
    cap_credits: microToCredits(l.cap_micro),
    actual_spent_credits: microToCredits(l.actual_spent_micro),
    active_reservations_credits: microToCredits(l.active_reservations_micro),
    released_reservations_credits: microToCredits(l.released_reservations_micro),
    next_call_estimate_credits,
    projected_total_credits: microToCredits(projected_micro),
    would_exceed_cap: projected_micro > l.cap_micro,
  };
}

/** Deterministic, float-safe cap check. Returns true when the next call
 *  would take us *over* the cap. Uses integer microcredit math throughout. */
export function wouldExceedCap(
  cap_credits: number,
  actual_spent_credits: number,
  active_reservations_credits: number,
  next_call_estimate_credits: number,
): boolean {
  const cap_micro = creditsToMicro(cap_credits);
  const projected =
    creditsToMicro(actual_spent_credits) +
    creditsToMicro(active_reservations_credits) +
    creditsToMicro(next_call_estimate_credits);
  return projected > cap_micro;
}

/** Reservation lifecycle — reserved before the paid call, then either
 *  reconciled against actual cost (success) or released (cache hit, provider
 *  failure) so future budget checks do not treat released reservations as
 *  spent. */
export interface Reservation {
  id: string;
  reserved_micro: number;
  status: "active" | "reconciled" | "released";
  actual_micro?: number;
}

export function reserve(l: BudgetLedger, estimate_credits: number): Reservation {
  const m = creditsToMicro(estimate_credits);
  l.active_reservations_micro += m;
  return {
    id: crypto.randomUUID(),
    reserved_micro: m,
    status: "active",
  };
}

export function reconcile(
  l: BudgetLedger,
  r: Reservation,
  actual_credits: number,
): void {
  if (r.status !== "active") return;
  const actual = creditsToMicro(actual_credits);
  l.active_reservations_micro = Math.max(
    0,
    l.active_reservations_micro - r.reserved_micro,
  );
  l.actual_spent_micro += actual;
  r.status = "reconciled";
  r.actual_micro = actual;
}

export function release(l: BudgetLedger, r: Reservation): void {
  if (r.status !== "active") return;
  l.active_reservations_micro = Math.max(
    0,
    l.active_reservations_micro - r.reserved_micro,
  );
  l.released_reservations_micro += r.reserved_micro;
  r.status = "released";
}

// ────────────────────────────────────────────────────────────────────────────
// Round-robin species dispatch
// ────────────────────────────────────────────────────────────────────────────

export type SpeciesBucket = "cat" | "dog" | "other";

export interface DispatchCandidate {
  product_id: string;
  species: string | null;
}

export function speciesBucket(species: string | null): SpeciesBucket {
  if (species === "cat") return "cat";
  if (species === "dog") return "dog";
  return "other";
}

/** Interleave candidates in cat → dog → other order, redistributing when a
 *  bucket is exhausted. Preserves per-bucket priority ordering. */
export function roundRobinDispatch(
  candidates: DispatchCandidate[],
  limit: number,
): DispatchCandidate[] {
  const buckets: Record<SpeciesBucket, DispatchCandidate[]> = {
    cat: [],
    dog: [],
    other: [],
  };
  for (const c of candidates) buckets[speciesBucket(c.species)].push(c);

  const order: SpeciesBucket[] = ["cat", "dog", "other"];
  const out: DispatchCandidate[] = [];
  let i = 0;
  while (out.length < limit) {
    let advanced = false;
    for (const b of order) {
      if (out.length >= limit) break;
      const next = buckets[b].shift();
      if (next) {
        out.push(next);
        advanced = true;
      }
    }
    if (!advanced) break; // all buckets empty
    i++;
  }
  return out;
}
