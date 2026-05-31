// Cinematic Motion Engine — turns still product assets into a true commercial-style storyboard.
// Enforces ≥70% motion scenes, multi-camera moves, parallax + DoF + grading. No reject logic.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

type CameraMove =
  | "push_in" | "pull_out" | "orbit" | "dolly"
  | "crane_down" | "crane_up" | "handheld_follow"
  | "rack_focus_pull" | "whip_pan" | "match_cut_close";

type Grading = "teal_orange" | "warm_film" | "pinterest_premium" | "kodak_portra";

const CATEGORY_PROFILE: Record<string, { moves: CameraMove[]; grade: Grading; pace: "slow"|"med"|"fast" }> = {
  cat_trees:      { moves: ["crane_down","orbit","push_in","rack_focus_pull","handheld_follow"], grade: "pinterest_premium", pace: "med" },
  litter_boxes:   { moves: ["push_in","rack_focus_pull","match_cut_close","dolly","pull_out"],   grade: "kodak_portra",      pace: "med" },
  beds:           { moves: ["handheld_follow","push_in","crane_down","rack_focus_pull","dolly"], grade: "warm_film",         pace: "slow" },
  dog_toys:       { moves: ["handheld_follow","whip_pan","push_in","orbit","match_cut_close"],   grade: "teal_orange",       pace: "fast" },
  training:       { moves: ["push_in","dolly","rack_focus_pull","handheld_follow","pull_out"],   grade: "pinterest_premium", pace: "med" },
  default:        { moves: ["push_in","handheld_follow","rack_focus_pull","orbit","pull_out"],   grade: "pinterest_premium", pace: "med" },
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
  // Deterministic subject-tracking path (4 control points in 0..1 normalized space).
  const r = (n: number) => ((Math.sin((seed + 1) * n * 12.9898) * 43758.5453) % 1 + 1) % 1;
  return [
    { t: 0.0, x: 0.50, y: 0.55 },
    { t: 0.33, x: 0.42 + r(1)*0.16, y: 0.48 + r(2)*0.14 },
    { t: 0.66, x: 0.55 + r(3)*0.14, y: 0.52 + r(4)*0.12 },
    { t: 1.0, x: 0.50, y: 0.50 },
  ];
}

function buildScene(opts: {
  index: number; src: string; move: CameraMove; grade: Grading; durationMs: number; isMotion: boolean;
}) {
  const { index, src, move, grade, durationMs, isMotion } = opts;
  return {
    scene_index: index,
    duration_ms: durationMs,
    is_motion_scene: isMotion,
    camera_move: move,
    layers: [
      { role: "background", src, blur: 14, parallax_amp: 0.18, scale: 1.22 },
      { role: "midground",  src, blur: 4,  parallax_amp: 0.08, scale: 1.10 },
      { role: "subject",    src, blur: 0,  parallax_amp: 0.02, scale: 1.00, tracking_path: bezierTrack(index) },
    ],
    depth_simulation: {
      foreground_dof_blur_px: move === "rack_focus_pull" ? 6 : 2,
      background_dof_blur_px: 14,
      parallax_delta_px: 28,
    },
    transition_in:  index === 0 ? "fade_up" : (move === "whip_pan" ? "whip_pan" : "match_cut"),
    transition_out: move === "rack_focus_pull" ? "rack_focus" : "cross_dissolve",
    grading: {
      lut: grade,
      contrast: 1.08,
      saturation: grade === "kodak_portra" ? 0.92 : 1.05,
      temperature: grade === "warm_film" ? 380 : grade === "teal_orange" ? -120 : 60,
    },
    motion_intensity: isMotion ? (move === "whip_pan" || move === "handheld_follow" ? 0.85 : 0.6) : 0.15,
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

function generateStoryboard(job: any): { storyboard: any[]; motionRatio: number; profileKey: string } {
  const profileKey = pickCategory(job.category, job.product_name || job.product_slug || "");
  const profile = CATEGORY_PROFILE[profileKey];
  const imgs = pickImageSrcs(job);
  const SCENE_COUNT = 6;                              // hook + 4 product beats + CTA
  const DURATION = [1400, 1600, 1700, 1700, 1500, 2000];
  const moves = profile.moves;
  const scenes: any[] = [];
  for (let i = 0; i < SCENE_COUNT; i++) {
    const src = imgs[i % Math.max(imgs.length, 1)] || "";
    const move = moves[i % moves.length];
    const isMotion = i !== SCENE_COUNT - 1 ? true : false; // CTA can be quieter
    scenes.push(buildScene({ index: i, src, move, grade: profile.grade, durationMs: DURATION[i], isMotion }));
  }
  // Force ≥ 70% motion scenes
  const motionRatio = scenes.filter(s => s.is_motion_scene).length / scenes.length;
  return { storyboard: scenes, motionRatio, profileKey };
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
    const { storyboard, motionRatio, profileKey } = generateStoryboard(job);
    const upd = await supabase.from("cinematic_ad_jobs").update({
      motion_storyboard: storyboard,
      motion_ratio: Number(motionRatio.toFixed(3)),
      motion_engine_version: "v1",
    }).eq("id", job_id);
    if (upd.error) throw upd.error;
    return new Response(JSON.stringify({
      ok: true, traceId,
      message: `Storyboard generated (${storyboard.length} scenes, motion_ratio=${motionRatio.toFixed(2)}, profile=${profileKey})`,
      motion_ratio: motionRatio,
      scene_count: storyboard.length,
      profile: profileKey,
      storyboard,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});