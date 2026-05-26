// cinematic-ad-validate — runs after worker reports completion.
// Pulls the row, evaluates the rendered MP4 against the preset's contract
// (aspect ratio, duration, motion score, file size), writes validation_report.
// Two ways to invoke:
//   1) Internal call from cinematic-ad-render-webhook (x-render-secret).
//   2) Admin-triggered re-validate (Bearer token + admin role).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getPreset } from "../_shared/cinematic-presets.ts";
import { validateCategoryMatch, validateTextSafeArea } from "../_shared/pinterest-video-meta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const trace = () => crypto.randomUUID().slice(0, 8);
const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

interface ValidationCheck { name: string; passed: boolean; observed: unknown; expected: unknown; message?: string }
interface ValidationReport {
  passed: boolean;
  checks: ValidationCheck[];
  motion_score: number | null;
  validated_at: string;
  preset: string;
  v2_scores?: {
    mobile_readability: number;
    caption_visibility: number;
    hook_strength: number;
    pacing_quality: number;
    motion_diversity: number;
    scene_diversity: number;
    visual_energy: number;
    retention_likelihood: number;
    cta_clarity: number;
    composite: number;
  };
}

/**
 * V2 QA scoring: derives readability/diversity/energy scores from the
 * stored scene_plan + render report fields. Pure heuristics, no external calls.
 */
function scoreV2(job: any): NonNullable<ValidationReport["v2_scores"]> {
  const plan: any[] = Array.isArray(job.scene_plan) ? job.scene_plan : [];
  const motions = new Set(plan.map((s) => s?.motion).filter(Boolean));
  const crops = new Set(plan.map((s) => s?.crop).filter(Boolean));
  const cats = new Set(plan.map((s) => s?.category).filter(Boolean));
  const sceneCount = plan.length;

  const motion_diversity = sceneCount
    ? Math.min(100, Math.round((motions.size / Math.min(sceneCount, 8)) * 100))
    : Math.min(100, Math.round(Number(job.motion_score ?? 0) * 4));

  const scene_diversity = sceneCount
    ? Math.min(100, Math.round(((crops.size + cats.size) / Math.max(2, sceneCount * 1.4)) * 100))
    : 40;

  // Caption visibility: heuristic — needs hook + cta text, within length limits.
  const hook = String(job.hook_text ?? "").trim();
  const cta = String(job.cta_text ?? "").trim();
  const hookOk = hook.length > 0 && hook.length <= 60;
  const ctaOk = cta.length > 0 && cta.length <= 30;
  const caption_visibility = (hookOk ? 60 : 0) + (ctaOk ? 40 : 0);

  const mobile_readability = Math.round(
    (caption_visibility * 0.5) +
    (Number(job.output_width) === 1080 && Number(job.output_height) === 1920 ? 50 : 10),
  );

  const hook_strength = Number(job.hook_strength_score ?? (hookOk ? 65 : 30));

  // Pacing quality: prefer 5–10 scenes, none > 90 frames
  let pacing_quality = 50;
  if (sceneCount >= 5 && sceneCount <= 12) pacing_quality += 30;
  if (plan.every((s) => Number(s?.durationFrames ?? 0) <= 90)) pacing_quality += 20;
  pacing_quality = Math.min(100, pacing_quality);

  const visual_energy = Math.round((motion_diversity * 0.6) + (Number(job.motion_score ?? 0) * 4));
  const visual_energy_clamped = Math.min(100, visual_energy);

  const retention_likelihood = Math.round(
    hook_strength * 0.35 + pacing_quality * 0.25 + visual_energy_clamped * 0.2 + scene_diversity * 0.2,
  );

  const cta_clarity = ctaOk ? 85 : 35;

  const composite = Math.round(
    motion_diversity * 0.15 +
    scene_diversity * 0.15 +
    caption_visibility * 0.15 +
    mobile_readability * 0.1 +
    hook_strength * 0.15 +
    pacing_quality * 0.1 +
    visual_energy_clamped * 0.1 +
    retention_likelihood * 0.05 +
    cta_clarity * 0.05,
  );

  return {
    motion_diversity, scene_diversity, caption_visibility,
    mobile_readability, hook_strength, pacing_quality,
    visual_energy: visual_energy_clamped, retention_likelihood,
    cta_clarity, composite,
  };
}

function evaluate(job: any): ValidationReport {
  const preset = getPreset(job.preset);
  const checks: ValidationCheck[] = [];

  // 1) Output exists
  checks.push({
    name: "mp4_present",
    passed: typeof job.output_mp4_url === "string" && job.output_mp4_url.length > 0,
    observed: job.output_mp4_url ? "present" : "missing",
    expected: "present",
  });

  // 2) Aspect ratio (worker reports output_width / output_height)
  const w = Number(job.output_width ?? 0);
  const h = Number(job.output_height ?? 0);
  const dimsOk = w === preset.width && h === preset.height;
  checks.push({
    name: "aspect_ratio_9_16",
    passed: dimsOk,
    observed: `${w}x${h}`,
    expected: `${preset.width}x${preset.height}`,
    message: dimsOk ? undefined : "Render dimensions do not match preset. Re-render with viral-vertical composition.",
  });

  // 3) Duration ±1s of preset
  const dur = Number(job.output_duration_seconds ?? 0);
  const durOk = Math.abs(dur - preset.durationSec) <= 1.0;
  checks.push({
    name: "duration_within_tolerance",
    passed: durOk,
    observed: `${dur.toFixed(2)}s`,
    expected: `${preset.durationSec}s ±1s`,
  });

  // 4) Motion score (worker computes via ffmpeg select=gt(scene,0))
  const motion = job.motion_score != null ? Number(job.motion_score) : null;
  const motionOk = motion != null && motion >= preset.motionScoreFloor;
  checks.push({
    name: "motion_score_above_floor",
    passed: motionOk,
    observed: motion ?? "null",
    expected: `>= ${preset.motionScoreFloor}`,
    message: motionOk ? undefined : "Render scored too static — likely a slideshow. Force MotionGenerator or supply more media.",
  });

  // 5) No black bars (worker reports has_black_bars)
  const blackBars = job.output_black_bars === true;
  checks.push({
    name: "no_black_bars",
    passed: !blackBars,
    observed: blackBars ? "detected" : "none",
    expected: "none",
  });

  // 6) Reasonable file size (5 MB .. 60 MB for 18–22s 1080x1920)
  const sz = Number(job.output_file_size_bytes ?? 0);
  const sizeOk = sz > 5 * 1024 * 1024 && sz < 60 * 1024 * 1024;
  checks.push({
    name: "file_size_sane",
    passed: sizeOk,
    observed: `${(sz / 1024 / 1024).toFixed(2)} MB`,
    expected: "5–60 MB",
  });

  const passed = checks.every(c => c.passed);
  return {
    passed,
    checks,
    motion_score: motion,
    validated_at: new Date().toISOString(),
    preset: preset.id,
  };
}

async function authorize(req: Request, admin: any): Promise<{ ok: true; mode: "worker" | "admin" } | { ok: false; status: number; message: string }> {
  const workerSecret = req.headers.get("x-render-secret");
  if (workerSecret && RENDER_WORKER_SECRET && workerSecret === RENDER_WORKER_SECRET) {
    return { ok: true, mode: "worker" };
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return { ok: false, status: 401, message: "unauthenticated" };
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u, error } = await userClient.auth.getUser();
  if (error || !u.user) return { ok: false, status: 401, message: "unauthenticated" };
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  if (!role) return { ok: false, status: 403, message: "admin role required" };
  return { ok: true, mode: "admin" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const auth = await authorize(req, admin);
    if (!auth.ok) return json({ ok: false, traceId, message: auth.message }, auth.status);

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id ?? "");
    if (!jobId) return json({ ok: false, traceId, message: "job_id required" }, 400);

    const { data: job, error } = await admin.from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error || !job) return json({ ok: false, traceId, message: "job not found" }, 404);

    const report = evaluate(job);
  const v2 = scoreV2(job);
  report.v2_scores = v2;

  // ── V3 Creative QA: safe-area, category-match, motion floor, composite ──
  // Load product context (for category match validation)
  let productCtx: any = { slug: job.product_slug };
  try {
    const { data: prod } = await admin
      .from("products")
      .select("slug, name, category, primary_keyword, seo_keywords")
      .eq("slug", job.product_slug).maybeSingle();
    if (prod) productCtx = { ...prod, tags: Array.isArray(prod.seo_keywords) ? prod.seo_keywords : null };
  } catch (_) { /* product may not exist; fall back to slug-only context */ }

  const safeArea = validateTextSafeArea({
    hook_text: job.hook_text,
    pin_title: job.pin_title,
    cta_text: job.cta_text,
    scene_plan: Array.isArray(job.scene_plan) ? job.scene_plan : null,
  });

  const catCheck = validateCategoryMatch({
    product: productCtx,
    title: String(job.pin_title ?? ""),
    description: String(job.pin_description ?? ""),
    hook: String(job.hook_text ?? ""),
  });

  // Settings (motion floor + creative score floor)
  let motionMin = 8, creativeMin = 70, catRequired = true, safeRequired = true;
  try {
    const { data: s2 } = await admin.from("cinematic_ad_settings")
      .select("motion_score_min_threshold, creative_quality_min_score, category_match_required, text_safe_area_required")
      .limit(1).maybeSingle();
    if (s2) {
      motionMin = Number(s2.motion_score_min_threshold ?? motionMin);
      creativeMin = Number(s2.creative_quality_min_score ?? creativeMin);
      catRequired = s2.category_match_required !== false;
      safeRequired = s2.text_safe_area_required !== false;
    }
  } catch (_) { /* defaults */ }

  const motionVal = report.motion_score ?? Number(job.motion_score ?? 0);
  const motionPass = motionVal >= motionMin;

  // Composite creative_quality_score weights the most user-visible signals.
  const creativeQuality = Math.round(
    (safeArea.ok ? 100 : 30) * 0.25 +
    (catCheck.ok ? 100 : 0) * 0.25 +
    Math.min(100, motionVal * 6) * 0.2 +
    v2.composite * 0.3,
  );

  const rejectReasons: string[] = [];
  if (safeRequired && !safeArea.ok) rejectReasons.push(`safe_area:${safeArea.violations.slice(0, 2).join("|")}`);
  if (catRequired && !catCheck.ok) rejectReasons.push(`category_mismatch:${catCheck.reason}`);
  if (!motionPass) rejectReasons.push(`motion_below_floor(${motionVal}<${motionMin})`);
  if (creativeQuality < creativeMin) rejectReasons.push(`creative_quality(${creativeQuality}<${creativeMin})`);

  report.checks.push({
    name: "text_safe_area",
    passed: safeArea.ok,
    observed: safeArea.violations.length ? safeArea.violations.join(" | ") : "ok",
    expected: "all overlay text within 9:16 safe frame, ≤34ch × 2 lines",
  });
  report.checks.push({
    name: "category_match",
    passed: catCheck.ok,
    observed: catCheck.ok ? catCheck.productCategory : `${catCheck.productCategory} vs copy=${catCheck.conflictingCategory}`,
    expected: `copy matches product category (${catCheck.productCategory})`,
    message: catCheck.reason,
  });
  report.checks.push({
    name: "motion_floor",
    passed: motionPass,
    observed: motionVal,
    expected: `>= ${motionMin}`,
  });
  report.checks.push({
    name: "creative_quality_score",
    passed: creativeQuality >= creativeMin,
    observed: creativeQuality,
    expected: `>= ${creativeMin}`,
  });

  // V2 auto-reject thresholds — pulled from settings (with safe defaults).
  let minMotion = 40, minScene = 40, minCaption = 70;
  try {
    const { data: settings } = await admin
      .from("cinematic_ad_settings")
      .select("min_motion_diversity, min_scene_diversity, min_caption_visibility")
      .limit(1)
      .maybeSingle();
    if (settings) {
      minMotion = Number(settings.min_motion_diversity ?? minMotion);
      minScene = Number(settings.min_scene_diversity ?? minScene);
      minCaption = Number(settings.min_caption_visibility ?? minCaption);
    }
  } catch (_) { /* ignore — use defaults */ }

  const v2Pass =
    v2.motion_diversity >= minMotion &&
    v2.scene_diversity >= minScene &&
    v2.caption_visibility >= minCaption;
  if (!v2Pass) {
    report.passed = false;
    report.checks.push({
      name: "v2_quality_floor",
      passed: false,
      observed: `motion=${v2.motion_diversity} scene=${v2.scene_diversity} caption=${v2.caption_visibility}`,
      expected: `motion>=${minMotion} scene>=${minScene} caption>=${minCaption}`,
      message: "Render did not meet v2 quality floors (likely slideshow or unreadable captions).",
    });
  }

  // ── V4 Native short-form scoring ──
  // 1. scene_change_count from scene_plan
  // 2. camera_motion_score = variance of motion types across the plan
  // 3. engagement_pacing_score from pacing validator
  // 4. realism_score: heuristic proxy (motion + diversity + non-static); if
  //    a Gemini multimodal scorer is added later, swap this proxy out.
  // 5. scene_roles required: hook+problem+benefit+cta
  let v4Enabled = true, minCamMotion = 65, minRealism = 70, minPacing = 65;
  let requiredRoles: string[] = ["hook", "problem", "benefit", "cta"];
  let staticHoldMax = 60, hookChangeMax = 24, sceneMinV4 = 36, sceneMaxV4 = 60, piMax = 150;
  try {
    const { data: v4s } = await admin.from("cinematic_ad_settings")
      .select("cinematic_v4_enabled, min_camera_motion_score, min_realism_score, min_engagement_pacing_score, required_scene_roles, static_hold_max_frames, hook_change_max_frames, scene_min_frames_v4, scene_max_frames_v4, pattern_interrupt_every_max_frames")
      .eq("id", true).maybeSingle();
    if (v4s) {
      v4Enabled = v4s.cinematic_v4_enabled !== false;
      minCamMotion = Number(v4s.min_camera_motion_score ?? minCamMotion);
      minRealism = Number(v4s.min_realism_score ?? minRealism);
      minPacing = Number(v4s.min_engagement_pacing_score ?? minPacing);
      requiredRoles = Array.isArray(v4s.required_scene_roles) ? v4s.required_scene_roles as string[] : requiredRoles;
      staticHoldMax = Number(v4s.static_hold_max_frames ?? staticHoldMax);
      hookChangeMax = Number(v4s.hook_change_max_frames ?? hookChangeMax);
      sceneMinV4 = Number(v4s.scene_min_frames_v4 ?? sceneMinV4);
      sceneMaxV4 = Number(v4s.scene_max_frames_v4 ?? sceneMaxV4);
      piMax = Number(v4s.pattern_interrupt_every_max_frames ?? piMax);
    }
  } catch (_) { /* defaults */ }

  const plan: any[] = Array.isArray(job.scene_plan) ? job.scene_plan : [];
  const scene_change_count = plan.length;

  // camera_motion_score: distinct motions × 12 + zoom variance + crop diversity
  const motionsSet = new Set(plan.map((s) => s?.motion).filter(Boolean));
  const cropsSet = new Set(plan.map((s) => s?.crop).filter(Boolean));
  const zooms = plan.map((s) => Number(s?.zoom ?? 1)).filter((z) => !Number.isNaN(z));
  const zoomMean = zooms.reduce((a, z) => a + z, 0) / Math.max(1, zooms.length);
  const zoomVar = zooms.reduce((a, z) => a + (z - zoomMean) ** 2, 0) / Math.max(1, zooms.length);
  const camera_motion_score = Math.min(100, Math.round(
    motionsSet.size * 12 + cropsSet.size * 6 + Math.min(40, zoomVar * 400) + Math.min(20, scene_change_count * 2),
  ));

  // engagement_pacing_score via pacing validator (inline-port; Remotion lib not callable from edge)
  const firstDur = Number(plan[0]?.durationFrames ?? 9999);
  const staticHoldMaxObs = plan.reduce((m, s) => Math.max(m, Number(s?.durationFrames ?? 0)), 0);
  const rolesPresent = new Set((Array.isArray(job.scene_roles) ? job.scene_roles : []).map((r: any) => String(r)));
  const missingRoles = requiredRoles.filter((r) => !rolesPresent.has(r));

  const sceneCountScore = Math.min(100, (scene_change_count / 6) * 80);
  const hookScore = firstDur <= hookChangeMax ? 100 : Math.max(0, 100 - (firstDur - hookChangeMax) * 5);
  const staticScore = Math.max(0, 100 - Math.max(0, staticHoldMaxObs - staticHoldMax) * 2);
  const roleScore = ((requiredRoles.length - missingRoles.length) / requiredRoles.length) * 100;
  const engagement_pacing_score = Math.round(
    sceneCountScore * 0.25 + hookScore * 0.25 + staticScore * 0.25 + roleScore * 0.25,
  );

  // realism_score: proxy = weighted combo of motion floor + diversity + non-static + creativeQuality
  const realism_score = Math.round(
    Math.min(100, motionVal * 6) * 0.3 +
    camera_motion_score * 0.3 +
    Math.min(100, scene_change_count * 12) * 0.2 +
    creativeQuality * 0.2,
  );

  const v4_reject_reasons: string[] = [];
  if (v4Enabled) {
    if (missingRoles.length) v4_reject_reasons.push(`missing_scene_role:${missingRoles.join("|")}`);
    if (camera_motion_score < minCamMotion) v4_reject_reasons.push(`camera_motion(${camera_motion_score}<${minCamMotion})`);
    if (realism_score < minRealism) v4_reject_reasons.push(`realism(${realism_score}<${minRealism})`);
    if (engagement_pacing_score < minPacing) v4_reject_reasons.push(`pacing(${engagement_pacing_score}<${minPacing})`);
    if (staticHoldMaxObs > staticHoldMax * 1.5) v4_reject_reasons.push(`slideshow_feel(hold=${staticHoldMaxObs})`);
  }
  const validation_v4_passed = v4Enabled ? v4_reject_reasons.length === 0 : true;

  report.checks.push({
    name: "v4_camera_motion",
    passed: camera_motion_score >= minCamMotion,
    observed: camera_motion_score,
    expected: `>= ${minCamMotion}`,
  });
  report.checks.push({
    name: "v4_realism",
    passed: realism_score >= minRealism,
    observed: realism_score,
    expected: `>= ${minRealism}`,
  });
  report.checks.push({
    name: "v4_engagement_pacing",
    passed: engagement_pacing_score >= minPacing,
    observed: engagement_pacing_score,
    expected: `>= ${minPacing}`,
  });
  report.checks.push({
    name: "v4_scene_roles_complete",
    passed: missingRoles.length === 0,
    observed: missingRoles.length ? `missing: ${missingRoles.join(",")}` : "all present",
    expected: requiredRoles.join("+"),
  });

  // ── V5 Native Human UGC scoring ──
  // Layered ON TOP of v4 — never weakens existing gates.
  let v5Enabled = true;
  let minMotionEntropy = 6, minRealismConsistency = 7, minUgcAuth = 7;
  let minEmotionalArc = 6, minThumbStop = 7;
  let humanPresenceRatioMin = 0.5, sceneChangeMinV5 = 4, banShowroom = true;
  let staticHoldMaxV5 = 54;
  try {
    const { data: v5s } = await admin.from("cinematic_ad_settings")
      .select("cinematic_v5_enabled, min_motion_entropy, min_realism_consistency, min_ugc_authenticity, min_emotional_arc, min_thumb_stop_score, human_presence_required_ratio, scene_change_min_v5, ban_showroom, max_static_duration_frames_v5")
      .eq("id", true).maybeSingle();
    if (v5s) {
      v5Enabled = v5s.cinematic_v5_enabled !== false;
      minMotionEntropy = Number(v5s.min_motion_entropy ?? minMotionEntropy);
      minRealismConsistency = Number(v5s.min_realism_consistency ?? minRealismConsistency);
      minUgcAuth = Number(v5s.min_ugc_authenticity ?? minUgcAuth);
      minEmotionalArc = Number(v5s.min_emotional_arc ?? minEmotionalArc);
      minThumbStop = Number(v5s.min_thumb_stop_score ?? minThumbStop);
      humanPresenceRatioMin = Number(v5s.human_presence_required_ratio ?? humanPresenceRatioMin);
      sceneChangeMinV5 = Number(v5s.scene_change_min_v5 ?? sceneChangeMinV5);
      banShowroom = v5s.ban_showroom !== false;
      staticHoldMaxV5 = Number(v5s.max_static_duration_frames_v5 ?? staticHoldMaxV5);
    }
  } catch (_) { /* defaults */ }

  const beatsV5: any[] = Array.isArray((job as any).beats_v5) ? (job as any).beats_v5 : [];

  // motion_entropy_score: blends camera_motion variance + crop/motion type
  // diversity into a 0-10 scale. Cheap, deterministic, no extra LLM calls.
  const motion_entropy_score = Math.min(10, Math.round(
    (motionsSet.size * 1.4 + cropsSet.size * 1.0 + Math.min(3, scene_change_count / 3) + Math.min(2, zoomVar * 10)) * 0.85,
  ));

  // realism_consistency_score: proxy on motion+composite scores until a
  // Gemini multimodal scorer is added — high motion + high creative quality
  // implies consistent realistic capture.
  const realism_consistency_score = Math.min(10, Math.round((motionVal * 0.5 + creativeQuality / 12)));

  // ugc_authenticity_score: penalises showroom-style flags + high uniformity
  // (low scene/motion diversity reads as "rendered" rather than "captured").
  const envFlagsV5: string[] = [];
  const captionStr = `${String(job.hook_text ?? "")} ${String(job.pin_title ?? "")} ${String(job.pin_description ?? "")}`.toLowerCase();
  if (banShowroom) {
    if (/showroom|studio|magazine|sterile/.test(captionStr)) envFlagsV5.push("showroom_copy");
  }
  if (motionsSet.size <= 1) envFlagsV5.push("low_motion_variety");
  if (cropsSet.size <= 1) envFlagsV5.push("uniform_framing");
  const ugc_authenticity_score = Math.max(0, Math.min(10,
    Math.round(8 - envFlagsV5.length * 1.5 + (motionsSet.size > 2 ? 1 : 0) + (camera_motion_score > 70 ? 1 : 0)),
  ));

  // emotional_arc_score from beats valence escalation (tension→relief).
  const valences = beatsV5.map((b) => Number(b?.valence ?? 60));
  const peakIdx = valences.indexOf(Math.max(...valences));
  const endValence = valences[valences.length - 1] ?? 60;
  const hasEscalation = valences.length >= 4 && peakIdx > 0 && endValence >= 70;
  const emotional_arc_score = Math.max(0, Math.min(10,
    Math.round((hasEscalation ? 8 : 5) + (valences.length >= 6 ? 1 : 0) + (endValence >= 90 ? 1 : 0)),
  ));

  // thumb_stop_score: blends hook_strength + visual_energy + contrast proxy.
  const thumb_stop_score = Math.max(0, Math.min(10, Math.round(
    (v2.hook_strength * 0.04) + (v2.visual_energy * 0.03) + (v2.caption_visibility * 0.02) + 1,
  )));

  // human_presence_ratio
  const humanBeats = beatsV5.filter((b) => b?.human_presence === true).length;
  const human_presence_ratio = beatsV5.length > 0 ? +(humanBeats / beatsV5.length).toFixed(2) : 0;

  const v5_reject_reasons: string[] = [];
  if (v5Enabled) {
    if (beatsV5.length > 0 && beatsV5.length < sceneChangeMinV5) v5_reject_reasons.push(`scene_change_count(${beatsV5.length}<${sceneChangeMinV5})`);
    if (motion_entropy_score < minMotionEntropy) v5_reject_reasons.push(`motion_entropy(${motion_entropy_score}<${minMotionEntropy})`);
    if (realism_consistency_score < minRealismConsistency) v5_reject_reasons.push(`realism_consistency(${realism_consistency_score}<${minRealismConsistency})`);
    if (ugc_authenticity_score < minUgcAuth) v5_reject_reasons.push(`ugc_authenticity(${ugc_authenticity_score}<${minUgcAuth})`);
    if (emotional_arc_score < minEmotionalArc) v5_reject_reasons.push(`emotional_arc(${emotional_arc_score}<${minEmotionalArc})`);
    if (thumb_stop_score < minThumbStop) v5_reject_reasons.push(`thumb_stop(${thumb_stop_score}<${minThumbStop})`);
    if (beatsV5.length > 0 && human_presence_ratio < humanPresenceRatioMin) v5_reject_reasons.push(`human_presence(${human_presence_ratio}<${humanPresenceRatioMin})`);
    if (staticHoldMaxObs > staticHoldMaxV5 * 1.5) v5_reject_reasons.push(`static_hold(${staticHoldMaxObs}>${staticHoldMaxV5})`);
    if (banShowroom && envFlagsV5.includes("showroom_copy")) v5_reject_reasons.push("showroom_copy");
  }
  const validation_v5_passed = v5Enabled ? v5_reject_reasons.length === 0 : true;

  report.checks.push({ name: "v5_motion_entropy", passed: motion_entropy_score >= minMotionEntropy, observed: motion_entropy_score, expected: `>= ${minMotionEntropy}` });
  report.checks.push({ name: "v5_realism_consistency", passed: realism_consistency_score >= minRealismConsistency, observed: realism_consistency_score, expected: `>= ${minRealismConsistency}` });
  report.checks.push({ name: "v5_ugc_authenticity", passed: ugc_authenticity_score >= minUgcAuth, observed: ugc_authenticity_score, expected: `>= ${minUgcAuth}` });
  report.checks.push({ name: "v5_emotional_arc", passed: emotional_arc_score >= minEmotionalArc, observed: emotional_arc_score, expected: `>= ${minEmotionalArc}` });
  report.checks.push({ name: "v5_thumb_stop", passed: thumb_stop_score >= minThumbStop, observed: thumb_stop_score, expected: `>= ${minThumbStop}` });
  report.checks.push({ name: "v5_human_presence", passed: beatsV5.length === 0 || human_presence_ratio >= humanPresenceRatioMin, observed: human_presence_ratio, expected: `>= ${humanPresenceRatioMin}` });

    const patch: Record<string, unknown> = {
      validation_report: report,
      motion_score: report.motion_score,
      validation_passed: report.passed,
      text_safe_area_passed: safeArea.ok,
      category_match_passed: catCheck.ok,
      creative_quality_score: creativeQuality,
      creative_reject_reason: rejectReasons.length ? rejectReasons.join(" ; ") : null,
      captions_visible: Boolean(job.hook_text || job.pin_title || job.cta_text || job.vo_script),
      duration_valid: report.checks.find((c) => c.name === "duration_within_tolerance")?.passed ?? false,
      motion_exists: report.checks.find((c) => c.name === "motion_score_above_floor")?.passed ?? (Number(report.motion_score ?? 0) > 0),
      video_corrupted: !report.checks.find((c) => c.name === "mp4_present")?.passed,
      pipeline_stage: report.passed ? "qa_passed" : "qa_needs_review",
      motion_diversity_score: v2.motion_diversity,
      caption_visibility_score: v2.caption_visibility,
      mobile_readability_score: v2.mobile_readability,
      hook_strength_score: v2.hook_strength,
      pacing_quality_score: v2.pacing_quality,
      visual_energy_score: v2.visual_energy,
      retention_likelihood_score: v2.retention_likelihood,
      cta_clarity_score: v2.cta_clarity,
      scene_entropy_score: v2.scene_diversity,
      scene_change_count,
      camera_motion_score,
      realism_score,
      engagement_pacing_score,
      validation_v4_passed,
      v4_reject_reasons,
      motion_entropy_score,
      realism_consistency_score,
      ugc_authenticity_score,
      emotional_arc_score,
      thumb_stop_score,
      human_presence_ratio,
      environment_flags: envFlagsV5,
      validation_v5_passed,
      v5_reject_reasons,
    };
    // Don't auto-flip status; the webhook owns lifecycle. But surface failure
    // in status_message so the dashboard reflects it.
    if (!report.passed) {
      patch.status_message = `validation failed (${report.checks.filter(c => !c.passed).map(c => c.name).join(", ")})`;
    } else {
      patch.status_message = "validation passed — awaiting approval";
    }

    // Flip status to 'creative_rejected' when any hard creative gate fails.
    const combinedRejects = [...rejectReasons, ...v4_reject_reasons, ...v5_reject_reasons];
    if (combinedRejects.length > 0 && (job.status === "awaiting_approval" || job.status === "publishable" || job.status === "approved" || job.status === "completed" || job.status === "render_complete")) {
      patch.status = "creative_rejected";
      patch.status_message = `creative rejected: ${combinedRejects.slice(0, 3).join(" ; ")}`;
    }

    const { error: updErr } = await admin.from("cinematic_ad_jobs").update(patch).eq("id", jobId);
    if (updErr) return json({ ok: false, traceId, message: updErr.message }, 500);

    console.log(`[validate] ${traceId} job=${jobId} passed=${report.passed} motion=${report.motion_score}`);
    return json({ ok: true, traceId, report });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});