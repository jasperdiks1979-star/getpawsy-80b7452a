// Product Variant Guard (PVG)
//
// Runs BEFORE render/publish on any candidate source image (catalogue photo,
// photo_lock_source, cutout base, AI-composite input) and blocks with a
// concrete reason when the image depicts a DIFFERENT variant/model/material
// than the PDP hero + gallery of the target product.
//
// Reuses the existing Visual Product Identity (VPI) evaluator so it does not
// duplicate vision logic. Difference vs. VPI-in-guard:
//   • VPI-in-guard runs on the final `pin_image_url` at insert/publish time.
//   • PVG runs earlier, on the *source* image, and short-circuits the whole
//     pipeline with a machine-readable variant-mismatch reason so the
//     creative factory never wastes AI credits on a bad source.
//
// The reason token surfaced to callers is deliberately concrete:
//   product_variant_mismatch:<wrong_product_kind> — <top difference>
//
// Server-side only.

import {
  evaluateVisualIdentity,
  cachedVisualIdentity,
  persistVisualIdentity,
  vpiEnabled,
  type VpiVerdict,
} from "./visual-product-identity.ts";

export type VariantGuardVerdict = {
  passed: boolean;
  identity_score: number;
  wrong_product_kind: VpiVerdict["wrong_product_kind"];
  recommended_action: VpiVerdict["recommended_action"];
  differences: string[];
  best_reference_image: string | null;
  reason: string | null;         // machine-readable token, null when passed
  detail: string | null;         // human-readable one-liner, null when passed
  cached: boolean;
  skipped: boolean;              // true when engine disabled / no source
  skip_reason?: string;
};

export type VariantGuardInput = {
  product_id: string;
  product_slug: string;
  product_name: string;
  source_image_url: string;      // the candidate — usually photo_lock_source
  context_label?: string;        // e.g. "photo_lock_source", "cutout_base"
  pin_queue_id?: string | null;
  destination_link?: string | null;
};

const PASS_MIN_SCORE = 99;

function buildReason(v: VpiVerdict): { reason: string; detail: string } {
  const kind = v.wrong_product_kind || "different_variant";
  const top = v.differences?.find((d) => d && d.trim().length > 0) ?? "no concrete difference reported";
  return {
    reason: `product_variant_mismatch:${kind}`,
    detail: `${kind} — ${top}`.slice(0, 500),
  };
}

export async function verifyProductVariant(
  supabase: any,
  input: VariantGuardInput,
): Promise<VariantGuardVerdict> {
  const empty: VariantGuardVerdict = {
    passed: false,
    identity_score: 0,
    wrong_product_kind: "unknown_object",
    recommended_action: "manual_review",
    differences: [],
    best_reference_image: null,
    reason: null,
    detail: null,
    cached: false,
    skipped: false,
  };

  if (!input.source_image_url || !/^https:\/\//i.test(input.source_image_url)) {
    return { ...empty, skipped: true, skip_reason: "source_image_url_invalid" };
  }

  // Respect the global VPI toggle — PVG shares the engine.
  const cfg = await vpiEnabled(supabase);
  if (!cfg.enabled) {
    return { ...empty, passed: true, skipped: true, skip_reason: "vpi_disabled" };
  }
  const minScore = Math.max(cfg.minScore, PASS_MIN_SCORE);

  // Cache hit — reuse VPI audit for the SAME (product, image) within TTL.
  const cached = await cachedVisualIdentity(supabase, input.product_id, input.source_image_url);
  if (cached && cached.passed && cached.identity_score >= minScore) {
    return {
      ...empty,
      passed: true,
      identity_score: cached.identity_score,
      wrong_product_kind: "none",
      recommended_action: "certify",
      cached: true,
    };
  }

  const vpi = await evaluateVisualIdentity(supabase, {
    product_id: input.product_id,
    product_slug: input.product_slug,
    product_name: input.product_name,
    pin_image_url: input.source_image_url,
    pin_queue_id: input.pin_queue_id ?? null,
    destination_link: input.destination_link ?? null,
    source: `pvg:${input.context_label ?? "source_image"}`,
  });

  // Persist so downstream VPI-in-guard on the final pin can also hit cache
  // (and so /admin/pinterest-health surfaces the variant-mismatch audit).
  await persistVisualIdentity(
    supabase,
    {
      product_id: input.product_id,
      product_slug: input.product_slug,
      product_name: input.product_name,
      pin_image_url: input.source_image_url,
      destination_link: input.destination_link ?? null,
      pin_queue_id: input.pin_queue_id ?? null,
      source: `pvg:${input.context_label ?? "source_image"}`,
    },
    vpi,
    null,
  ).catch(() => null);

  const passed = vpi.passed && vpi.identity_score >= minScore;
  if (passed) {
    return {
      passed: true,
      identity_score: vpi.identity_score,
      wrong_product_kind: "none",
      recommended_action: "certify",
      differences: vpi.differences,
      best_reference_image: vpi.best_reference_image,
      reason: null,
      detail: null,
      cached: false,
      skipped: false,
    };
  }

  const { reason, detail } = buildReason(vpi);
  return {
    passed: false,
    identity_score: vpi.identity_score,
    wrong_product_kind: vpi.wrong_product_kind,
    recommended_action: vpi.recommended_action,
    differences: vpi.differences,
    best_reference_image: vpi.best_reference_image,
    reason,
    detail,
    cached: false,
    skipped: false,
  };
}
