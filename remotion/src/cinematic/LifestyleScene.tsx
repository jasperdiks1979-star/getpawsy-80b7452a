// Lifestyle scene — cozy interiors, pets interacting naturally, modern US pet
// home aesthetic. Slow emotional pacing, drifting parallax, warm color grade.
import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { z } from "zod";
import {
  C,
  CaptionBurn,
  CtaEndCard,
  DuckedMusic,
  MotionImage,
  SAFE,
  SceneShell,
  Vignette,
  VoiceOver,
} from "./shared";

export const lifestyleSchema = z.object({
  product: z.object({ name: z.string(), price: z.string().optional(), slug: z.string() }),
  scenes: z.array(
    z.object({
      image: z.string(),
      caption: z.string().optional(),
      voText: z.string().optional(),
      durationFrames: z.number(),
      motion: z.enum(["push_in", "pull_out", "pan_left", "pan_right", "parallax", "crop_drift"]).optional(),
    }),
  ),
  closingLine: z.string().default("Made for the way they really live."),
  cta: z.string().default("Tap to Shop →"),
  voiceoverUrl: z.string().optional(),
  musicUrl: z.string().optional(),
});

export type LifestyleProps = z.infer<typeof lifestyleSchema>;

/** Warm cinematic color grade — orange/teal lift. */
const WarmGrade: React.FC<{ strength?: number }> = ({ strength = 0.25 }) => (
  <AbsoluteFill
    style={{
      background: `linear-gradient(180deg, rgba(255,170,90,${strength * 0.5}) 0%, rgba(0,0,0,0) 30%, rgba(0,30,60,${strength * 0.4}) 100%)`,
      mixBlendMode: "soft-light",
      pointerEvents: "none",
    }}
  />
);

const ClosingCard: React.FC<{ line: string; productName: string }> = ({ line, productName }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 22, stiffness: 90 } });
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${C.cream} 0%, #E9E0D2 100%)`,
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
      }}
    >
      <div style={{ textAlign: "center", opacity: Math.min(1, s) }}>
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 800,
            fontSize: 32,
            color: C.accent,
            letterSpacing: 5,
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          {productName}
        </div>
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 86,
            color: C.ink,
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 900,
            transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
          }}
        >
          {line}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const LifestyleScene: React.FC<LifestyleProps> = ({
  product,
  scenes,
  closingLine,
  cta,
  voiceoverUrl,
  musicUrl,
}) => {
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Series>
        {scenes.map((s, i) => (
          <Series.Sequence key={i} durationInFrames={s.durationFrames}>
            <SceneShell durationFrames={s.durationFrames} inFrames={12} outFrames={12}>
              <MotionImage
                src={s.image}
                motion={(s.motion as any) || (i % 2 === 0 ? "parallax" : "pan_right")}
                durationFrames={s.durationFrames}
              />
              <WarmGrade />
              <Vignette strength={0.45} />
              {s.caption ? (
                <CaptionBurn text={s.caption} durationFrames={s.durationFrames} accent={C.gold} />
              ) : null}
            </SceneShell>
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={90}>
          <ClosingCard line={closingLine} productName={product.name} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <CtaEndCard cta={cta} />
        </Series.Sequence>
      </Series>
      <VoiceOver src={voiceoverUrl} />
      <DuckedMusic
        src={musicUrl}
        voiceoverActive={Boolean(voiceoverUrl)}
        baseVolume={0.45}
        duckedVolume={0.14}
      />
    </AbsoluteFill>
  );
};