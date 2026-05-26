// Shared cinematic export presets. Single source of truth for edge functions + admin UI.
// All presets are 9:16 vertical (1080x1920) — Pinterest + TikTok native.

export type CinematicPresetId =
  | "pin-organic"
  | "pin-ads"
  | "tt-organic"
  | "tt-spark";

export interface CinematicPreset {
  id: CinematicPresetId;
  label: string;
  width: 1080;
  height: 1920;
  fps: 30;
  durationSec: number;
  music: "soft" | "energy";
  captions: boolean;
  hookByFrame: number;       // hook fully readable by this frame
  ctaHoldFrames: number;     // how long CTA lingers
  brandLogoFromFrame: number; // 0 = whole video, 60 = appears at 2s
  disclosure: boolean;       // ad disclosure overlay
  motionScoreFloor: number;  // validator threshold (0..1)
}

export const PRESETS: Record<CinematicPresetId, CinematicPreset> = {
  "pin-organic": {
    id: "pin-organic", label: "Pinterest Organic",
    width: 1080, height: 1920, fps: 30, durationSec: 15,
    music: "soft", captions: true,
    hookByFrame: 30, ctaHoldFrames: 90, brandLogoFromFrame: 60,
    disclosure: false, motionScoreFloor: 0.012,
  },
  "pin-ads": {
    id: "pin-ads", label: "Pinterest Ads",
    width: 1080, height: 1920, fps: 30, durationSec: 15,
    music: "soft", captions: true,
    hookByFrame: 24, ctaHoldFrames: 120, brandLogoFromFrame: 0,
    disclosure: true, motionScoreFloor: 0.015,
  },
  "tt-organic": {
    id: "tt-organic", label: "TikTok Organic",
    width: 1080, height: 1920, fps: 30, durationSec: 15,
    music: "energy", captions: true,
    hookByFrame: 24, ctaHoldFrames: 90, brandLogoFromFrame: 60,
    disclosure: false, motionScoreFloor: 0.018,
  },
  "tt-spark": {
    id: "tt-spark", label: "TikTok Spark Ads",
    width: 1080, height: 1920, fps: 30, durationSec: 15,
    music: "energy", captions: true,
    hookByFrame: 24, ctaHoldFrames: 120, brandLogoFromFrame: 0,
    disclosure: true, motionScoreFloor: 0.020,
  },
};

// Mobile-safe zones (Pinterest + TikTok overlay areas).
export const SAFE_ZONE = {
  top: 96,      // status / Pinterest header
  bottom: 240,  // captions, CTA bar, TikTok side rail
  left: 64,
  right: 64,
} as const;

export function getPreset(id: string | null | undefined): CinematicPreset {
  if (id && id in PRESETS) return PRESETS[id as CinematicPresetId];
  return PRESETS["pin-organic"];
}

export function durationFrames(preset: CinematicPreset): number {
  return preset.durationSec * preset.fps;
}

// ---------------------------------------------------------------------------
// Duration governance — hard caps used by storyboard, queue-render, webhook,
// and VO trim logic. Pinterest/TikTok hard-reject videos that drift outside
// 6–60s; we keep an aggressive 15s default and never allow more than +1s slack
// on the final mp4. Per-scene cap prevents one beat from dominating.
// ---------------------------------------------------------------------------
export const HARD_MAX_DURATION_SEC = 15;
export const HARD_MIN_DURATION_SEC = 6;
export const HARD_MAX_SCENE_SEC = 4;          // ≤4s per scene
export const HARD_MIN_SCENE_SEC = 0.5;        // ≥15 frames @30fps
export const DURATION_OVERRUN_SLACK_SEC = 1;  // mp4 may exceed target by ≤1s
export const WORDS_PER_SECOND = 2.6;          // ElevenLabs eleven_multilingual_v2 @ speed 1.0

export function maxFramesFor(preset: CinematicPreset): number {
  return Math.min(preset.durationSec, HARD_MAX_DURATION_SEC) * preset.fps;
}

export function maxSceneFramesFor(preset: CinematicPreset): number {
  return Math.round(HARD_MAX_SCENE_SEC * preset.fps);
}

export function minSceneFramesFor(preset: CinematicPreset): number {
  return Math.round(HARD_MIN_SCENE_SEC * preset.fps);
}

/**
 * Clamp + rescale scene durations so total ≤ target and each ≤ scene cap.
 * Returns the normalized scenes array (does not mutate input) and `changed`
 * flag indicating whether anything was trimmed/rescaled.
 */
export function enforceSceneDurations<T extends { durationFrames?: number }>(
  scenes: T[],
  preset: CinematicPreset,
): { scenes: T[]; totalFrames: number; changed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const maxScene = maxSceneFramesFor(preset);
  const minScene = minSceneFramesFor(preset);
  const maxTotal = maxFramesFor(preset);

  let changed = false;
  const clamped = scenes.map((s, i) => {
    const raw = Number(s.durationFrames ?? 0) || Math.round(preset.fps * 2);
    let d = Math.max(minScene, Math.min(maxScene, Math.round(raw)));
    if (d !== raw) {
      changed = true;
      reasons.push(`scene[${i}] clamped ${raw}→${d}`);
    }
    return { ...s, durationFrames: d };
  });

  let total = clamped.reduce((a, s) => a + (s.durationFrames ?? 0), 0);
  if (total > maxTotal) {
    const scale = maxTotal / total;
    let runningTotal = 0;
    for (let i = 0; i < clamped.length; i++) {
      const isLast = i === clamped.length - 1;
      const scaled = Math.max(minScene, Math.round((clamped[i].durationFrames ?? 0) * scale));
      clamped[i].durationFrames = isLast ? Math.max(minScene, maxTotal - runningTotal) : scaled;
      runningTotal += clamped[i].durationFrames ?? 0;
    }
    total = clamped.reduce((a, s) => a + (s.durationFrames ?? 0), 0);
    changed = true;
    reasons.push(`rescaled total to fit ${maxTotal} frames`);
  }
  return { scenes: clamped, totalFrames: total, changed, reasons };
}

/**
 * Validate a job's timeline before render enqueue. Returns ok=false with
 * reasons if the storyboard / scene_plan / voice-over budget is malformed.
 */
export interface TimelineCheck {
  ok: boolean;
  reasons: string[];
  targetFrames: number;
  plannedFrames: number;
  voWordBudget: number;
  voWordCount: number;
}

export function validateTimeline(
  preset: CinematicPreset,
  storyboard: { scenes?: Array<{ durationFrames?: number }> } | null | undefined,
  scenePlan: Array<{ durationFrames?: number }> | null | undefined,
  voScript: { beats?: Array<{ text?: string }> } | null | undefined,
): TimelineCheck {
  const reasons: string[] = [];
  const targetFrames = maxFramesFor(preset);
  const maxScene = maxSceneFramesFor(preset);
  const minScene = minSceneFramesFor(preset);

  const scenes = (Array.isArray(scenePlan) && scenePlan.length > 0)
    ? scenePlan
    : (storyboard?.scenes ?? []);

  if (!Array.isArray(scenes) || scenes.length < 3) {
    reasons.push(`scene_count_invalid(${scenes?.length ?? 0}<3)`);
  }
  if (Array.isArray(scenes) && scenes.length > 9) {
    reasons.push(`scene_count_invalid(${scenes.length}>9)`);
  }

  let plannedFrames = 0;
  (scenes ?? []).forEach((s, i) => {
    const d = Number(s?.durationFrames ?? 0);
    if (!Number.isFinite(d) || d <= 0) reasons.push(`scene[${i}]_duration_missing`);
    if (d > maxScene) reasons.push(`scene[${i}]_too_long(${d}>${maxScene})`);
    if (d > 0 && d < minScene) reasons.push(`scene[${i}]_too_short(${d}<${minScene})`);
    plannedFrames += Math.max(0, d);
  });

  if (plannedFrames > targetFrames) {
    reasons.push(`total_too_long(${plannedFrames}>${targetFrames})`);
  }

  const beats = Array.isArray(voScript?.beats) ? voScript!.beats! : [];
  const voWordCount = beats.reduce((a, b) => a + String(b?.text ?? "").trim().split(/\s+/).filter(Boolean).length, 0);
  const voWordBudget = Math.round(preset.durationSec * WORDS_PER_SECOND);
  if (beats.length > 0 && voWordCount > Math.ceil(voWordBudget * 1.1)) {
    reasons.push(`vo_too_long(${voWordCount}>${voWordBudget})`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    targetFrames,
    plannedFrames,
    voWordBudget,
    voWordCount,
  };
}

/** Trim a voice-over script to fit within target seconds. */
export function trimVoScriptToFit<T extends { text?: string }>(
  beats: T[],
  preset: CinematicPreset,
): { beats: T[]; trimmed: boolean; words: number } {
  const wordBudget = Math.round(preset.durationSec * WORDS_PER_SECOND);
  // Reserve ~12% of words for the CTA so it survives even if upstream is verbose.
  const ctaReserve = Math.max(6, Math.round(wordBudget * 0.12));
  const bodyBudget = Math.max(wordBudget - ctaReserve, Math.round(wordBudget * 0.5));
  const bodyCount = Math.max(beats.length - 1, 1);
  const perBeatBudget = Math.max(4, Math.floor(bodyBudget / bodyCount));

  let trimmed = false;
  let words = 0;
  const out = beats.map((b, i) => {
    const isCta = i === beats.length - 1;
    const budget = isCta ? ctaReserve : perBeatBudget;
    const raw = String(b.text ?? "").trim();
    if (!raw) return b;
    const arr = raw.split(/\s+/);
    if (arr.length <= budget) {
      words += arr.length;
      return b;
    }
    trimmed = true;
    // Trim to nearest sentence within budget, else hard word cut + ellipsis.
    const head = arr.slice(0, budget).join(" ");
    const lastPeriod = head.lastIndexOf(". ");
    const safe = lastPeriod > budget * 0.5 ? head.slice(0, lastPeriod + 1) : head.replace(/[,;:]\s*$/, "") + ".";
    words += safe.split(/\s+/).filter(Boolean).length;
    return { ...b, text: safe };
  });
  return { beats: out, trimmed, words };
}