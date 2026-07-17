// Unit tests for pinterest-candidate-scorer.
// - No network. No Supabase. No paid calls.
// - Covers request-schema guardrails, tier classification, cache-key stability,
//   and a static import-guard against publication modules.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  RequestSchema,
  classifyCandidate,
  TIER_A,
  type ScoreSignals,
} from "./pure.ts";

function baseSignals(overrides: Partial<ScoreSignals> = {}): ScoreSignals {
  return {
    occupancy: 0.6,
    identity_confidence: 0.99,
    pdp_similarity: 0.98,
    species_confidence: 0.99,
    variant_match: true,
    color_match: true,
    shape_match: true,
    watermark_detected: false,
    supplier_text_detected: false,
    collage_detected: false,
    image_decode_status: "pass",
    gallery_membership_verified: true,
    species_applicable: true,
    no_competing_variant: true,
    product_not_obscured: true,
    destination_integrity_pass: true,
    product_pin_integrity_pass: true,
    ...overrides,
  };
}

const validBody = {
  run_id: "11111111-1111-1111-1111-111111111111",
  product_ids: ["22222222-2222-2222-2222-222222222222"],
  max_candidates: 1,
  max_paid_calls: 1,
  max_credit_spend: 0.1,
  use_cache: true,
  allow_tier_b_evaluation: true,
  publication_allowed: false,
  queue_writes_allowed: false,
};

// ── Request contract ────────────────────────────────────────────────────────

Deno.test("1. valid score-only request parses", () => {
  const r = RequestSchema.safeParse(validBody);
  assert(r.success, JSON.stringify((r as any).error?.flatten?.()));
});

Deno.test("2. publication_allowed=true is rejected", () => {
  const r = RequestSchema.safeParse({ ...validBody, publication_allowed: true });
  assert(!r.success);
});

Deno.test("3. queue_writes_allowed=true is rejected", () => {
  const r = RequestSchema.safeParse({ ...validBody, queue_writes_allowed: true });
  assert(!r.success);
});

Deno.test("14. max_candidates > 50 rejected", () => {
  const r = RequestSchema.safeParse({ ...validBody, max_candidates: 51 });
  assert(!r.success);
});

Deno.test("15a. max_credit_spend > 0.5 rejected", () => {
  const r = RequestSchema.safeParse({ ...validBody, max_credit_spend: 0.51 });
  assert(!r.success);
});

Deno.test("15b. unknown field (publish) rejected via .strict()", () => {
  const r = RequestSchema.safeParse({ ...validBody, publish: true });
  assert(!r.success);
});

Deno.test("15c. unknown field (scheduled_at) rejected via .strict()", () => {
  const r = RequestSchema.safeParse({ ...validBody, scheduled_at: "2026-01-01" });
  assert(!r.success);
});

// ── Classifier ─────────────────────────────────────────────────────────────

Deno.test("7. above Tier A thresholds becomes TIER_A_READY", () => {
  const c = classifyCandidate(baseSignals(), true);
  assertEquals(c.tier_a_result, "tier_a_ready");
  assertEquals(c.rejection_reasons.length, 0);
});

Deno.test("8. identity 0.95 with safeguards becomes Tier B only", () => {
  const c = classifyCandidate(
    baseSignals({ identity_confidence: 0.95, pdp_similarity: 1.0 }),
    true,
  );
  assertEquals(c.tier_a_result, "not_ready");
  assertEquals(c.tier_b_potential_result, "tier_b_canary_candidate");
});

Deno.test("9. Tier B never marked publication-ready (no such state)", () => {
  const c = classifyCandidate(
    baseSignals({ identity_confidence: 0.94, pdp_similarity: 1.0 }),
    true,
  );
  // The only publication-ready state is 'tier_a_ready'; Tier B is informational.
  assert(c.tier_a_result !== "tier_a_ready");
});

Deno.test("10. collage detected is rejected in both tiers", () => {
  const c = classifyCandidate(baseSignals({ collage_detected: true }), true);
  assertEquals(c.tier_a_result, "not_ready");
  assertEquals(c.tier_b_potential_result, "not_eligible");
  assert(c.rejection_reasons.includes("collage_detected"));
});

Deno.test("11. supplier text detected is rejected", () => {
  const c = classifyCandidate(baseSignals({ supplier_text_detected: true }), true);
  assertEquals(c.tier_a_result, "not_ready");
  assertEquals(c.tier_b_potential_result, "not_eligible");
});

Deno.test("12. occupancy below 0.4 is rejected", () => {
  const c = classifyCandidate(baseSignals({ occupancy: 0.3 }), true);
  assertEquals(c.tier_a_result, "not_ready");
  assert(c.rejection_reasons.includes("low_occupancy"));
});

Deno.test("13. variant mismatch is rejected", () => {
  const c = classifyCandidate(baseSignals({ variant_match: false }), true);
  assertEquals(c.tier_a_result, "not_ready");
  assert(c.rejection_reasons.includes("variant_mismatch"));
});

Deno.test("watermark is rejected", () => {
  const c = classifyCandidate(baseSignals({ watermark_detected: true }), true);
  assertEquals(c.tier_a_result, "not_ready");
  assert(c.rejection_reasons.includes("watermark_detected"));
});

Deno.test("image_decode fail is rejected", () => {
  const c = classifyCandidate(baseSignals({ image_decode_status: "fail" }), true);
  assertEquals(c.tier_a_result, "not_ready");
  assert(c.rejection_reasons.includes("image_decode_fail"));
});

Deno.test("allow_tier_b=false suppresses Tier B classification", () => {
  const c = classifyCandidate(
    baseSignals({ identity_confidence: 0.95, pdp_similarity: 1.0 }),
    false,
  );
  assertEquals(c.tier_b_potential_result, "not_eligible");
});

Deno.test("Tier A thresholds match the locked constants", () => {
  assertEquals(TIER_A.MIN_IDENTITY, 0.98);
  assertEquals(TIER_A.MIN_OCCUPANCY, 0.4);
  assertEquals(TIER_A.MIN_PDP_SIMILARITY, 0.97);
});

// ── Static import-guard (18. endpoint imports no publication module) ──────

Deno.test("18. endpoint imports no publication module", async () => {
  const src = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const forbidden = [
    "pinterest-cron-worker",
    "pinterest-creative-director",
    "pinterest-creative-factory",
    "pinterest-wave-runner",
    "pinterest-warmup-regenerate",
    "pinterest-regen-autopilot",
    "pinterest-recovery-worker",
    "pinterest-noai-refill",
    "pinterest-publish-now",
    "pinterest-media-host",
  ];
  for (const mod of forbidden) {
    assert(
      !src.includes(`/${mod}`) && !src.includes(`"${mod}`),
      `endpoint must not import ${mod}`,
    );
  }
});

Deno.test("18b. endpoint never writes to pinterest_pin_queue", async () => {
  const src = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  // .insert / .update / .upsert calls on pinterest_pin_queue must not exist.
  assert(
    !/from\(["']pinterest_pin_queue["']\)[\s\S]{0,80}\.(insert|update|upsert|delete)/
      .test(src),
    "endpoint must not mutate pinterest_pin_queue",
  );
});

Deno.test("18c. endpoint does not read PINTEREST_ACCESS_TOKEN", async () => {
  const src = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  // Comment mentions are OK; runtime reads are not.
  assert(!/Deno\.env\.get\(["']PINTEREST_ACCESS_TOKEN/.test(src));
});

Deno.test("18d. endpoint does not POST to Pinterest API", async () => {
  const src = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assert(!src.includes("api.pinterest.com"));
});

// ── Cache-key stability (16. unchanged hash not rescored) ───────────────

Deno.test("16. cache key is deterministic per (hash, product, scorer)", async () => {
  const { buildCacheKey } = await import("../_shared/pinterest-qa-cache.ts");
  const a = await buildCacheKey({
    image_hash: "abc",
    pdp_hero_hash: "abc",
    product_id: "p1",
    scorer: "candidate_structured_vision_v1",
  });
  const b = await buildCacheKey({
    image_hash: "abc",
    pdp_hero_hash: "abc",
    product_id: "p1",
    scorer: "candidate_structured_vision_v1",
  });
  assertEquals(a, b);
  const c = await buildCacheKey({
    image_hash: "xyz",
    pdp_hero_hash: "xyz",
    product_id: "p1",
    scorer: "candidate_structured_vision_v1",
  });
  assert(a !== c);
});