// Viral Vertical — the cinematic Pinterest/TikTok composition.
// Props-driven (Zod), one composition for all presets. 1080x1920 enforced.
import React from "react";
import { AbsoluteFill, Audio, Sequence, Series, staticFile, useVideoConfig, useCurrentFrame, interpolate, spring } from "remotion";
import { z } from "zod";
import {
  COLORS, FilmGrain, Vignette, SafeZoneGuide,
  HookText, BottomChip, KenBurnsLayer, MotionGenerator, ParallaxStack,
  SAFE,
} from "./viralShared";

export const viralPropsSchema = z.object({
  preset: z.enum(["pin-organic", "pin-ads", "tt-organic", "tt-spark"]).default("pin-organic"),
  hook: z.string().default("Stop scooping. Forever."),
  subhook: z.string().optional(),
  cta: z.string().default("Tap to Shop →"),
  ctaUrl: z.string().default("https://getpawsy.pet"),
  product: z.object({
    name: z.string(),
    price: z.string(),
    slug: z.string(),
  }).default({ name: "Premium Pet Product", price: "$99", slug: "premium-pet-product" }),
  media: z.array(z.union([
    z.object({
      kind: z.literal("image"),
      src: z.string(),
      focus: z.object({ x: z.number(), y: z.number() }).optional(),
      motion: z.enum(["kenburns-in", "kenburns-out", "pan-left", "pan-right", "parallax"]).optional(),
    }),
    z.object({
      kind: z.literal("video"),
      src: z.string(),
      trimStart: z.number().optional(),
      trimEnd: z.number().optional(),
    }),
  ])).default([]),
  music: z.string().optional(),
  debug: z.boolean().default(false),
  disclosure: z.boolean().default(false),
  hookByFrame: z.number().default(24),
  ctaHoldFrames: z.number().default(90),
});

export type ViralProps = z.infer<typeof viralPropsSchema>;

// Scene 1 — HOOK (≈3s)
const ViralHook: React.FC<{ media?: ViralProps["media"][number]; hook: string; subhook?: string; hookByFrame: number }> = ({ media, hook, subhook, hookByFrame }) => {
  const dur = 90;
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      {media?.kind === "image" ? (
        <KenBurnsLayer src={media.src} motion="kenburns-in" focus={media.focus} durationInFrames={dur} />
      ) : (
        <AbsoluteFill style={{ background: `linear-gradient(135deg, ${COLORS.ink}, ${COLORS.accent})` }} />
      )}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 40%, transparent 60%)" }} />
      <HookText text={hook} sub={subhook} hookByFrame={hookByFrame} />
    </AbsoluteFill>
  );
};

// Scene 2 — FEATURE (≈4s)
const ViralFeature: React.FC<{ media?: ViralProps["media"][number]; label: string; sub: string }> = ({ media, label, sub }) => {
  const dur = 120;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 180 } });
  return (
    <AbsoluteFill style={{ background: COLORS.cream }}>
      {media?.kind === "image" ? (
        <ParallaxStack src={media.src} durationInFrames={dur} />
      ) : (
        <AbsoluteFill style={{ background: COLORS.cream }} />
      )}
      <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "flex-start", padding: `${SAFE.top + 20}px ${SAFE.left}px` }}>
        <div style={{
          background: COLORS.accent, color: COLORS.white, padding: "12px 22px", borderRadius: 12,
          fontFamily: "Inter, system-ui, sans-serif", fontWeight: 800, fontSize: 36,
          opacity: s, transform: `translateX(${interpolate(s, [0, 1], [-80, 0])}px)`,
          textTransform: "uppercase", letterSpacing: 1,
        }}>{label}</div>
      </AbsoluteFill>
      <BottomChip text={sub} bg={COLORS.ink} color={COLORS.white} />
    </AbsoluteFill>
  );
};

// Scene 3 — LIFESTYLE (≈3s)
const ViralLifestyle: React.FC<{ media?: ViralProps["media"][number]; tagline: string }> = ({ media, tagline }) => {
  const dur = 90;
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      {media?.kind === "image" ? (
        <KenBurnsLayer src={media.src} motion="pan-right" focus={media.focus} durationInFrames={dur} />
      ) : (
        <AbsoluteFill style={{ background: COLORS.cream }} />
      )}
      <Vignette />
      <BottomChip text={tagline} bg={COLORS.white} color={COLORS.ink} />
    </AbsoluteFill>
  );
};

// Scene 4 — CTA (≈4s held)
const ViralCTA: React.FC<{ product: ViralProps["product"]; cta: string; holdFrames: number }> = ({ product, cta, holdFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 200 } });
  // micro-motion so the held card never feels frozen
  const float = Math.sin((frame / fps) * 2.2) * 4;

  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${COLORS.ink} 0%, #1a1d24 60%, ${COLORS.accent} 140%)` }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: SAFE.left }}>
        <div style={{
          fontFamily: "Inter, system-ui, sans-serif", fontWeight: 700, fontSize: 36,
          color: COLORS.cream, opacity: 0.85, textTransform: "uppercase", letterSpacing: 2,
          transform: `translateY(${interpolate(s, [0, 1], [-30, 0])}px)`, opacity: s,
        }}>{product.price} · Free US Shipping</div>

        <div style={{
          marginTop: 22, fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: 130,
          color: COLORS.white, textAlign: "center", lineHeight: 0.95, letterSpacing: -2,
          transform: `translateY(${float}px) scale(${interpolate(s, [0, 1], [0.92, 1])})`,
          opacity: s, textShadow: "0 6px 28px rgba(0,0,0,0.5)",
          maxWidth: "92%",
        }}>{product.name}</div>

        <div style={{
          marginTop: 36, background: COLORS.accent, color: COLORS.white,
          padding: "22px 44px", borderRadius: 999,
          fontFamily: "Inter, system-ui, sans-serif", fontWeight: 800, fontSize: 48,
          opacity: s, transform: `translateY(${float * -0.5}px)`,
          boxShadow: "0 18px 48px rgba(232,93,58,0.45)",
        }}>{cta}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Disclosure ribbon (Spark Ads / Pinterest Ads).
const Disclosure: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: SAFE.top - 32, pointerEvents: "none" }}>
    <div style={{ background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 22, padding: "6px 12px", borderRadius: 6, fontFamily: "Inter, sans-serif", fontWeight: 600, letterSpacing: 1 }}>
      SPONSORED
    </div>
  </AbsoluteFill>
);

// Brand mark (top-right, post brandLogoFromFrame).
const BrandMark: React.FC<{ fromFrame: number }> = ({ fromFrame }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [fromFrame, fromFrame + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "flex-start", padding: `${SAFE.top}px ${SAFE.right}px`, pointerEvents: "none" }}>
      <div style={{
        background: COLORS.white, color: COLORS.ink, padding: "8px 14px", borderRadius: 999,
        fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 24, opacity: o,
      }}>getpawsy</div>
    </AbsoluteFill>
  );
};

// Synth-motion fallback: only 1 still available, generate a multi-shot edit.
const SynthMotionScene: React.FC<{ media: ViralProps["media"][number]; durationInFrames: number }> = ({ media, durationInFrames }) => {
  if (media.kind !== "image") {
    return <AbsoluteFill style={{ background: COLORS.ink }} />;
  }
  return <MotionGenerator src={media.src} durationInFrames={durationInFrames} focus={media.focus} />;
};

export const MainVideoViralVertical: React.FC<ViralProps> = (props) => {
  const { durationInFrames } = useVideoConfig();
  const { media, hook, subhook, cta, product, debug, disclosure, hookByFrame, ctaHoldFrames, music } = props;

  // Pick media for each scene with safe fallbacks.
  const m0 = media[0];
  const m1 = media[1] ?? media[0];
  const m2 = media[2] ?? media[1] ?? media[0];
  const m3 = media[3] ?? media[2] ?? media[0];

  // If only 1 still — replace feature/lifestyle slots with synth motion variants.
  const onlyOneStill = media.filter(m => m.kind === "image").length <= 1 && media.every(m => m.kind === "image");

  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      <Series>
        <Series.Sequence durationInFrames={90}>
          <ViralHook media={m0} hook={hook} subhook={subhook} hookByFrame={hookByFrame} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          {onlyOneStill && m0
            ? <SynthMotionScene media={m0} durationInFrames={120} />
            : <ViralFeature media={m1} label="Built for real life" sub="Designed around your pet — not the other way around." />}
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          {onlyOneStill && m0
            ? <SynthMotionScene media={m0} durationInFrames={120} />
            : <ViralFeature media={m2} label="Loved by US pet parents" sub="Crafted, tested, shipped from the US." />}
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <ViralLifestyle media={m3} tagline="Made for everyday moments" />
        </Series.Sequence>
        <Series.Sequence durationInFrames={Math.max(durationInFrames - 420, ctaHoldFrames)}>
          <ViralCTA product={product} cta={cta} holdFrames={ctaHoldFrames} />
        </Series.Sequence>
      </Series>

      {disclosure && <Disclosure />}
      <BrandMark fromFrame={props.preset === "pin-ads" || props.preset === "tt-spark" ? 0 : 60} />

      <FilmGrain />

      {music && (
        <Audio src={music.startsWith("http") ? music : staticFile(music)} volume={0.08} />
      )}

      {debug && <SafeZoneGuide />}
    </AbsoluteFill>
  );
};

export default MainVideoViralVertical;