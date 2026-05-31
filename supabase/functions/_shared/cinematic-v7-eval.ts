// Pure, dependency-free V7 evaluator. Mirrors the inline logic in
// cinematic-ad-validate/index.ts so the gate can be unit-tested with
// fixture jobs (single-image Ken-Burns vs valid multi-scene edits).
//
// IMPORTANT: keep this in lockstep with the V7 block in
// supabase/functions/cinematic-ad-validate/index.ts. The validate function
// imports `evaluateV7` from here — any logic change must land in this file.

export interface V7Thresholds {
  v7Enabled: boolean;
  minPinterestQuality: number;
  minUniqueScenesV7: number;
  minUniqueCamerasV7: number;
  minSceneCountV7: number;
  minCloseupsV7: number;
  minLifestyleV7: number;
  minProductDemoV7: number;
  textSafeZoneTolerance: number;
  maxCaptionDensityV7: number;
  maxDenseCaptionRatioV7: number;
}

export const DEFAULT_V7_THRESHOLDS: V7Thresholds = {
  v7Enabled: true,
  minPinterestQuality: 90,
  minUniqueScenesV7: 4,
  minUniqueCamerasV7: 3,
  minSceneCountV7: 5,
  minCloseupsV7: 1,
  minLifestyleV7: 1,
  minProductDemoV7: 1,
  textSafeZoneTolerance: 0,
  maxCaptionDensityV7: 0.25,
  maxDenseCaptionRatioV7: 0.34,
};

export interface V7Input {
  job: any;
  productCtx: { name?: string; category?: string; primary_keyword?: string } | null;
  safeArea: { ok: boolean; violations: string[] };
  v2: { hook_strength: number; composite: number };
}

export interface V7Result {
  scene_diversity_v7_score: number;
  camera_diversity_score: number;
  hook_strength_v7_score: number;
  text_safety_score: number;
  pinterest_quality_score: number;
  v7_reject_reasons: string[];
  validation_v7_passed: boolean;
  detection_debug: {
    is_app_product: boolean;
    strict: { closeup: number; lifestyle: number; product_demo: number; cta_frame: boolean; app_control: boolean };
    final:  { closeup: number; lifestyle: number; product_demo: number; cta_frame: boolean; app_control: boolean };
    retry_used: string[];
    scene_count: number;
    haystack_lengths: number[];
    ken_burns_only: boolean;
    unique_scenes: number;
    unique_cameras: number;
    text_outside_safe: boolean;
    text_cut_off: boolean;
    too_much_text: boolean;
  };
  decision_trace: Array<{
    rule: string;
    threshold: number | boolean;
    strict_value: number | boolean;
    final_value: number | boolean;
    decided_by: "strict_pass" | "retry_pass" | "strict_fail" | "retry_failed" | "not_applicable";
    borderline: boolean;
    note?: string;
  }>;
}

const RX = {
  closeup: /close[-_ ]?up|macro|tight|detail|texture|fabric|paw|whisker|fur|claw/,
  lifestyle: /lifestyle|home|owner|room|environment|living|sofa|kitchen|bedroom|outdoor|garden|backyard|family|pet[-_ ]?parent/,
  demoStrict: /demo|in[-_ ]?use|action|using|operating/,
  demoBroad: /demo|in[-_ ]?use|action|using|operating|playing|eating|drinking|scooping|cleaning|chewing|scratching|grooming|sleeping|product[-_ ]?shot|hero[-_ ]?shot/,
  cta: /\bcta\b|shop|buy|order|get yours|learn more|tap|swipe up|link in bio/,
  appControlStrict: /app|phone|screen|ui|control|tap|swipe/,
  appControlBroad: /app|phone|smartphone|ios|android|screen|display|ui|interface|control|tap|swipe|button|notification|dashboard|settings|remote/,
};

function countMatches(re: RegExp, sources: string[]) {
  return sources.reduce((n, h) => n + (re.test(h) ? 1 : 0), 0);
}

export function evaluateV7(input: V7Input, thresholds: V7Thresholds = DEFAULT_V7_THRESHOLDS): V7Result {
  const { job, productCtx, safeArea, v2 } = input;
  const t = thresholds;

  const plan: any[] = Array.isArray(job.scene_plan) ? job.scene_plan : [];

  const planRoles = plan.map((s) => String(s?.role ?? s?.category ?? s?.shotType ?? "").toLowerCase());
  const planCrops = plan.map((s) => String(s?.crop ?? s?.framing ?? "").toLowerCase());
  const planMotionsArr = plan.map((s) => String(s?.motion ?? "").toLowerCase());
  const sceneSignatures = new Set(
    plan.map((s) => `${s?.crop ?? ""}|${s?.motion ?? ""}|${s?.category ?? s?.role ?? ""}`).filter((k) => k !== "||"),
  );
  const uniqueScenesV7 = sceneSignatures.size;
  const uniqueCamerasV7 = new Set(planCrops.filter(Boolean)).size;

  const sceneAssetsForDetect: any[] = Array.isArray(job.scene_assets) ? job.scene_assets : [];
  const beatsForDetect: any[] = Array.isArray(job.beats_v5) ? job.beats_v5 : [];
  const voLines: string[] = String(job.vo_script ?? "").split(/\r?\n|\.|;/);
  const sceneHaystacks = plan.map((s, i) => {
    const asset = sceneAssetsForDetect[i] ?? {};
    const beat = beatsForDetect[i] ?? {};
    return [
      planRoles[i], planCrops[i], planMotionsArr[i],
      String(s?.category ?? ""), String(s?.caption ?? ""), String(s?.prompt ?? ""),
      String(s?.shotType ?? ""), String(s?.description ?? ""),
      String(asset?.prompt ?? ""), String(asset?.label ?? ""), String(asset?.category ?? ""),
      String(beat?.description ?? ""), String(beat?.action ?? ""),
      String(voLines[i] ?? ""),
    ].join(" ").toLowerCase();
  });

  // Strict pass
  const strictRoles = planRoles.map((r, i) => `${r} ${String(plan[i]?.category ?? "")} ${planCrops[i] ?? ""}`);
  const closeupStrict = countMatches(RX.closeup, strictRoles);
  const lifestyleStrict = countMatches(RX.lifestyle, strictRoles);
  const productDemoStrict = countMatches(RX.demoStrict, strictRoles);
  const ctaFrameStrict = plan.some((s, i) => s?.isCta === true || /cta/i.test(strictRoles[i]));

  const productCtxStr = `${String(productCtx?.name ?? "")} ${String(productCtx?.category ?? "")} ${String((productCtx as any)?.primary_keyword ?? "")}`.toLowerCase();
  const isAppProduct = /\bapp\b|smart|wifi|bluetooth|automat|connected/.test(productCtxStr);
  const appControlStrict = !isAppProduct || plan.some((s, i) =>
    RX.appControlStrict.test(`${strictRoles[i]} ${String(s?.caption ?? "")}`),
  );

  // Retry pass
  const retryUsed: string[] = [];
  let closeupCount = closeupStrict;
  let lifestyleCount = lifestyleStrict;
  let productDemoCount = productDemoStrict;
  let hasCtaFrame = ctaFrameStrict;
  let hasAppControlShot = appControlStrict;

  if (closeupCount < t.minCloseupsV7) {
    const retry = countMatches(RX.closeup, sceneHaystacks);
    if (retry > closeupCount) { retryUsed.push(`closeup:${closeupCount}->${retry}`); closeupCount = retry; }
  }
  if (lifestyleCount < t.minLifestyleV7) {
    const retry = countMatches(RX.lifestyle, sceneHaystacks);
    if (retry > lifestyleCount) { retryUsed.push(`lifestyle:${lifestyleCount}->${retry}`); lifestyleCount = retry; }
  }
  if (productDemoCount < t.minProductDemoV7) {
    const retry = countMatches(RX.demoBroad, sceneHaystacks);
    if (retry > productDemoCount) { retryUsed.push(`product_demo:${productDemoCount}->${retry}`); productDemoCount = retry; }
  }
  if (!hasCtaFrame) {
    const retry = sceneHaystacks.some((h) => RX.cta.test(h)) || /shop|buy|order|cta/i.test(String(job.cta_text ?? ""));
    if (retry) { retryUsed.push("cta:retry_hit"); hasCtaFrame = true; }
  }
  if (isAppProduct && !hasAppControlShot) {
    const retry = sceneHaystacks.some((h) => RX.appControlBroad.test(h)) ||
      sceneAssetsForDetect.some((a) => RX.appControlBroad.test(`${a?.prompt ?? ""} ${a?.label ?? ""}`));
    if (retry) { retryUsed.push("app_control:retry_hit"); hasAppControlShot = true; }
  }

  const hasCloseup = closeupCount >= t.minCloseupsV7;
  const hasLifestyle = lifestyleCount >= t.minLifestyleV7;
  const hasProductDemo = productDemoCount >= t.minProductDemoV7;

  // ── Decision trace ─────────────────────────────────────────────────────
  // For each borderline-capable rule, record which detection pass (strict
  // vs retry) produced the final value, so we can audit why a marginal job
  // was approved or rejected.
  const trace: V7Result["decision_trace"] = [];
  const traceCount = (
    rule: string,
    threshold: number,
    strictVal: number,
    finalVal: number,
  ) => {
    const strictPassed = strictVal >= threshold;
    const finalPassed = finalVal >= threshold;
    let decided_by: V7Result["decision_trace"][number]["decided_by"];
    if (strictPassed) decided_by = "strict_pass";
    else if (finalPassed) decided_by = "retry_pass";
    else if (finalVal > strictVal) decided_by = "retry_failed";
    else decided_by = "strict_fail";
    trace.push({
      rule,
      threshold,
      strict_value: strictVal,
      final_value: finalVal,
      decided_by,
      borderline: !strictPassed,
      note: !strictPassed && finalPassed
        ? `recovered by retry haystack (${strictVal}->${finalVal})`
        : !strictPassed && finalVal > strictVal
        ? `retry raised ${strictVal}->${finalVal} but still below ${threshold}`
        : undefined,
    });
  };
  const traceBool = (
    rule: string,
    strictVal: boolean,
    finalVal: boolean,
    applicable = true,
  ) => {
    let decided_by: V7Result["decision_trace"][number]["decided_by"];
    if (!applicable) decided_by = "not_applicable";
    else if (strictVal) decided_by = "strict_pass";
    else if (finalVal) decided_by = "retry_pass";
    else decided_by = "strict_fail";
    trace.push({
      rule,
      threshold: true,
      strict_value: strictVal,
      final_value: finalVal,
      decided_by,
      borderline: applicable && !strictVal,
      note: applicable && !strictVal && finalVal ? "recovered by retry haystack" : undefined,
    });
  };
  traceCount("closeup", t.minCloseupsV7, closeupStrict, closeupCount);
  traceCount("lifestyle", t.minLifestyleV7, lifestyleStrict, lifestyleCount);
  traceCount("product_demo", t.minProductDemoV7, productDemoStrict, productDemoCount);
  traceBool("cta_frame", ctaFrameStrict, hasCtaFrame);
  traceBool("app_control", appControlStrict, hasAppControlShot, isAppProduct);

  // Ken-Burns-only detection
  const motionTokens = planMotionsArr.filter(Boolean);
  const kenBurnsOnly = motionTokens.length > 0 &&
    motionTokens.every((m) => /zoom|ken[_ -]?burns|pan|push|pull|dolly_slow/.test(m)) &&
    !motionTokens.some((m) => /whip|cut|parallax|handheld|shake|orbit|tilt/.test(m));

  // Text safety
  const safeAreaViolations = Array.isArray(safeArea.violations) ? safeArea.violations : [];
  const textCutOff = safeAreaViolations.some((v: string) =>
    /truncat|clamp|overflow|cut|too_long|exceeds/i.test(v),
  );
  const safeViolationRatio = plan.length > 0
    ? Math.min(1, safeAreaViolations.length / plan.length)
    : (safeArea.ok ? 0 : 1);
  const textOutsideSafe = !safeArea.ok && safeViolationRatio > t.textSafeZoneTolerance;

  const captionCharLimit = Math.max(8, Math.round(36 * t.maxCaptionDensityV7 * 4));
  const overTextFrames = plan.filter((s) => {
    const cap = String(s?.caption ?? "").trim();
    return cap.length > 0 && (cap.length / 36) > t.maxCaptionDensityV7 && cap.length > captionCharLimit;
  }).length;
  const tooMuchText = plan.length > 0 && (overTextFrames / plan.length) > t.maxDenseCaptionRatioV7;

  const v7_reject_reasons: string[] = [];
  if (t.v7Enabled) {
    if (plan.length < t.minSceneCountV7) v7_reject_reasons.push(`scene_count(${plan.length}<${t.minSceneCountV7})`);
    if (uniqueScenesV7 < t.minUniqueScenesV7) v7_reject_reasons.push(`unique_scenes(${uniqueScenesV7}<${t.minUniqueScenesV7})`);
    if (uniqueCamerasV7 < t.minUniqueCamerasV7) v7_reject_reasons.push(`unique_cameras(${uniqueCamerasV7}<${t.minUniqueCamerasV7})`);
    if (textOutsideSafe) v7_reject_reasons.push("text_outside_safe_zone");
    if (textCutOff) v7_reject_reasons.push("text_cut_off");
    if (kenBurnsOnly) v7_reject_reasons.push("ken_burns_zoom_only");
    if (!hasProductDemo) v7_reject_reasons.push("missing_product_demo_shot");
    if (isAppProduct && !hasAppControlShot) v7_reject_reasons.push("missing_app_control_shot");
    if (!hasCtaFrame) v7_reject_reasons.push("missing_cta_frame");
    if (!hasCloseup) v7_reject_reasons.push("missing_closeup");
    if (!hasLifestyle) v7_reject_reasons.push("missing_lifestyle_scene");
    if (tooMuchText) v7_reject_reasons.push(`text_density_excessive(${overTextFrames}/${plan.length})`);
  }

  const scene_diversity_v7_score = Math.min(100, Math.round((uniqueScenesV7 / Math.max(t.minUniqueScenesV7, 6)) * 100));
  const camera_diversity_score = Math.min(100, Math.round((uniqueCamerasV7 / Math.max(t.minUniqueCamerasV7, 5)) * 100));
  const hook_strength_v7_score = Math.round(v2.hook_strength);
  const text_safety_score = Math.max(0, Math.min(100, Math.round(
    (textOutsideSafe ? 0 : 50) +
    (textCutOff ? 0 : 25) +
    (tooMuchText ? 0 : 25),
  )));
  const pinterest_quality_score = Math.round(
    scene_diversity_v7_score * 0.25 +
    camera_diversity_score * 0.20 +
    hook_strength_v7_score * 0.20 +
    text_safety_score * 0.20 +
    Math.min(100, v2.composite) * 0.15,
  );

  const validation_v7_passed = t.v7Enabled
    ? (v7_reject_reasons.length === 0 && pinterest_quality_score > t.minPinterestQuality)
    : true;

  return {
    scene_diversity_v7_score,
    camera_diversity_score,
    hook_strength_v7_score,
    text_safety_score,
    pinterest_quality_score,
    v7_reject_reasons,
    validation_v7_passed,
    detection_debug: {
      is_app_product: isAppProduct,
      strict: {
        closeup: closeupStrict,
        lifestyle: lifestyleStrict,
        product_demo: productDemoStrict,
        cta_frame: ctaFrameStrict,
        app_control: appControlStrict,
      },
      final: {
        closeup: closeupCount,
        lifestyle: lifestyleCount,
        product_demo: productDemoCount,
        cta_frame: hasCtaFrame,
        app_control: hasAppControlShot,
      },
      retry_used: retryUsed,
      scene_count: plan.length,
      haystack_lengths: sceneHaystacks.map((h) => h.length),
      ken_burns_only: kenBurnsOnly,
      unique_scenes: uniqueScenesV7,
      unique_cameras: uniqueCamerasV7,
      text_outside_safe: textOutsideSafe,
      text_cut_off: textCutOff,
      too_much_text: tooMuchText,
    },
    decision_trace: trace,
  };
}