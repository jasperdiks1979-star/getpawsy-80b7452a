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
    width: 1080, height: 1920, fps: 30, durationSec: 18,
    music: "soft", captions: true,
    hookByFrame: 30, ctaHoldFrames: 90, brandLogoFromFrame: 60,
    disclosure: false, motionScoreFloor: 0.012,
  },
  "pin-ads": {
    id: "pin-ads", label: "Pinterest Ads",
    width: 1080, height: 1920, fps: 30, durationSec: 22,
    music: "soft", captions: true,
    hookByFrame: 24, ctaHoldFrames: 120, brandLogoFromFrame: 0,
    disclosure: true, motionScoreFloor: 0.015,
  },
  "tt-organic": {
    id: "tt-organic", label: "TikTok Organic",
    width: 1080, height: 1920, fps: 30, durationSec: 18,
    music: "energy", captions: true,
    hookByFrame: 24, ctaHoldFrames: 90, brandLogoFromFrame: 60,
    disclosure: false, motionScoreFloor: 0.018,
  },
  "tt-spark": {
    id: "tt-spark", label: "TikTok Spark Ads",
    width: 1080, height: 1920, fps: 30, durationSec: 22,
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