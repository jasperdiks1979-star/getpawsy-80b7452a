// Multi-product compilation reel — TikTok pacing, numbered cards, category
// rotation. 3-5 products, ~25-35s.
import React from "react";
import { AbsoluteFill, Img, Series, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
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
  pickMotion,
} from "./shared";

export const compilationSchema = z.object({
  title: z.string().default("5 Products Cat Owners Love"),
  subtitle: z.string().optional(),
  products: z.array(
    z.object({
      name: z.string(),
      price: z.string().optional(),
      slug: z.string(),
      image: z.string(),
      category: z.string().optional(),
      blurb: z.string().optional(),
    }),
  ).min(1),
  cta: z.string().default("Tap to Shop →"),
  voiceoverUrl: z.string().optional(),
  musicUrl: z.string().optional(),
});

export type CompilationProps = z.infer<typeof compilationSchema>;

const TitleCard: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${C.navy}, ${C.ink} 70%)`,
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
      }}
    >
      <div
        style={{
          opacity: Math.min(1, s),
          transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 700,
            color: C.gold,
            fontSize: 32,
            letterSpacing: 6,
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          {subtitle ?? "GetPawsy Picks"}
        </div>
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 900,
            color: C.paper,
            fontSize: 110,
            lineHeight: 1,
            letterSpacing: -3,
          }}
        >
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const NumberedProductCard: React.FC<{
  number: number;
  total: number;
  product: CompilationProps["products"][number];
  durationFrames: number;
}> = ({ number, total, product, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numS = spring({ frame, fps, config: { damping: 12, stiffness: 240 } });
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <MotionImage
        src={product.image}
        motion={pickMotion("FEATURE", number)}
        durationFrames={durationFrames}
      />
      <TopBottomScrim />
      <Vignette />
      {/* Big number badge */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: SAFE.top - 60,
            right: SAFE.right,
            background: C.accent,
            color: C.paper,
            width: 160,
            height: 160,
            borderRadius: 999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 900,
            transform: `scale(${interpolate(numS, [0, 1], [0.6, 1])}) rotate(${interpolate(
              numS,
              [0, 1],
              [-15, 0],
            )}deg)`,
            opacity: Math.min(1, numS),
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontSize: 26, opacity: 0.85, lineHeight: 1 }}>#</div>
          <div style={{ fontSize: 86, lineHeight: 1 }}>{number}</div>
        </div>
      </AbsoluteFill>
      {/* Bottom product card */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "flex-end",
          padding: `0 ${SAFE.left}px ${SAFE.bottom - 60}px`,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: C.paper,
            borderRadius: 28,
            padding: "26px 32px",
            width: "100%",
            maxWidth: 880,
            transform: `translateY(${interpolate(numS, [0, 1], [80, 0])}px)`,
            opacity: Math.min(1, numS),
            boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          }}
        >
          <div
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 42,
              color: C.ink,
              lineHeight: 1.1,
            }}
          >
            {product.name}
          </div>
          {product.blurb ? (
            <div
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 500,
                fontSize: 28,
                color: "#444",
                marginTop: 6,
              }}
            >
              {product.blurb}
            </div>
          ) : null}
          {product.price ? (
            <div
              style={{
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 48,
                color: C.accent,
                marginTop: 8,
              }}
            >
              {product.price}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: SAFE.top - 60,
            left: SAFE.left,
            background: "rgba(0,0,0,0.5)",
            color: C.paper,
            padding: "10px 18px",
            borderRadius: 999,
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: 1,
            textTransform: "uppercase",
            backdropFilter: undefined,
          }}
        >
          {number} / {total}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const CompilationReel: React.FC<CompilationProps> = ({
  title,
  subtitle,
  products,
  cta,
  voiceoverUrl,
  musicUrl,
}) => {
  const titleDur = 75;
  const productDur = 120; // 4s each
  const ctaDur = 90;
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Series>
        <Series.Sequence durationInFrames={titleDur}>
          <SceneShell durationFrames={titleDur}>
            <TitleCard title={title} subtitle={subtitle} />
          </SceneShell>
        </Series.Sequence>
        {products.map((p, i) => (
          <Series.Sequence key={i} durationInFrames={productDur}>
            <SceneShell durationFrames={productDur}>
              <NumberedProductCard
                number={i + 1}
                total={products.length}
                product={p}
                durationFrames={productDur}
              />
              {p.blurb ? (
                <CaptionBurn text={p.blurb} durationFrames={productDur} position="middle" />
              ) : null}
            </SceneShell>
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={ctaDur}>
          <CtaEndCard cta={cta} />
        </Series.Sequence>
      </Series>
      <VoiceOver src={voiceoverUrl} />
      <DuckedMusic src={musicUrl} voiceoverActive={Boolean(voiceoverUrl)} />
    </AbsoluteFill>
  );
};