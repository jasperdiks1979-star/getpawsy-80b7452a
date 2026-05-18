// Shared building blocks for the viral-vertical cinematic composition.
// All motion is frame-based (useCurrentFrame + interpolate/spring).
import React from "react";
import { AbsoluteFill, Img, Video, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

export const SAFE = { top: 96, bottom: 240, left: 64, right: 64 } as const;

// Palette — premium US-native, warm, bold accent.
export const COLORS = {
  cream: "#F5F1E8",
  ink: "#0F1115",
  accent: "#E85D3A",  // ember
  white: "#FFFFFF",
  shadow: "rgba(15,17,21,0.45)",
};

export type MediaItem =
  | { kind: "image"; src: string; focus?: { x: number; y: number }; motion?: KenBurnsMotion }
  | { kind: "video"; src: string; trimStart?: number; trimEnd?: number };

export type KenBurnsMotion = "kenburns-in" | "kenburns-out" | "pan-left" | "pan-right" | "parallax";

// Ken-Burns layer — animated still that NEVER looks static.
export const KenBurnsLayer: React.FC<{
  src: string;
  motion?: KenBurnsMotion;
  focus?: { x: number; y: number };
  durationInFrames: number;
}> = ({ src, motion = "kenburns-in", focus = { x: 50, y: 50 }, durationInFrames }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });

  let scale = 1, tx = 0, ty = 0;
  switch (motion) {
    case "kenburns-in":   scale = interpolate(t, [0, 1], [1.05, 1.22]); break;
    case "kenburns-out":  scale = interpolate(t, [0, 1], [1.22, 1.05]); break;
    case "pan-left":      scale = 1.18; tx = interpolate(t, [0, 1], [60, -60]); break;
    case "pan-right":     scale = 1.18; tx = interpolate(t, [0, 1], [-60, 60]); break;
    case "parallax":      scale = interpolate(t, [0, 1], [1.10, 1.18]); ty = interpolate(t, [0, 1], [-20, 20]); break;
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: COLORS.ink }}>
      <Img
        src={src}
        style={{
          width: "100%", height: "100%", objectFit: "cover",
          objectPosition: `${focus.x}% ${focus.y}%`,
          transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
          transformOrigin: "center center",
        }}
      />
    </AbsoluteFill>
  );
};

// Auto motion generator — when only 1 still is available, fakes 3 sub-shots so it never feels like a slideshow.
export const MotionGenerator: React.FC<{ src: string; durationInFrames: number; focus?: { x: number; y: number } }> = ({ src, durationInFrames, focus }) => {
  const frame = useCurrentFrame();
  const third = Math.floor(durationInFrames / 3);
  const motion: KenBurnsMotion = frame < third ? "kenburns-in" : frame < third * 2 ? "pan-right" : "kenburns-out";
  // Crossfade between segments
  const segFrame = frame % third;
  const fade = interpolate(segFrame, [0, 8, third - 8, third], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <KenBurnsLayer src={src} motion={motion} focus={focus} durationInFrames={third} />
    </AbsoluteFill>
  );
};

// Parallax stack — 2 layers of the same image at different depths for depth feel.
export const ParallaxStack: React.FC<{ src: string; durationInFrames: number }> = ({ src, durationInFrames }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, durationInFrames], [0, 1]);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 0.55, filter: "blur(8px)", transform: `scale(1.25) translateY(${interpolate(t, [0, 1], [-30, 30])}px)` }}>
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(1.08) translateY(${interpolate(t, [0, 1], [10, -10])}px)` }}>
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Big top-safe hook typography. Lands in <0.5s with mask-reveal per word.
export const HookText: React.FC<{ text: string; sub?: string; hookByFrame?: number }> = ({ text, sub, hookByFrame = 24 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <AbsoluteFill style={{ padding: `${SAFE.top + 40}px ${SAFE.left}px 0`, alignItems: "stretch", justifyContent: "flex-start" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 18px", textTransform: "uppercase" }}>
        {words.map((w, i) => {
          const delay = Math.min(i * (hookByFrame / Math.max(words.length, 1)), hookByFrame);
          const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 220 } });
          return (
            <span key={i} style={{
              fontFamily: "'Bebas Neue', Impact, sans-serif",
              fontSize: 110, lineHeight: 0.95, letterSpacing: -1.5,
              color: COLORS.white,
              background: i % 3 === 1 ? COLORS.accent : "transparent",
              padding: i % 3 === 1 ? "0 14px" : 0,
              opacity: s, transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
              textShadow: "0 4px 22px rgba(0,0,0,0.55)",
            }}>{w}</span>
          );
        })}
      </div>
      {sub && (
        <div style={{
          marginTop: 24, fontFamily: "Inter, system-ui, sans-serif", fontWeight: 700,
          fontSize: 42, color: COLORS.white, opacity: interpolate(frame, [hookByFrame, hookByFrame + 12], [0, 1], { extrapolateRight: "clamp" }),
          background: "rgba(0,0,0,0.55)", padding: "12px 18px", borderRadius: 12, alignSelf: "flex-start",
        }}>{sub}</div>
      )}
    </AbsoluteFill>
  );
};

// Bottom-safe caption / chip.
export const BottomChip: React.FC<{ text: string; bg?: string; color?: string }> = ({ text, bg = COLORS.ink, color = COLORS.white }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 200 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: SAFE.bottom + 20 }}>
      <div style={{
        background: bg, color, padding: "18px 28px", borderRadius: 14,
        fontFamily: "Inter, system-ui, sans-serif", fontWeight: 800, fontSize: 44,
        opacity: s, transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
        maxWidth: `calc(100% - ${SAFE.left + SAFE.right}px)`,
        textAlign: "center", boxShadow: "0 10px 36px rgba(0,0,0,0.35)",
      }}>{text}</div>
    </AbsoluteFill>
  );
};

// Film grain for cinematic feel.
export const FilmGrain: React.FC = () => (
  <AbsoluteFill style={{
    opacity: 0.05, pointerEvents: "none",
    backgroundImage:
      "radial-gradient(circle at 20% 30%, #000 0.5px, transparent 1px), radial-gradient(circle at 70% 60%, #000 0.5px, transparent 1px), radial-gradient(circle at 40% 80%, #000 0.5px, transparent 1px)",
    backgroundSize: "3px 3px, 5px 5px, 4px 4px",
  }} />
);

// Vignette to focus eyes center.
export const Vignette: React.FC = () => (
  <AbsoluteFill style={{
    pointerEvents: "none",
    background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)",
  }} />
);

// Debug safe-zone overlay (only when explicitly enabled).
export const SafeZoneGuide: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <div style={{ position: "absolute", left: SAFE.left, right: SAFE.right, top: SAFE.top, bottom: SAFE.bottom, border: "2px dashed #00FF88" }} />
  </AbsoluteFill>
);