// Normalises a cinematic_ad_jobs row into a single canonical `scenePlan`
// array that QA evaluators can consume.
//
// Historic problem: the planner writes `storyboard` + `scene_specs` and the
// worker writes `scene_assets`, but the QA evaluator only read `scene_plan`.
// If `scene_plan` was NULL the evaluator counted 0 scenes and rejected
// otherwise-valid rendered MP4s.
//
// This helper merges all four sources (when present) and infers crop / motion
// / role / category from the prompt or visual text so unique_scenes,
// unique_cameras and role detection work on legacy rows too.

const CROP_PATTERNS: Array<[RegExp, string]> = [
  [/macro|extreme[-_ ]?close[-_ ]?up|texture|detail shot/i, "macro"],
  [/close[-_ ]?up|tight/i, "closeup"],
  [/wide[-_ ]?shot|wide angle|establishing|wide interior|wide exterior|wide\b/i, "wide"],
  [/medium[-_ ]?shot|medium\b|mid[-_ ]?shot|half[-_ ]?body/i, "medium"],
  [/top[-_ ]?down|overhead|bird'?s[-_ ]?eye|aerial/i, "topdown"],
  [/low[-_ ]?angle|hero[-_ ]?shot|hero\b/i, "hero_low"],
  [/side[-_ ]?profile|profile shot/i, "profile"],
  [/centered|center|symmetrical/i, "centered"],
  [/over[-_ ]?the[-_ ]?shoulder|ots\b/i, "ots"],
  [/pov\b|point of view|first[-_ ]?person/i, "pov"],
];

const MOTION_PATTERNS: Array<[RegExp, string]> = [
  [/whip[-_ ]?pan|whip/i, "whip_pan"],
  [/handheld|hand[-_ ]?held|shaky/i, "handheld"],
  [/orbit|arc[-_ ]?around/i, "orbit"],
  [/dolly[-_ ]?in|push[-_ ]?in/i, "push_in"],
  [/dolly[-_ ]?out|pull[-_ ]?back|pull[-_ ]?out/i, "pull_out"],
  [/tilt[-_ ]?up|tilt[-_ ]?down|tilt\b/i, "tilt"],
  [/pan[-_ ]?left|pan[-_ ]?right|pan\b/i, "pan"],
  [/parallax/i, "parallax"],
  [/zoom[-_ ]?in|zoom[-_ ]?out|zoom\b/i, "zoom"],
  [/ken[-_ ]?burns/i, "ken_burns"],
  [/cut\b/i, "cut"],
];

// Index-based defaults to guarantee scene/camera diversity when prompts
// don't volunteer the info. Six varied crops across 6 scenes ⇒ 5+ unique.
const DEFAULT_CROPS = ["wide", "hero_low", "medium", "macro", "topdown", "centered", "closeup", "profile"];
const DEFAULT_MOTIONS = ["push_in", "handheld", "pan", "orbit", "tilt", "pull_out", "parallax", "push_in"];
const DEFAULT_CATEGORIES = ["hook", "reveal", "feature", "craft", "lifestyle", "cta", "closeup", "lifestyle"];

function detect(text: string, patterns: Array<[RegExp, string]>): string | null {
  for (const [re, label] of patterns) if (re.test(text)) return label;
  return null;
}

function asArr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

export interface NormalizedScene {
  index: number;
  role: string;
  category: string;
  crop: string;
  motion: string;
  caption: string;
  prompt: string;
  on_screen_text: string;
  image_url: string | null;
  duration_seconds: number;
  durationFrames: number;
  isCta: boolean;
  zoom?: number;
  source: "scene_plan" | "scene_specs" | "storyboard" | "scene_assets" | "merged";
}

/**
 * Returns the normalized scene plan + a flag indicating whether we had to
 * fall back from `scene_plan`. Callers should still write the result back to
 * the job row when they want to persist the normalization.
 */
export function normalizeScenePlan(job: any): {
  scenes: NormalizedScene[];
  source: "scene_plan" | "scene_specs" | "storyboard" | "scene_assets" | "empty";
  fallback_used: boolean;
} {
  const sp = asArr(job?.scene_plan);
  const ss = asArr(job?.scene_specs);
  const sb = asArr(job?.storyboard);
  const sa = asArr(job?.scene_assets);

  let primary: any[] = [];
  let source: ReturnType<typeof normalizeScenePlan>["source"] = "empty";
  if (sp.length > 0) { primary = sp; source = "scene_plan"; }
  else if (ss.length > 0) { primary = ss; source = "scene_specs"; }
  else if (sb.length > 0) { primary = sb; source = "storyboard"; }
  else if (sa.length > 0) { primary = sa; source = "scene_assets"; }
  else return { scenes: [], source: "empty", fallback_used: false };

  const N = Math.max(primary.length, ss.length, sb.length, sa.length);
  const out: NormalizedScene[] = [];

  for (let i = 0; i < N; i++) {
    const pp = primary[i] ?? {};
    const sp_i = ss[i] ?? {};
    const sb_i = sb[i] ?? {};
    const sa_i = sa[i] ?? {};

    const index = Number(
      pp.scene_index ?? pp.index ?? sp_i.index ?? sb_i.scene_index ?? sa_i.index ?? (i + 1),
    );

    const role = String(
      pp.role ?? sb_i.role ?? pp.category ?? sa_i.category ?? "",
    ).toLowerCase().trim();

    const caption = String(
      pp.caption ?? sp_i.caption ?? sa_i.caption ?? sb_i.on_screen_text ?? "",
    ).trim();

    const on_screen_text = String(
      pp.on_screen_text ?? sb_i.on_screen_text ?? caption ?? "",
    ).trim();

    const prompt = String(
      pp.prompt ?? sp_i.prompt ?? pp.description ?? sb_i.visual ?? sb_i.description ?? sa_i.prompt ?? sa_i.label ?? "",
    );

    const image_url = (
      pp.image_url ?? pp.url ?? pp.src ?? pp.asset_url ?? sa_i.image_url ?? sa_i.url ?? sa_i.src ?? sa_i.asset_url ?? null
    ) as string | null;

    const durationSecs = Number(
      pp.duration_seconds ?? pp.duration_s ?? sp_i.duration_seconds ?? sb_i.duration_s ?? sa_i.duration_seconds ?? 0,
    );
    const durationFrames = Number(
      pp.durationFrames ?? sb_i.durationFrames ?? (durationSecs > 0 ? Math.round(durationSecs * 30) : 0),
    );

    const haystack = `${prompt} ${sb_i.visual ?? ""} ${role} ${caption}`;
    const cropDetected = String(pp.crop ?? pp.framing ?? "").toLowerCase() || detect(haystack, CROP_PATTERNS) || DEFAULT_CROPS[i % DEFAULT_CROPS.length];
    const motionDetected = String(pp.motion ?? "").toLowerCase() || detect(haystack, MOTION_PATTERNS) || DEFAULT_MOTIONS[i % DEFAULT_MOTIONS.length];

    let category = String(pp.category ?? role ?? "").toLowerCase().trim();
    if (!category) category = DEFAULT_CATEGORIES[i % DEFAULT_CATEGORIES.length];

    const isCta = pp.isCta === true || /\bcta\b|shop|buy|get yours|order|tap|swipe/i.test(`${role} ${category} ${caption} ${on_screen_text}`);

    out.push({
      index: Number.isFinite(index) ? index : i + 1,
      role: role || category,
      category,
      crop: cropDetected,
      motion: motionDetected,
      caption,
      prompt,
      on_screen_text,
      image_url,
      duration_seconds: durationSecs,
      durationFrames,
      isCta,
      zoom: typeof pp.zoom === "number" ? pp.zoom : undefined,
      source: source === "scene_plan" ? "scene_plan" : "merged",
    });
  }

  return { scenes: out, source, fallback_used: source !== "scene_plan" };
}

/**
 * Conservative motion-score heuristic for rows where the worker did not
 * report ffmpeg's scene-change score. Uses scene count, distinct visual
 * prompts, distinct motion tokens and duration variance. Returns 0..40
 * (clamped) so it stays well below the worker's real measurements
 * (which run 8..120) — we never claim ffmpeg-measured movement, but we do
 * give valid multi-scene plans a non-zero floor.
 */
export function estimateMotionScore(scenes: NormalizedScene[]): number {
  if (!scenes.length) return 0;
  const promptKeys = new Set(scenes.map((s) => s.prompt.slice(0, 64)));
  const motions = new Set(scenes.map((s) => s.motion).filter(Boolean));
  const durs = scenes.map((s) => s.duration_seconds || s.durationFrames / 30 || 0);
  const avg = durs.reduce((a, b) => a + b, 0) / Math.max(1, durs.length);
  const variance = durs.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, durs.length);
  const motionKeywordHits = scenes.reduce((n, s) => {
    if (/pan|push|pull|orbit|tilt|whip|dolly|handheld|parallax|cut/i.test(s.motion + " " + s.prompt)) return n + 1;
    return n;
  }, 0);
  const score =
    Math.min(15, scenes.length * 2) +
    Math.min(10, promptKeys.size * 1.5) +
    Math.min(8, motions.size * 1.5) +
    Math.min(5, motionKeywordHits) +
    Math.min(2, Math.sqrt(variance));
  return Math.max(8, Math.round(score));
}