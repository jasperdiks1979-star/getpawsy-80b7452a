// Pinterest Source-Image Preflight — Tier B evaluator (ISOLATED).
//
// Feature-flagged extension of the strict Tier A preflight. Default OFF.
// Not imported by any production edge function until an explicit
// opt-in is added AND the feature flag is enabled.
//
// Contract:
//   Tier A (unchanged, lives in pinterest-source-preflight.ts):
//     identity >= 0.98 AND every other axis clean.
//   Tier B (this file):
//     0.92 <= identity < 0.98 AND EVERY additional safeguard clean:
//       - exact gallery membership (image_hash present in
//         product_images or products.image_url for the same product_id)
//       - pdp_similarity == 1.00 (exact hash match)
//       - occupancy >= 0.40
//       - variant_match == PASS, color_match == PASS,
//         shape_match == PASS, competing_variant == absent,
//         obscured == false
//       - species_confidence >= 0.98 when an animal is visible
//       - watermark == 0, supplier_text == 0, collage == 0
//       - decode PASS
//       - destination_integrity PASS, product_to_pin_integrity PASS
//
// Any uncertain axis => Tier B REJECTED. No implicit A->B fallback.

export type IdentityTier = "A" | "B" | "rejected";

export interface TierBSafeguards {
  identity_confidence: number;
  occupancy_pct: number;
  pdp_similarity: number;
  species_confidence: number | null; // null == no animal visible
  animal_visible: boolean;
  gallery_member: boolean;              // exact hash membership
  variant_match: boolean;
  color_match: boolean;
  shape_match: boolean;
  competing_variant_present: boolean;
  product_obscured: boolean;
  watermark_present: boolean;
  supplier_text_present: boolean;
  collage_present: boolean;
  decode_pass: boolean;
  destination_integrity_pass: boolean;
  product_to_pin_integrity_pass: boolean;
}

export interface TierEvaluation {
  tier: IdentityTier;
  pass: boolean;
  failed: string[];
  reason: string | null;
}

// Feature flag — must remain false in production until explicitly turned on.
// Reading via env keeps the compiled bundle inert when unset.
export function tierBEnabled(env: Record<string, string | undefined> = readEnv()): boolean {
  return (env.PINTEREST_TIER_B_ENABLED ?? "").toLowerCase() === "true";
}

function readEnv(): Record<string, string | undefined> {
  // deno-lint-ignore no-explicit-any
  const d: any = (globalThis as any).Deno;
  if (d && typeof d.env?.toObject === "function") return d.env.toObject();
  // deno-lint-ignore no-explicit-any
  const p: any = (globalThis as any).process;
  if (p && p.env) return p.env as Record<string, string | undefined>;
  return {};
}

const TIER_A_IDENTITY = 0.98;
const TIER_B_IDENTITY_MIN = 0.92;
const MIN_OCCUPANCY = 0.4;
const TIER_B_SPECIES_MIN = 0.98;

// Pure evaluator. Callers gather the axes (from cache + integrity guard +
// gallery lookup) and hand a fully-populated safeguards object to this
// function. No I/O, no gateway calls.
export function evaluateIdentityTier(
  s: TierBSafeguards,
  opts: { tierBEnabled?: boolean } = {},
): TierEvaluation {
  const failed: string[] = [];
  const flag = opts.tierBEnabled ?? tierBEnabled();

  // Universal hard rejects — apply to BOTH tiers.
  if (!s.decode_pass) failed.push("decode_fail");
  if (s.watermark_present) failed.push("watermark");
  if (s.supplier_text_present) failed.push("supplier_text");
  if (s.collage_present) failed.push("collage");
  if (s.occupancy_pct < MIN_OCCUPANCY) failed.push(`occupancy_below_${MIN_OCCUPANCY}`);
  if (s.identity_confidence < TIER_B_IDENTITY_MIN) {
    failed.push(`identity_below_${TIER_B_IDENTITY_MIN}`);
    return { tier: "rejected", pass: false, failed, reason: failed[0] };
  }

  // Tier A path — unchanged strict rules.
  if (s.identity_confidence >= TIER_A_IDENTITY) {
    // Tier A still requires PDP similarity gate (>=0.97) via the caller,
    // but the classical preflight enforces that. We only certify the
    // identity tier here.
    if (failed.length > 0) {
      return { tier: "rejected", pass: false, failed, reason: failed[0] };
    }
    return { tier: "A", pass: true, failed: [], reason: null };
  }

  // Below Tier A but above Tier B floor — Tier B window.
  if (!flag) {
    failed.push("tier_b_disabled");
    return { tier: "rejected", pass: false, failed, reason: "tier_b_disabled" };
  }

  // Full Tier B safeguard stack — every one must PASS.
  if (!s.gallery_member) failed.push("not_exact_gallery_member");
  if (s.pdp_similarity < 1.0) failed.push("pdp_similarity_not_1_00");
  if (!s.variant_match) failed.push("variant_mismatch");
  if (!s.color_match) failed.push("color_mismatch");
  if (!s.shape_match) failed.push("shape_mismatch");
  if (s.competing_variant_present) failed.push("competing_variant_present");
  if (s.product_obscured) failed.push("product_obscured");
  if (s.animal_visible) {
    if (s.species_confidence == null) failed.push("species_unknown");
    else if (s.species_confidence < TIER_B_SPECIES_MIN)
      failed.push(`species_below_${TIER_B_SPECIES_MIN}`);
  }
  if (!s.destination_integrity_pass) failed.push("destination_integrity_fail");
  if (!s.product_to_pin_integrity_pass) failed.push("product_to_pin_integrity_fail");

  if (failed.length > 0) {
    return { tier: "rejected", pass: false, failed, reason: failed[0] };
  }
  return { tier: "B", pass: true, failed: [], reason: null };
}

// Helper for ledger metadata — attach the tier + safeguards summary to
// pinterest_run_cost_ledger.meta when calling from the wave runner.
export function ledgerTierMeta(ev: TierEvaluation, s: TierBSafeguards): Record<string, unknown> {
  return {
    identity_tier: ev.tier,
    identity_pass: ev.pass,
    identity_reason: ev.reason,
    identity_failed: ev.failed,
    identity_confidence: s.identity_confidence,
    occupancy_pct: s.occupancy_pct,
    pdp_similarity: s.pdp_similarity,
    species_confidence: s.species_confidence,
    gallery_member: s.gallery_member,
  };
}