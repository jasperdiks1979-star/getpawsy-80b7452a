// UGC creator-style POV reel. Handheld wiggle, caption-forward, reaction
// pacing. Feels like a real person filmed it.
import React from "react";
import { AbsoluteFill, Series, interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { z } from "zod";
import {
  C,
  CaptionBurn,
  CtaEndCard,
  DuckedMusic,
  MotionImage,
  SAFE,
  SceneShell,
  TopBottomScrim,
  Vignette,
  VoiceOver,
} from "./shared";

export const ugcPovSchema = z.object({
  product: z.object({ name: z.string(), price: z.string().optional(), slug: z.string() }),
  beats: z.array(
    z.object({
      beat: z.enum(["HOOK", "REACTION", "DEMO", "PROOF", "CTA"]),
      image: z.string(),
      caption: z.string().optional(),
      voText: z.string().optional(),
      durationFrames: z.number(),
    }),
  ),
  cta: z.string().default("Tap to Shop →"),
  voiceoverUrl: z.string().optional(),
  musicUrl: z.string().optional(),
});

export type UgcPovProps = z.infer<typeof ugcPovSchema>;

/** Subtle handheld wiggle — sin + cos at different frequencies, never static. */
const Handheld: React.FC<{ children: React.ReactNode; amount?: number }> = ({
  children,
  amount = 1,
}) => {
  const frame = useCurrentFrame();
  const x = Math.sin(frame / 7.3) * 6 * amount + Math.cos(frame / 11) * 3 * amount;
  const y = Math.cos(frame / 9.1) * 5 * amount + Math.sin(frame / 13.7) * 2 * amount;
  const r = Math.sin(frame / 17) * 0.4 * amount;
  return (
    <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px) rotate(${r}deg)` }}>
      {children}
    </AbsoluteFill>
  );
};

const UgcOverlay: React.FC<{ creator?: string }> = ({ creator = "@getpawsy" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 18, stiffness: 200 } });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: SAFE.top - 80,
          left: SAFE.left,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: Math.min(1, s),
          transform: `translateY(${interpolate(s, [0, 1], [-30, 0])}px)`,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: `linear-gradient(135deg, ${C.accent}, ${C.gold})`,
            border: `3px solid ${C.paper}`,
          }}
        />
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 800,
            fontSize: 32,
            color: C.paper,
            textShadow: "0 2px 8px rgba(0,0,0,0.7)",
          }}
        >
          {creator}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const UgcPovScene: React.FC<UgcPovProps> = ({ beats, cta, voiceoverUrl, musicUrl }) => {
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Series>
        {beats.map((b, i) => (
          <Series.Sequence key={i} durationInFrames={b.durationFrames}>
            <SceneShell durationFrames={b.durationFrames} inFrames={4} outFrames={4}>
              <Handheld amount={b.beat === "HOOK" ? 1.4 : 1}>
                <MotionImage
                  src={b.image}
                  motion={b.beat === "HOOK" ? "snap_zoom" : b.beat === "DEMO" ? "push_in" : "crop_drift"}
                  durationFrames={b.durationFrames}
                />
              </Handheld>
              <TopBottomScrim />
              <Vignette strength={0.35} />
              <UgcOverlay />
              {b.caption ? (
                <CaptionBurn
                  text={b.caption}
                  durationFrames={b.durationFrames}
                  position={b.beat === "HOOK" ? "middle" : "lower"}
                  accent={C.gold}
                />
              ) : null}
            </SceneShell>
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={90}>
          <CtaEndCard cta={cta} />
        </Series.Sequence>
      </Series>
      <VoiceOver src={voiceoverUrl} />
      <DuckedMusic src={musicUrl} voiceoverActive={Boolean(voiceoverUrl)} />
    </AbsoluteFill>
  );
};