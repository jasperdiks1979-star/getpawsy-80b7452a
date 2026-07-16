// Pinterest Image Model Policy — enforces Control 1 (default cheap model) and
// Control 2 (deterministic-first). Every image call MUST pass through
// pickImageStrategy() and receive its `model` and `strategy` from here.

import type { RunConfig } from "./pinterest-cost-guard.ts";

export const MAX_IMAGE_RETRIES = 1;
export const MAX_QA_RETRIES = 1;

export const IMAGE_MODEL_FLASH = "google/gemini-2.5-flash-image";
export const IMAGE_MODEL_PRO = "google/gemini-3-pro-image";

export const FLASH_IMAGE_CREDIT_COST = 0.04;
export const PRO_IMAGE_CREDIT_COST = 0.15;
export const QA_CREDIT_COST = 0.003;

export type ImageStrategy =
  | "composite_photo_lock"
  | "composite_bg_extend"
  | "flash_image_edit"
  | "pro_image";

export interface CandidateHint {
  hero_priority?: boolean;
  pdp_hero_ok?: boolean; // preflight passed
  requires_scene?: boolean; // brief demands a lifestyle scene, not a bg swap
  requested_model?: string | null;
}

export interface StrategyDecision {
  strategy: ImageStrategy;
  model: string | null; // null = deterministic (no gateway call)
  projected_credit_cost: number;
  reason: string;
}

/**
 * Deterministic-first waterfall:
 *   A composite_photo_lock  (no paid call)
 *   B composite_bg_extend   (no paid call)
 *   C flash_image_edit      (google/gemini-2.5-flash-image, ~0.04 cr)
 *   D pro_image             (google/gemini-3-pro-image, ~0.15 cr)  — GATED
 * Pro image requires ALL of:
 *   1. cfg.allow_pro_image === true
 *   2. candidate.hero_priority === true
 *   3. projected budget still within cap (enforced in cost-guard.assertBudget)
 * Otherwise fail-closed to flash_image_edit.
 */
export function pickImageStrategy(
  cfg: RunConfig,
  candidate: CandidateHint,
): StrategyDecision {
  // A — deterministic photo-lock (highest priority; zero cost)
  if (candidate.pdp_hero_ok && !candidate.requires_scene) {
    return {
      strategy: "composite_photo_lock",
      model: null,
      projected_credit_cost: 0,
      reason: "pdp_hero_ok_no_scene",
    };
  }
  // B — deterministic background extend / canvas layout
  if (candidate.pdp_hero_ok && candidate.requires_scene === false) {
    return {
      strategy: "composite_bg_extend",
      model: null,
      projected_credit_cost: 0,
      reason: "canvas_layout_only",
    };
  }
  // D — pro image (gated)
  const requestedPro =
    candidate.requested_model === IMAGE_MODEL_PRO ||
    candidate.requested_model === "pro" ||
    candidate.requested_model === "gemini-3-pro-image";
  if (
    requestedPro &&
    cfg.allow_pro_image === true &&
    candidate.hero_priority === true
  ) {
    return {
      strategy: "pro_image",
      model: IMAGE_MODEL_PRO,
      projected_credit_cost: PRO_IMAGE_CREDIT_COST,
      reason: "pro_image_explicitly_allowed_and_hero",
    };
  }
  // C — flash image edit (default paid path, fail-closed)
  return {
    strategy: "flash_image_edit",
    model: IMAGE_MODEL_FLASH,
    projected_credit_cost: FLASH_IMAGE_CREDIT_COST,
    reason: requestedPro
      ? "pro_image_requested_but_not_allowed_fell_back_to_flash"
      : "default_flash_image",
  };
}

export function estimateQaCost(): number {
  return QA_CREDIT_COST;
}