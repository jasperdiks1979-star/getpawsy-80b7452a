/**
 * humanCamera.ts — Cinematic Engine v5
 *
 * Frame-deterministic handheld camera simulation. Never uses CSS transitions
 * or animations — every value is derived from useCurrentFrame() so renders
 * are reproducible.
 *
 * Per-style profiles produce believable iPhone-style imperfections:
 *   - sub-pixel jitter
 *   - low-frequency drift
 *   - imperfect focus breathing
 *   - subtle exposure shifts
 *   - occasional snap framing corrections
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export type CameraStyle =
  | "iphone_vertical_closeup"
  | "pet_owner_followcam"
  | "floor_level_cat_cam"
  | "casual_lifestyle_pan"
  | "over_the_shoulder"
  | "reaction_selfie_style";

export interface CameraProfile {
  jitterPx: number;        // sub-pixel jitter amplitude
  driftPx: number;         // slow drift amplitude
  rotDeg: number;          // micro rotation
  scaleAmp: number;        // breath / push amplitude (0..0.05)
  blurPx: number;          // focus breathing max blur
  exposureAmp: number;     // ±brightness factor (0..0.15)
  snapEveryFrames: number; // framing correction cadence
  snapJumpPx: number;      // snap distance
  baseScale: number;       // starting zoom level
  skewY: number;           // low-angle tilt
}

const PROFILES: Record<CameraStyle, CameraProfile> = {
  iphone_vertical_closeup: {
    jitterPx: 2.0, driftPx: 6, rotDeg: 0.5, scaleAmp: 0.018, blurPx: 0.6,
    exposureAmp: 0.08, snapEveryFrames: 110, snapJumpPx: 6, baseScale: 1.08, skewY: 0,
  },
  pet_owner_followcam: {
    jitterPx: 1.2, driftPx: 14, rotDeg: 0.35, scaleAmp: 0.025, blurPx: 0.8,
    exposureAmp: 0.10, snapEveryFrames: 150, snapJumpPx: 10, baseScale: 1.06, skewY: 0,
  },
  floor_level_cat_cam: {
    jitterPx: 0.9, driftPx: 8, rotDeg: 0.25, scaleAmp: 0.015, blurPx: 0.5,
    exposureAmp: 0.07, snapEveryFrames: 180, snapJumpPx: 4, baseScale: 1.04, skewY: 2,
  },
  casual_lifestyle_pan: {
    jitterPx: 0.7, driftPx: 22, rotDeg: 0.2, scaleAmp: 0.02, blurPx: 0.4,
    exposureAmp: 0.06, snapEveryFrames: 240, snapJumpPx: 3, baseScale: 1.05, skewY: 0,
  },
  over_the_shoulder: {
    jitterPx: 1.5, driftPx: 10, rotDeg: 0.4, scaleAmp: 0.022, blurPx: 1.0,
    exposureAmp: 0.09, snapEveryFrames: 160, snapJumpPx: 5, baseScale: 1.10, skewY: 0,
  },
  reaction_selfie_style: {
    jitterPx: 2.6, driftPx: 9, rotDeg: 0.6, scaleAmp: 0.03, blurPx: 0.7,
    exposureAmp: 0.12, snapEveryFrames: 90, snapJumpPx: 8, baseScale: 1.12, skewY: 0,
  },
};

/** Deterministic pseudo-noise: layered sin/cos at irrational frequencies. */
const noise = (frame: number, seed: number) => {
  const a = Math.sin((frame + seed) / 7.3);
  const b = Math.cos((frame + seed * 1.7) / 11.1);
  const c = Math.sin((frame + seed * 0.9) / 17.7);
  return (a + b * 0.6 + c * 0.4) / 2.0; // ~[-1,1]
};

/** Slow low-frequency drift component. */
const drift = (frame: number, seed: number, periodFrames: number) => {
  return Math.sin((frame / periodFrames) * Math.PI * 2 + seed);
};

export interface HumanCameraTransform {
  tx: number;
  ty: number;
  rot: number;
  scale: number;
  blurPx: number;
  brightness: number;
  contrast: number;
  skewY: number;
}

/**
 * Compute the full transform for the current frame. Pure function — call
 * inside a component that already reads useCurrentFrame.
 */
export function computeHumanCamera(
  frame: number,
  style: CameraStyle,
  amp = 1,
): HumanCameraTransform {
  const p = PROFILES[style];

  // High-freq handheld jitter
  const jx = noise(frame, 11) * p.jitterPx * amp;
  const jy = noise(frame, 23) * p.jitterPx * amp;

  // Low-freq drift (4–10s feel)
  const dx = drift(frame, 1.3, 180) * p.driftPx * amp;
  const dy = drift(frame, 2.9, 240) * p.driftPx * 0.6 * amp;

  // Snap framing corrections
  const snapPhase = Math.floor(frame / p.snapEveryFrames);
  const snapLocal = frame - snapPhase * p.snapEveryFrames;
  const snapKick = snapLocal < 6
    ? interpolate(snapLocal, [0, 3, 6], [p.snapJumpPx, -p.snapJumpPx * 0.4, 0])
    : 0;

  // Breathing scale (slow push/pull)
  const scale = p.baseScale + drift(frame, 0.8, 210) * p.scaleAmp * amp;

  // Focus breathing (limit total blur — sandbox crash rule)
  const blurPx = Math.max(0, (Math.sin(frame / 65) * 0.5 + 0.5) * p.blurPx * amp);

  // Exposure / contrast drift over 3–6s windows
  const expo = drift(frame, 3.7, 150) * p.exposureAmp * amp;
  const brightness = 1 + expo * 0.6;
  const contrast = 1 + expo * 0.4;

  return {
    tx: jx + dx + snapKick,
    ty: jy + dy,
    rot: noise(frame, 37) * p.rotDeg * amp + drift(frame, 4.1, 300) * p.rotDeg * 0.4,
    scale,
    blurPx,
    brightness,
    contrast,
    skewY: p.skewY,
  };
}

/**
 * Wrap a scene root in a handheld camera transform. Apply at the OUTER
 * layer — never on text overlays (overlays should stay in safe-area).
 */
export const HumanCameraLayer: React.FC<{
  style: CameraStyle;
  amp?: number;
  children: React.ReactNode;
}> = ({ style, amp = 1, children }) => {
  const frame = useCurrentFrame();
  const t = computeHumanCamera(frame, style, amp);
  const transform = [
    `translate(${t.tx.toFixed(2)}px, ${t.ty.toFixed(2)}px)`,
    `rotate(${t.rot.toFixed(3)}deg)`,
    `scale(${t.scale.toFixed(4)})`,
    t.skewY ? `skewY(${t.skewY}deg)` : "",
  ].filter(Boolean).join(" ");
  const filter = [
    t.blurPx > 0.05 ? `blur(${t.blurPx.toFixed(2)}px)` : "",
    `brightness(${t.brightness.toFixed(3)})`,
    `contrast(${t.contrast.toFixed(3)})`,
  ].filter(Boolean).join(" ");
  return (
    <AbsoluteFill style={{ transform, filter, transformOrigin: "50% 50%" }}>
      {children}
    </AbsoluteFill>
  );
};

/** Convenience helper to use in JSX without importing Layer. */
export function applyHumanCamera(
  children: React.ReactNode,
  style: CameraStyle,
  amp = 1,
) {
  return <HumanCameraLayer style={style} amp={amp}>{children}</HumanCameraLayer>;
}

/** Available styles (for storyboard picker validation). */
export const HUMAN_CAMERA_STYLES: CameraStyle[] = [
  "iphone_vertical_closeup",
  "pet_owner_followcam",
  "floor_level_cat_cam",
  "casual_lifestyle_pan",
  "over_the_shoulder",
  "reaction_selfie_style",
];