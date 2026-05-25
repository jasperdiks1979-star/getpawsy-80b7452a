// Premium product showcase. 7-beat scene system. Voice-over driven captions,
// dynamic Ken-Burns + parallax, animated CTA end card.
import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { z } from "zod";
import {
  C,
  CaptionBurn,
  Chip,
  CinematicScene,
  CtaEndCard,
  DuckedMusic,
  MotionImage,
  PriceCard,
  SceneShell,
  TopBottomScrim,
  Vignette,
  VoiceOver,
  pickMotion,
} from "./shared";

export const cinematicDemoSchema = z.object({
  product: z.object({
    name: z.string(),
    price: z.string().optional(),
    slug: z.string(),
  }),
  scenes: z.array(
    z.object({
      beat: z.enum(["HOOK", "PROBLEM", "SOLUTION", "PROOF", "FEATURE", "LIFESTYLE", "CTA"]),
      image: z.string(),
      caption: z.string().optional(),
      voText: z.string().optional(),
      productName: z.string().optional(),
      durationFrames: z.number(),
      motion: z.string().optional(),
      crop: z.string().optional(),
      badge: z.string().optional(),
    }),
  ),
  cta: z.string().default("Tap to Shop →"),
  voiceoverUrl: z.string().optional(),
  musicUrl: z.string().optional(),
});

export type CinematicDemoProps = z.infer<typeof cinematicDemoSchema>;

export const CinematicProductDemo: React.FC<CinematicDemoProps> = ({
  product,
  scenes,
  cta,
  voiceoverUrl,
  musicUrl,
}) => {
  const safeScenes: CinematicScene[] = scenes.map((s, i) => ({
    ...s,
    motion: (s.motion as any) || pickMotion(s.beat as any, i),
    crop: (s.crop as any) || "center",
  }));

  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Series>
        {safeScenes.map((scene, i) => (
          <Series.Sequence key={i} durationInFrames={scene.durationFrames}>
            <SceneShell durationFrames={scene.durationFrames}>
              <MotionImage
                src={scene.image}
                motion={scene.motion!}
                crop={scene.crop}
                durationFrames={scene.durationFrames}
              />
              <TopBottomScrim />
              <Vignette />
              {scene.badge ? <Chip text={scene.badge} /> : null}
              {scene.beat === "PROOF" || scene.beat === "FEATURE" ? (
                <PriceCard name={scene.productName ?? product.name} price={product.price} />
              ) : null}
              {scene.caption ? (
                <CaptionBurn
                  text={scene.caption}
                  durationFrames={scene.durationFrames}
                  position={scene.beat === "HOOK" ? "middle" : "lower"}
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