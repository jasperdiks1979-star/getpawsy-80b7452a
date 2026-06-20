// Gold Standard Creative Scorer
// Synthesises a 0–100 Creative Score with 5 sub-axes for a cinematic_ad_jobs row.
// Inputs are existing signals: final_creative_score, voice_score, qa_composite_score,
// motion/realism scores, product visibility heuristics, scene_count, captions, etc.
// Pure functions — no I/O.

export interface JobLike {
  // existing scoring signals
  final_creative_score?: number | null;
  hook_score?: number | null;
  voice_score?: number | null;
  ctr_prediction_score?: number | null;
  qa_composite_score?: number | null;
  realism_score?: number | null;
  camera_motion_score?: number | null;
  engagement_pacing_score?: number | null;
  scene_change_count?: number | null;
  product_fidelity_score?: number | null;
  product_visibility_pct?: number | null;
  caption_density?: number | null;
  dense_caption_ratio?: number | null;
  status?: string | null;
  validation_v4_passed?: boolean | null;
  media_type?: string | null; // video | slideshow | static
  // meta / voice
  meta?: Record<string, unknown> | null;
}

export interface CreativeScoreResult {
  creative_score: number;
  voice: number;
  motion: number;
  product_visibility: number;
  conversion: number;
  brand: number;
  tier: "low" | "medium" | "gold";
  reasons: string[];
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function scoreCreative(job: JobLike, opts: { minScore?: number; priorityScore?: number } = {}): CreativeScoreResult {
  const reasons: string[] = [];
  const minScore = opts.minScore ?? 80;
  const priority = opts.priorityScore ?? 90;

  // ----- Voice (natural / not robotic / appropriate style) -----
  // Use voice_score where present; fall back to neutral 70.
  const voiceRaw = num(job.voice_score, 70);
  const voiceMeta = (job.meta as any)?.voice ?? {};
  const voiceName: string = String(voiceMeta?.voice_name ?? "");
  const voicePenalty = /robot|synth/i.test(voiceName) ? 25 : 0;
  if (voicePenalty) reasons.push("voice_robotic");
  const voice = clamp(voiceRaw - voicePenalty);

  // ----- Motion (camera + pacing + scene variation) -----
  const camera = num(job.camera_motion_score, 60);
  const pacing = num(job.engagement_pacing_score, 60);
  const scenes = num(job.scene_change_count, 0);
  const sceneBonus = scenes >= 6 ? 10 : scenes >= 4 ? 5 : -10;
  if (scenes < 4) reasons.push("too_few_scenes");
  const motion = clamp(camera * 0.5 + pacing * 0.5 + sceneBonus);

  // ----- Product visibility (80% target) -----
  let pv = num(job.product_visibility_pct, NaN);
  if (!Number.isFinite(pv)) {
    // Fall back to product_fidelity_score (0-100) when explicit pct missing.
    pv = num(job.product_fidelity_score, 70);
  } else {
    pv = pv <= 1 ? pv * 100 : pv; // accept 0..1 or 0..100
  }
  const productVisibility = clamp(pv >= 80 ? 100 : pv < 50 ? pv : 60 + (pv - 50));
  if (pv < 80) reasons.push("product_visibility_below_80pct");

  // ----- Conversion potential -----
  const conversion = clamp(num(job.ctr_prediction_score, num(job.final_creative_score, 70)));

  // ----- Brand (overall polish, realism, no dense text) -----
  const realism = num(job.realism_score, 70);
  const dense = num(job.dense_caption_ratio, 0);
  const densityPenalty = dense > 0.15 ? 20 : 0;
  if (densityPenalty) reasons.push("text_density_over_15pct");
  const brand = clamp(realism * 0.7 + num(job.qa_composite_score, 70) * 0.3 - densityPenalty);

  // ----- Hard rejects (drop to <80) -----
  let hardCeiling = 100;
  if (job.validation_v4_passed === false) {
    reasons.push("v4_validation_failed");
    hardCeiling = Math.min(hardCeiling, 75);
  }
  if (job.media_type === "static") {
    reasons.push("static_media_not_gold");
    hardCeiling = Math.min(hardCeiling, 70);
  }

  // Weighted composite. Matches the spec's 5 audit axes.
  const composite = clamp(
    voice * 0.20 +
    motion * 0.20 +
    productVisibility * 0.25 +
    conversion * 0.20 +
    brand * 0.15,
  );
  const creative = Math.round(Math.min(composite, hardCeiling));

  const tier: "low" | "medium" | "gold" =
    creative >= priority ? "gold" : creative >= minScore ? "medium" : "low";

  return {
    creative_score: creative,
    voice: Math.round(voice),
    motion: Math.round(motion),
    product_visibility: Math.round(productVisibility),
    conversion: Math.round(conversion),
    brand: Math.round(brand),
    tier,
    reasons,
  };
}