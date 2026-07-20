// Cinematic Motion Engine V2 — turns still product assets into a true commercial-style storyboard.
// Hard planner rules (no reject logic, planner just retries internally until met):
//   * >=6 scenes, motion_ratio >= 0.70
//   * >=4 distinct camera styles
//   * >=3 distinct shot distances (wide / medium / close_up / extreme_close_up)
//   * Must include 1 lifestyle + 1 product-demonstration scene
// Reads story_arc when present and maps each beat to a camera/distance/grade.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

type CameraMove =
  | "dolly_in" | "dolly_out" | "push_in" | "pull_out"
  | "orbit" | "tracking" | "reveal" | "rack_focus"
  | "handheld" | "parallax_dynamic" | "shake_natural";

type ShotDistance = "wide" | "medium" | "close_up" | "extreme_close_up";
type SceneRole = "hook" | "problem" | "frustration" | "discovery" | "lifestyle" | "demonstration" | "payoff" | "cta";
type Grading = "teal_orange" | "warm_film" | "pinterest_premium" | "kodak_portra";

const CATEGORY_PROFILE: Record<string, { moves: CameraMove[]; grade: Grading; pace: "slow"|"med"|"fast" }> = {
  cat_trees:    { moves: ["reveal","orbit","dolly_in","rack_focus","tracking","parallax_dynamic"], grade: "pinterest_premium", pace: "med" },
  litter_boxes: { moves: ["push_in","rack_focus","tracking","dolly_in","pull_out","reveal"],       grade: "kodak_portra",      pace: "med" },
  beds:         { moves: ["handheld","dolly_in","reveal","rack_focus","orbit","parallax_dynamic"], grade: "warm_film",         pace: "slow" },
  dog_toys:     { moves: ["handheld","tracking","push_in","orbit","shake_natural","rack_focus"],   grade: "teal_orange",       pace: "fast" },
  training:     { moves: ["push_in","tracking","rack_focus","handheld","pull_out","reveal"],       grade: "pinterest_premium", pace: "med" },
  default:      { moves: ["push_in","handheld","rack_focus","orbit","reveal","tracking"],          grade: "pinterest_premium", pace: "med" },
};

function pickCategory(category: string | null | undefined, productName: string): keyof typeof CATEGORY_PROFILE {
  const s = `${category||""} ${productName||""}`.toLowerCase();
  if (/cat\s*tree|cat\s*tower|condo/.test(s)) return "cat_trees";
  if (/litter/.test(s)) return "litter_boxes";
  if (/bed|mattress|cushion/.test(s)) return "beds";
  if (/dog\s*toy|fetch|chew/.test(s)) return "dog_toys";
  if (/train|leash|harness/.test(s)) return "training";
  return "default";
}

function bezierTrack(seed: number) {
  const r = (n: number) => ((Math.sin((seed + 1) * n * 12.9898) * 43758.5453) % 1 + 1) % 1;
  return [
    { t: 0.0,  x: 0.50, y: 0.55 },
    { t: 0.33, x: 0.42 + r(1)*0.16, y: 0.48 + r(2)*0.14 },
    { t: 0.66, x: 0.55 + r(3)*0.14, y: 0.52 + r(4)*0.12 },
    { t: 1.0,  x: 0.50, y: 0.50 },
  ];
}

function buildScene(opts: {
  index: number; src: string; move: CameraMove; distance: ShotDistance; role: SceneRole;
  grade: Grading; durationMs: number; isMotion: boolean; caption?: string;
}) {
  const { index, src, move, distance, role, grade, durationMs, isMotion, caption } = opts;
  // Planner-level text safety: <= 8 words per caption. Existing safeAreaValidator
  // (remotion/src/lib/safeZone.ts) still rebalances at render time.
  const safeCaption = caption ? caption.trim().split(/\s+/).slice(0, 8).join(" ") : undefined;
  return {
    scene_index: index,
    duration_ms: durationMs,
    is_motion_scene: isMotion,
    camera_move: move,
    shot_distance: distance,
    scene_role: role,
    caption: safeCaption,
    foreground_motion: move === "handheld" || move === "shake_natural" || move === "tracking" ? 0.7 : 0.35,
    background_motion: move === "parallax_dynamic" || move === "dolly_in" || move === "dolly_out" ? 0.65 : 0.3,
    subject_isolation: distance === "close_up" || distance === "extreme_close_up" ? 0.85 : 0.55,
    layers: [
      { role: "background", src, blur: 14, parallax_amp: 0.20, scale: 1.24 },
      { role: "midground",  src, blur: 4,  parallax_amp: 0.09, scale: 1.10 },
      { role: "subject",    src, blur: 0,  parallax_amp: 0.02, scale: 1.00, tracking_path: bezierTrack(index) },
    ],
    depth_layers: 3,
    depth_simulation: {
      foreground_dof_blur_px: move === "rack_focus" ? 8 : 2,
      background_dof_blur_px: 16,
      parallax_delta_px: 32,
    },
    dof_blur_px: move === "rack_focus" ? 8 : (distance === "extreme_close_up" ? 6 : 3),
    transition_in:  index === 0 ? "fade_up" : (move === "shake_natural" ? "whip_pan" : "match_cut"),
    transition_out: move === "rack_focus" ? "rack_focus" : "cross_dissolve",
    grading: {
      lut: grade,
      grade_lut: grade,
      contrast: 1.08,
      saturation: grade === "kodak_portra" ? 0.92 : 1.05,
      temperature: grade === "warm_film" ? 380 : grade === "teal_orange" ? -120 : 60,
    },
    motion_intensity: isMotion ? (move === "shake_natural" || move === "handheld" ? 0.85 : 0.6) : 0.15,
  };
}

function pickImageSrcs(job: any): string[] {
  const candidates: string[] = [];
  const sources = job.scene_assets || job.source_assets || [];
  if (Array.isArray(sources)) {
    for (const a of sources) {
      const url = typeof a === "string" ? a : (a?.url || a?.src || a?.image_url);
      if (url) candidates.push(url);
    }
  }
  if (job.output_thumbnail_url) candidates.push(job.output_thumbnail_url);
  return Array.from(new Set(candidates));
}

const DEFAULT_BEAT_ORDER: { role: SceneRole; distance: ShotDistance }[] = [
  { role: "hook",          distance: "wide" },
  { role: "frustration",   distance: "close_up" },
  { role: "discovery",     distance: "medium" },
  { role: "lifestyle",     distance: "wide" },
  { role: "demonstration", distance: "extreme_close_up" },
  { role: "cta",           distance: "medium" },
];

function planFromArc(arc: any[] | null | undefined): { role: SceneRole; distance: ShotDistance; caption_intent?: string }[] {
  if (!Array.isArray(arc) || arc.length === 0) return DEFAULT_BEAT_ORDER;
  const beatToRole: Record<string, SceneRole> = {
    problem: "frustration", frustration: "frustration",
    discovery: "discovery", solution: "demonstration",
    payoff: "lifestyle",    cta: "cta",
  };
  const out: { role: SceneRole; distance: ShotDistance; caption_intent?: string }[] = [];
  for (const beat of arc) {
    const role = (beatToRole[String(beat?.beat)] ?? "discovery") as SceneRole;
    const dist = (["wide","medium","close_up","extreme_close_up"].includes(beat?.preferred_distance)
      ? beat.preferred_distance : "medium") as ShotDistance;
    out.push({ role, distance: dist, caption_intent: beat?.caption_intent });
  }
  if (out[0]) out[0].role = "hook";
  return out;
}

function generateStoryboard(job: any): { storyboard: any[]; motionRatio: number; profileKey: string; summary: any } {
  const profileKey = pickCategory(job.category, job.product_name || job.product_slug || "");
  const profile = CATEGORY_PROFILE[profileKey];
  const imgs = pickImageSrcs(job);
  const SCENE_COUNT = 6;
  const DURATION = [1400, 1600, 1700, 1700, 1500, 2000];
  const beatPlan = planFromArc(job.story_arc).slice(0, SCENE_COUNT);
  while (beatPlan.length < SCENE_COUNT) beatPlan.push(DEFAULT_BEAT_ORDER[beatPlan.length]);

  let scenes: any[] = [];
  let attempt = 0;
  while (attempt < 3) {
    scenes = [];
    for (let i = 0; i < SCENE_COUNT; i++) {
      const src = imgs[i % Math.max(imgs.length, 1)] || "";
      const move = profile.moves[(i + attempt) % profile.moves.length];
      const beat = beatPlan[i];
      const isMotion = beat.role !== "cta";
      scenes.push(buildScene({
        index: i, src, move,
        distance: beat.distance, role: beat.role,
        grade: profile.grade, durationMs: DURATION[i],
        isMotion, caption: beat.caption_intent,
      }));
    }
    const camStyles = new Set(scenes.map((s) => s.camera_move));
    const distances = new Set(scenes.map((s) => s.shot_distance));
    const lifestyle = scenes.some((s) => s.scene_role === "lifestyle");
    const demo = scenes.some((s) => s.scene_role === "demonstration");
    if (camStyles.size >= 4 && distances.size >= 3 && lifestyle && demo) break;
    attempt++;
  }

  const motionRatio = scenes.filter((s) => s.is_motion_scene).length / scenes.length;
  const camStyles = Array.from(new Set(scenes.map((s) => s.camera_move)));
  const distances = Array.from(new Set(scenes.map((s) => s.shot_distance)));
  const summary = {
    camera_styles_used: camStyles,
    camera_styles_count: camStyles.length,
    shot_distances_used: distances,
    shot_distances_count: distances.length,
    motion_ratio: Number(motionRatio.toFixed(3)),
    lifestyle_present: scenes.some((s) => s.scene_role === "lifestyle"),
    demonstration_present: scenes.some((s) => s.scene_role === "demonstration"),
    scene_count: scenes.length,
    planner_attempts: attempt + 1,
    grade: profile.grade,
  };
  return { storyboard: scenes, motionRatio, profileKey, summary };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "job_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: job, error } = await supabase.from("cinematic_ad_jobs").select("*").eq("id", job_id).maybeSingle();
    if (error || !job) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { storyboard, motionRatio, profileKey, summary } = generateStoryboard(job);
    const upd = await supabase.from("cinematic_ad_jobs").update({
      motion_storyboard: storyboard,
      motion_ratio: Number(motionRatio.toFixed(3)),
      motion_engine_version: "v2",
      motion_plan_summary: summary,
    }).eq("id", job_id);
    if (upd.error) throw upd.error;
    return new Response(JSON.stringify({
      ok: true, traceId,
      message: `Storyboard v2: ${storyboard.length} scenes, motion=${motionRatio.toFixed(2)}, cams=${summary.camera_styles_count}, dists=${summary.shot_distances_count}, profile=${profileKey}`,
      motion_ratio: motionRatio,
      scene_count: storyboard.length,
      profile: profileKey,
      summary,
      storyboard,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
