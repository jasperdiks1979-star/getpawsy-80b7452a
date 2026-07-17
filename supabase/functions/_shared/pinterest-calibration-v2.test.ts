// Deno tests for calibrated scorer v2. All pure — zero network / zero provider.
// Run with `supabase--test_edge_functions` (function name doesn't matter, tests
// live under _shared and are picked up by pattern).

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CALIBRATION_FEATURE_FLAG_DEFAULT,
  boolToTrichotomy,
  budgetReport,
  classifyCalibratedV2,
  classifyProvenance,
  creditsToMicro,
  identityDecisionFromScore,
  pdpDecisionFromScore,
  reclassifyStoredV1,
  reconcile,
  release,
  reserve,
  roundRobinDispatch,
  wouldExceedCap,
} from "./pinterest-calibration-v2.ts";

// ────────────────────────────────────────────────────────────────────────────
// Feature flag safety
// ────────────────────────────────────────────────────────────────────────────
Deno.test("calibrated v2 is OFF by default", () => {
  assertEquals(CALIBRATION_FEATURE_FLAG_DEFAULT, false);
});

// ────────────────────────────────────────────────────────────────────────────
// Provenance
// ────────────────────────────────────────────────────────────────────────────
Deno.test("exact hero URL match → EXACT_PDP_HERO_HASH", () => {
  assertEquals(
    classifyProvenance({
      source_image_url: "https://x.supabase.co/a.jpg",
      source_image_hash: "h1",
      product_hero_url: "https://x.supabase.co/a.jpg",
      product_gallery_urls: ["https://x.supabase.co/a.jpg"],
    }),
    "EXACT_PDP_HERO_HASH",
  );
});

Deno.test("gallery member with different hero URL → VERIFIED_PRODUCT_GALLERY_MEMBER", () => {
  assertEquals(
    classifyProvenance({
      source_image_url: "https://x.supabase.co/b.jpg",
      source_image_hash: "h2",
      product_hero_url: "https://x.supabase.co/a.jpg",
      product_gallery_urls: ["https://x.supabase.co/a.jpg", "https://x.supabase.co/b.jpg"],
    }),
    "VERIFIED_PRODUCT_GALLERY_MEMBER",
  );
});

Deno.test("unknown external source is not deterministic", () => {
  assertEquals(
    classifyProvenance({
      source_image_url: "https://cj-cdn.example.com/x.jpg",
      source_image_hash: "h",
      product_hero_url: "https://x.supabase.co/a.jpg",
      product_gallery_urls: ["https://x.supabase.co/a.jpg"],
    }),
    "MISMATCH",
  );
});

// ────────────────────────────────────────────────────────────────────────────
// Categorical decisions — coarse Gemini output must map to a fair band
// ────────────────────────────────────────────────────────────────────────────
Deno.test("identity 0.90 → PROBABLE (not MISMATCH just because <0.98)", () => {
  assertEquals(identityDecisionFromScore(0.9), "PROBABLE");
});
Deno.test("identity 1.0 → EXACT", () => {
  assertEquals(identityDecisionFromScore(1.0), "EXACT");
});
Deno.test("identity 0.5 → MISMATCH", () => {
  assertEquals(identityDecisionFromScore(0.5), "MISMATCH");
});
Deno.test("pdp 0.85 → CONSISTENT (accepted with deterministic provenance)", () => {
  assertEquals(pdpDecisionFromScore(0.85), "CONSISTENT");
});
Deno.test("bool → trichotomy handles null as UNKNOWN", () => {
  assertEquals(boolToTrichotomy(null), "UNKNOWN");
  assertEquals(boolToTrichotomy(true), "MATCH");
  assertEquals(boolToTrichotomy(false), "MISMATCH");
});

// ────────────────────────────────────────────────────────────────────────────
// Tier A / Tier B behaviour
// ────────────────────────────────────────────────────────────────────────────
function baseSignals(overrides: Partial<Parameters<typeof classifyCalibratedV2>[0]> = {}) {
  return {
    provenance: "EXACT_PDP_HERO_HASH" as const,
    identity_decision: "EXACT" as const,
    pdp_visual_decision: "EXACT" as const,
    variant_decision: "MATCH" as const,
    color_decision: "MATCH" as const,
    shape_decision: "MATCH" as const,
    species_ok: true,
    species_applicable: true,
    occupancy: 1.0,
    watermark_detected: false,
    supplier_text_detected: false,
    collage_detected: false,
    image_decode_pass: true,
    destination_integrity_pass: true,
    no_competing_variant: true,
    ...overrides,
  };
}

Deno.test("exact hero hash + exact visual match → Tier A", () => {
  const c = classifyCalibratedV2(baseSignals());
  assertEquals(c.tier_a_result, "tier_a_ready");
});

Deno.test("gallery member + all MATCH + EXACT identity → Tier A", () => {
  const c = classifyCalibratedV2(baseSignals({ provenance: "VERIFIED_PRODUCT_GALLERY_MEMBER" }));
  assertEquals(c.tier_a_result, "tier_a_ready");
});

Deno.test("hero hash + PROBABLE identity + all MATCH → Tier A (deterministic proof overrides model)", () => {
  const c = classifyCalibratedV2(
    baseSignals({ identity_decision: "PROBABLE", pdp_visual_decision: "CONSISTENT" }),
  );
  assertEquals(c.tier_a_result, "tier_a_ready");
});

Deno.test("model confidence 0.90 does NOT reject deterministic exact provenance", () => {
  // Directly through the reclassifier — the historical run's exact case.
  const preview = reclassifyStoredV1({
    product_id: "p1",
    slug: "s",
    species: "dog",
    source_image_url: "https://x.supabase.co/a.jpg",
    source_image_hash: "h",
    product_hero_url: "https://x.supabase.co/a.jpg",
    product_gallery_urls: ["https://x.supabase.co/a.jpg"],
    occupancy: 1,
    identity_confidence: 0.9,
    pdp_similarity: 0.9,
    species_confidence: 0.9,
    variant_match: true,
    color_match: true,
    shape_match: true,
    watermark_detected: false,
    supplier_text_detected: false,
    collage_detected: false,
    image_decode_status: "pass",
    old_tier_a_result: "not_ready",
    old_tier_b_result: "not_eligible",
  });
  assertEquals(preview.new_tier_a_result, "tier_a_ready");
});

Deno.test("model confidence 1.0 does NOT override a variant mismatch", () => {
  const c = classifyCalibratedV2(
    baseSignals({
      identity_decision: "EXACT",
      variant_decision: "MISMATCH",
    }),
  );
  assertEquals(c.tier_a_result, "not_ready");
  assertEquals(c.tier_b_result, "not_eligible");
  assert(c.rejection_reasons.includes("variant_mismatch"));
});

Deno.test("supplier text rejects", () => {
  const c = classifyCalibratedV2(baseSignals({ supplier_text_detected: true }));
  assertEquals(c.tier_a_result, "not_ready");
  assert(c.rejection_reasons.includes("supplier_text_detected"));
});

Deno.test("collage rejects", () => {
  const c = classifyCalibratedV2(baseSignals({ collage_detected: true }));
  assertEquals(c.tier_a_result, "not_ready");
  assert(c.rejection_reasons.includes("collage_detected"));
});

Deno.test("watermark rejects", () => {
  const c = classifyCalibratedV2(baseSignals({ watermark_detected: true }));
  assertEquals(c.tier_a_result, "not_ready");
  assert(c.rejection_reasons.includes("watermark_detected"));
});

Deno.test("occupancy below 0.40 rejects", () => {
  const c = classifyCalibratedV2(baseSignals({ occupancy: 0.2 }));
  assertEquals(c.tier_a_result, "not_ready");
  assert(c.rejection_reasons.includes("low_occupancy"));
});

Deno.test("wrong species rejects when applicable", () => {
  const c = classifyCalibratedV2(
    baseSignals({ species_applicable: true, species_ok: false }),
  );
  assertEquals(c.tier_a_result, "not_ready");
  assert(c.rejection_reasons.includes("species_mismatch"));
});

Deno.test("unverified external source rejects", () => {
  const c = classifyCalibratedV2(baseSignals({ provenance: "UNVERIFIED_EXTERNAL_SOURCE" }));
  assertEquals(c.tier_a_result, "not_ready");
  assertEquals(c.tier_b_result, "not_eligible");
});

Deno.test("UNKNOWN variant/color/shape rejects", () => {
  const c = classifyCalibratedV2(baseSignals({ variant_decision: "UNKNOWN" }));
  assertEquals(c.tier_a_result, "not_ready");
  assert(c.rejection_reasons.includes("variant_unknown"));
});

// ────────────────────────────────────────────────────────────────────────────
// Round-robin species dispatch
// ────────────────────────────────────────────────────────────────────────────
Deno.test("round-robin: within first 12 dispatched, ≥4 cat + ≥4 dog + ≥2 other", () => {
  const cats = Array.from({ length: 18 }, (_, i) => ({ product_id: `c${i}`, species: "cat" }));
  const dogs = Array.from({ length: 18 }, (_, i) => ({ product_id: `d${i}`, species: "dog" }));
  const other = Array.from({ length: 9 }, (_, i) => ({ product_id: `o${i}`, species: null }));
  const dispatched = roundRobinDispatch([...cats, ...dogs, ...other], 12);
  const catCount = dispatched.filter((c) => c.species === "cat").length;
  const dogCount = dispatched.filter((c) => c.species === "dog").length;
  const otherCount = dispatched.filter((c) => c.species !== "cat" && c.species !== "dog").length;
  assert(catCount >= 4, `cats=${catCount}`);
  assert(dogCount >= 4, `dogs=${dogCount}`);
  assert(otherCount >= 2, `other=${otherCount}`);
});

Deno.test("round-robin: no category monopolizes budget", () => {
  const cats = Array.from({ length: 45 }, (_, i) => ({ product_id: `c${i}`, species: "cat" }));
  const dogs = Array.from({ length: 3 }, (_, i) => ({ product_id: `d${i}`, species: "dog" }));
  const dispatched = roundRobinDispatch([...cats, ...dogs], 6);
  // first 6 with round-robin cat/dog/other/cat/dog/other → cats:3, dogs:3
  assertEquals(dispatched.filter((c) => c.species === "dog").length, 3);
});

Deno.test("round-robin: exhausted bucket redistributes", () => {
  const cats = Array.from({ length: 2 }, (_, i) => ({ product_id: `c${i}`, species: "cat" }));
  const dogs = Array.from({ length: 10 }, (_, i) => ({ product_id: `d${i}`, species: "dog" }));
  const dispatched = roundRobinDispatch([...cats, ...dogs], 8);
  assertEquals(dispatched.length, 8);
  assertEquals(dispatched.filter((c) => c.species === "cat").length, 2);
  assertEquals(dispatched.filter((c) => c.species === "dog").length, 6);
});

// ────────────────────────────────────────────────────────────────────────────
// Budget arithmetic — the 0.5000000000000001 defect
// ────────────────────────────────────────────────────────────────────────────
Deno.test("actual 0.10 with no reservations is NOT 0.50", () => {
  const rep = budgetReport(
    {
      cap_micro: creditsToMicro(0.5),
      actual_spent_micro: creditsToMicro(0.1),
      active_reservations_micro: 0,
      released_reservations_micro: 0,
    },
    0.02,
  );
  assertEquals(rep.actual_spent_credits, 0.1);
  assertEquals(rep.projected_total_credits, 0.12);
  assertEquals(rep.would_exceed_cap, false);
});

Deno.test("float drift 0.5000000000000001 cannot cause incorrect stop", () => {
  // Simulate the historical 24 × 0.02 accumulation.
  let spent = 0;
  for (let i = 0; i < 24; i++) spent += 0.02;
  // In binary float, spent === 0.48000000000000015.
  assert(spent !== 0.48, "sanity: proves the float drift exists");
  // In microcredits, 24 × 20_000 = 480_000, cap 500_000; next 20_000 → 500_000 (== cap, NOT exceed).
  const exceed = wouldExceedCap(0.5, spent, 0, 0.02);
  assertEquals(exceed, false);
});

Deno.test("reservations are released after reconciliation", () => {
  const l = {
    cap_micro: creditsToMicro(1),
    actual_spent_micro: 0,
    active_reservations_micro: 0,
    released_reservations_micro: 0,
  };
  const r = reserve(l, 0.02);
  assertEquals(l.active_reservations_micro, 20000);
  reconcile(l, r, 0.02);
  assertEquals(l.active_reservations_micro, 0);
  assertEquals(l.actual_spent_micro, 20000);
});

Deno.test("provider failure releases reservation, no spend recorded", () => {
  const l = {
    cap_micro: creditsToMicro(1),
    actual_spent_micro: 0,
    active_reservations_micro: 0,
    released_reservations_micro: 0,
  };
  const r = reserve(l, 0.02);
  release(l, r);
  assertEquals(l.active_reservations_micro, 0);
  assertEquals(l.actual_spent_micro, 0);
  assertEquals(l.released_reservations_micro, 20000);
});

Deno.test("cache hits reserve and spend zero", () => {
  const l = {
    cap_micro: creditsToMicro(1),
    actual_spent_micro: 0,
    active_reservations_micro: 0,
    released_reservations_micro: 0,
  };
  const r = reserve(l, 0.02);
  reconcile(l, r, 0); // cache hit → 0 actual spend
  assertEquals(l.actual_spent_micro, 0);
  assertEquals(l.active_reservations_micro, 0);
});

Deno.test("stops BEFORE real cap exceedance, allows a call landing exactly on cap", () => {
  // cap 0.50, spent 0.48 (integer arithmetic), next 0.02 → 0.50 exactly → allowed.
  assertEquals(wouldExceedCap(0.5, 0.48, 0, 0.02), false);
  // spent 0.50, next 0.02 → 0.52 → blocked.
  assertEquals(wouldExceedCap(0.5, 0.5, 0, 0.02), true);
});

Deno.test("report fields reconcile exactly (actual + active + next = projected)", () => {
  const rep = budgetReport(
    {
      cap_micro: creditsToMicro(0.5),
      actual_spent_micro: creditsToMicro(0.3),
      active_reservations_micro: creditsToMicro(0.05),
      released_reservations_micro: creditsToMicro(0.02),
    },
    0.02,
  );
  // 0.30 + 0.05 + 0.02 = 0.37, exact under microcredits.
  assertEquals(rep.projected_total_credits, 0.37);
});
