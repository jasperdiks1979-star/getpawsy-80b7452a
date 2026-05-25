// Cinematic shared primitives — motion system, caption burner, music ducking,
// transitions, scene wrappers. Used by all cinematic compositions
// (CinematicProductDemo, CompilationReel, UgcPovScene, LifestyleScene).
//
// All animation is frame-based via useCurrentFrame() + interpolate()/spring().
// No CSS transitions, no setTimeout, no Framer Motion.
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ---------------- palette ----------------
export const C = {
  ink: "#0B0B0F",
  cream: "#F5F1EA",
  paper: "#FFFFFF",
  accent: "#FF5A3C", // GetPawsy coral
  gold: "#F2C14E",
  navy: "#0F1B3D",
  shadow: "rgba(0,0,0,0.55)",
  caption: "#FFFFFF",
  captionShadow: "rgba(0,0,0,0.85)",
};

// Pinterest / TikTok safe zones (1080x1920)
export const SAFE = { top: 180, bottom: 320, left: 60, right: 60 };

// ---------------- types ----------------
export type Beat =
  | "HOOK"
  | "PROBLEM"
  | "SOLUTION"
  | "PROOF"
  | "FEATURE"
  | "LIFESTYLE"
  | "CTA";

export interface CinematicScene {
  beat: Beat;
  image: string;            // public URL
  caption?: string;         // burned-in subtitle (TikTok style)
  voText?: string;          // narration text (for reference; audio is muxed)
  productName?: string;
  durationFrames: number;
  motion?: MotionKind;
  crop?: CropRegion;
  badge?: string;           // small overlay chip e.g. "#1 Best Seller"
}

export type MotionKind =
  | "push_in"
  | "pull_out"
  | "pan_left"
  | "pan_right"
  | "parallax"
  | "crop_drift"
  | "snap_zoom";

export type CropRegion = "center" | "top" | "bottom" | "left" | "right";

// ---------------- motion engine ----------------
/**
 * Builds a CSS transform string for a Ken-Burns / parallax style motion
 * that runs across `durationFrames` for the current frame. Never returns
 * a static transform — every scene moves.
 */
export function useMotionTransform(
  motion: MotionKind,
  durationFrames: number,
  crop: CropRegion = "center",
): { transform: string; transformOrigin: string } {
  const frame = useCurrentFrame();
  const p = Math.min(1, Math.max(0, frame / Math.max(1, durationFrames)));
  // smooth ease
  const e = 1 - Math.pow(1 - p, 2.2);

  let scale = 1.08;
  let tx = 0;
  let ty = 0;

  switch (motion) {
    case "push_in":
      scale = interpolate(e, [0, 1], [1.04, 1.22]);
      break;
    case "pull_out":
      scale = interpolate(e, [0, 1], [1.22, 1.04]);
      break;
    case "pan_left":
      scale = 1.18;
      tx = interpolate(e, [0, 1], [60, -60]);
      break;
    case "pan_right":
      scale = 1.18;
      tx = interpolate(e, [0, 1], [-60, 60]);
      break;
    case "parallax":
      scale = interpolate(e, [0, 1], [1.1, 1.18]);
      ty = interpolate(e, [0, 1], [40, -40]);
      break;
    case "crop_drift":
      scale = interpolate(e, [0, 1], [1.06, 1.14]);
      tx = interpolate(e, [0, 1], [-30, 30]);
      ty = interpolate(e, [0, 1], [-20, 20]);
      break;
    case "snap_zoom": {
      // Sharp punch-in in first 20%, settle for rest
      const punch = Math.min(1, p / 0.2);
      scale = interpolate(punch, [0, 1], [1.0, 1.18]);
      break;
    }
  }

  const origin =
    crop === "top"
      ? "50% 25%"
      : crop === "bottom"
      ? "50% 75%"
      : crop === "left"
      ? "25% 50%"
      : crop === "right"
      ? "75% 50%"
      : "50% 50%";

  return {
    transform: `translate(${tx}px, ${ty}px) scale(${scale.toFixed(4)})`,
    transformOrigin: origin,
  };
}

// ---------------- background image ----------------
export const MotionImage: React.FC<{
  src: string;
  motion: MotionKind;
  crop?: CropRegion;
  durationFrames: number;
  blur?: number;
}> = ({ src, motion, crop = "center", durationFrames, blur = 0 }) => {
  const m = useMotionTransform(motion, durationFrames, crop);
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: C.ink }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: m.transform,
          transformOrigin: m.transformOrigin,
          filter: blur ? `blur(${blur}px)` : undefined,
          willChange: "transform",
        }}
      />
    </AbsoluteFill>
  );
};

// ---------------- cinematic vignette + grain ----------------
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${strength}) 100%)`,
      pointerEvents: "none",
    }}
  />
);

export const TopBottomScrim: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.7) 100%)",
      pointerEvents: "none",
    }}
  />
);

// ---------------- caption burner (TikTok-style word pop) ----------------
/**
 * Burns animated captions onto a scene. Splits the line into chunks of <=4
 * words and pops each chunk in with a spring. Reads on mobile thanks to the
 * stroke + shadow + heavy weight.
 */
export const CaptionBurn: React.FC<{
  text: string;
  durationFrames: number;
  position?: "lower" | "middle";
  accent?: string;
}> = ({ text, durationFrames, position = "lower", accent = C.accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!text?.trim()) return null;

  const words = text.trim().split(/\s+/);
  const chunks: string[][] = [];
  for (let i = 0; i < words.length; i += 4) chunks.push(words.slice(i, i + 4));

  const perChunk = Math.max(8, Math.floor(durationFrames / Math.max(1, chunks.length)));

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: position === "middle" ? "center" : "flex-end",
        padding: `0 ${SAFE.left}px ${position === "lower" ? SAFE.bottom : 0}px`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          alignItems: "center",
          maxWidth: 940,
        }}
      >
        {chunks.map((chunk, i) => {
          const start = i * perChunk;
          const visible = frame >= start && frame < start + perChunk + 8;
          const s = spring({
            frame: frame - start,
            fps,
            config: { damping: 14, stiffness: 220, mass: 0.6 },
          });
          if (!visible) return null;
          const isAccent = chunk.some((w) => /[!?]/.test(w)) || i === chunks.length - 1;
          return (
            <div
              key={i}
              style={{
                opacity: Math.min(1, s),
                transform: `translateY(${interpolate(s, [0, 1], [24, 0])}px) scale(${interpolate(
                  s,
                  [0, 1],
                  [0.92, 1],
                )})`,
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 64,
                lineHeight: 1.05,
                letterSpacing: -1,
                color: isAccent ? accent : C.caption,
                textAlign: "center",
                textShadow: `0 4px 18px ${C.captionShadow}, 0 0 2px ${C.captionShadow}`,
                WebkitTextStroke: `2px ${C.captionShadow}`,
                textTransform: "uppercase",
              }}
            >
              {chunk.join(" ")}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------------- chip / badge ----------------
export const Chip: React.FC<{ text: string; color?: string; bg?: string; top?: number }> = ({
  text,
  color = C.ink,
  bg = C.gold,
  top = SAFE.top - 90,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16, stiffness: 200 } });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top,
          left: SAFE.left,
          background: bg,
          color,
          padding: "14px 22px",
          borderRadius: 999,
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 30,
          textTransform: "uppercase",
          letterSpacing: 1,
          opacity: Math.min(1, s),
          transform: `translateX(${interpolate(s, [0, 1], [-40, 0])}px)`,
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// ---------------- price card ----------------
export const PriceCard: React.FC<{ name: string; price?: string }> = ({ name, price }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 160 } });
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "flex-end",
        padding: `0 ${SAFE.left}px 120px`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: C.paper,
          borderRadius: 28,
          padding: "24px 36px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          opacity: Math.min(1, s),
          transform: `translateY(${interpolate(s, [0, 1], [60, 0])}px)`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          maxWidth: 900,
        }}
      >
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 800,
            fontSize: 40,
            color: C.ink,
            textAlign: "center",
          }}
        >
          {name}
        </div>
        {price ? (
          <div
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 56,
              color: C.accent,
            }}
          >
            {price}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ---------------- animated CTA end card ----------------
export const CtaEndCard: React.FC<{ cta: string; brand?: string }> = ({ cta, brand = "GetPawsy" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 180 } });
  const pulse = 1 + Math.sin(frame / 6) * 0.025;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, ${C.navy} 0%, ${C.ink} 80%)`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: Math.min(1, s),
          transform: `scale(${interpolate(s, [0, 1], [0.85, 1]) * pulse})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
        }}
      >
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 36,
            color: C.gold,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          {brand}
        </div>
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 92,
            color: C.paper,
            textAlign: "center",
            lineHeight: 1,
            letterSpacing: -2,
            padding: "0 60px",
          }}
        >
          {cta}
        </div>
        <div
          style={{
            background: C.accent,
            color: C.paper,
            padding: "22px 56px",
            borderRadius: 999,
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 44,
            letterSpacing: 1,
            boxShadow: "0 20px 60px rgba(255,90,60,0.55)",
          }}
        >
          Tap to Shop →
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------- ducked music ----------------
/**
 * Plays background music that auto-ducks (-12 dB equivalent) whenever the
 * voice-over is present. Smooth fades at boundaries.
 */
export const DuckedMusic: React.FC<{
  src?: string;
  voiceoverActive?: boolean;
  baseVolume?: number;   // when no VO
  duckedVolume?: number; // when VO active
  fadeFrames?: number;
}> = ({ src, voiceoverActive = true, baseVolume = 0.55, duckedVolume = 0.16, fadeFrames = 12 }) => {
  if (!src) return null;
  return (
    <Audio
      src={src}
      volume={(f) => {
        // global in/out fade + ducking when VO active
        const inFade = Math.min(1, f / 20);
        const target = voiceoverActive ? duckedVolume : baseVolume;
        return Math.max(0, inFade * target);
      }}
    />
  );
};

// ---------------- voice-over track ----------------
export const VoiceOver: React.FC<{ src?: string }> = ({ src }) => {
  if (!src) return null;
  return <Audio src={src} volume={1} />;
};

// ---------------- scene transition wrappers ----------------
/**
 * Fade-in + slight scale wrapper for each scene. Combined with Series.Sequence
 * this produces a smooth cinematic cut without external transition deps.
 */
export const SceneShell: React.FC<{
  children: React.ReactNode;
  durationFrames: number;
  inFrames?: number;
  outFrames?: number;
}> = ({ children, durationFrames, inFrames = 8, outFrames = 8 }) => {
  const frame = useCurrentFrame();
  const inP = interpolate(frame, [0, inFrames], [0, 1], { extrapolateRight: "clamp" });
  const outStart = durationFrames - outFrames;
  const outP = interpolate(frame, [outStart, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const op = Math.min(inP, outP);
  const scale = interpolate(inP, [0, 1], [1.02, 1]);
  return (
    <AbsoluteFill style={{ opacity: op, transform: `scale(${scale})` }}>
      {children}
    </AbsoluteFill>
  );
};

// ---------------- helper: assemble Series of scenes ----------------
export function assembleScenes(scenes: CinematicScene[]) {
  return scenes;
}

// ---------------- defaults ----------------
export const DEFAULT_MOTION_FOR_BEAT: Record<Beat, MotionKind> = {
  HOOK: "snap_zoom",
  PROBLEM: "push_in",
  SOLUTION: "pull_out",
  PROOF: "parallax",
  FEATURE: "push_in",
  LIFESTYLE: "pan_right",
  CTA: "push_in",
};

export function pickMotion(beat: Beat, idx: number): MotionKind {
  const order: MotionKind[] = [
    "push_in",
    "pan_right",
    "parallax",
    "pull_out",
    "pan_left",
    "crop_drift",
    "snap_zoom",
  ];
  return DEFAULT_MOTION_FOR_BEAT[beat] ?? order[idx % order.length];
}