// Ailurova XL — premium TikTok launch spot (1080x1920, 30fps, 18s).
// Product-fidelity locked: uses only rendered stills of the real Ailurova
// enclosed litter box (white/light-gray upper enclosure + stainless steel tray).
// All motion is frame-based (interpolate / spring) — no CSS transitions.
import React from "react";
import {
  AbsoluteFill,
  Img,
  Series,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";

const { fontFamily: inter } = loadInter("normal", { weights: ["500", "700", "800"], subsets: ["latin"] });
const { fontFamily: playfair } = loadPlayfair("normal", { weights: ["500", "700"], subsets: ["latin"] });

const IVORY = "#F5F1E8";
const INK = "#141310";
const WARM = "#B8865A";
const CREAM = "#EBE3D2";

const SAFE = { top: 220, bottom: 340, left: 72, right: 72 } as const;

/** Handheld micro-shake — feels like a real creator held the phone. */
const Handheld: React.FC<{ children: React.ReactNode; amount?: number }> = ({ children, amount = 1 }) => {
  const f = useCurrentFrame();
  const x = Math.sin(f / 7.3) * 4 * amount + Math.cos(f / 11) * 2 * amount;
  const y = Math.cos(f / 9.1) * 3 * amount + Math.sin(f / 13.7) * 1.5 * amount;
  const r = Math.sin(f / 17) * 0.25 * amount;
  return (
    <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px) rotate(${r}deg)` }}>{children}</AbsoluteFill>
  );
};

type Motion = "push_in" | "pull_out" | "pan_right" | "pan_left" | "hold_zoom";

const KenBurns: React.FC<{ src: string; duration: number; motion?: Motion; focus?: [number, number] }> = ({
  src,
  duration,
  motion = "push_in",
  focus = [50, 50],
}) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, duration], [0, 1], { extrapolateRight: "clamp" });
  let scale = 1;
  let tx = 0;
  let ty = 0;
  switch (motion) {
    case "push_in":
      scale = interpolate(t, [0, 1], [1.06, 1.22]);
      break;
    case "pull_out":
      scale = interpolate(t, [0, 1], [1.24, 1.08]);
      break;
    case "pan_right":
      scale = 1.2;
      tx = interpolate(t, [0, 1], [40, -40]);
      break;
    case "pan_left":
      scale = 1.2;
      tx = interpolate(t, [0, 1], [-40, 40]);
      break;
    case "hold_zoom":
      scale = interpolate(t, [0, 1], [1.12, 1.16]);
      ty = interpolate(t, [0, 1], [-8, 8]);
      break;
  }
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: INK }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: `${focus[0]}% ${focus[1]}%`,
          transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
          transformOrigin: "center center",
          filter: "saturate(1.05) contrast(1.04) brightness(1.02)",
        }}
      />
    </AbsoluteFill>
  );
};

/** Cinematic top/bottom scrim so captions read cleanly on any frame. */
const Scrim: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background:
        "linear-gradient(180deg, rgba(20,19,16,0.55) 0%, rgba(20,19,16,0) 22%, rgba(20,19,16,0) 62%, rgba(20,19,16,0.72) 100%)",
    }}
  />
);

const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      opacity: 0.06,
      pointerEvents: "none",
      mixBlendMode: "overlay",
      backgroundImage:
        "radial-gradient(circle at 20% 30%, #fff 0.5px, transparent 1px), radial-gradient(circle at 70% 60%, #000 0.5px, transparent 1px), radial-gradient(circle at 40% 80%, #fff 0.5px, transparent 1px)",
      backgroundSize: "3px 3px, 5px 5px, 4px 4px",
    }}
  />
);

/** Word-by-word mask reveal for the hook. Lands under 0.5s. */
const HookWords: React.FC<{ text: string; sub?: string }> = ({ text, sub }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <AbsoluteFill style={{ padding: `${SAFE.top}px ${SAFE.left}px 0`, justifyContent: "flex-start" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 18px" }}>
        {words.map((w, i) => {
          const s = spring({ frame: f - i * 3, fps, config: { damping: 14, stiffness: 220 } });
          return (
            <span
              key={i}
              style={{
                fontFamily: playfair,
                fontWeight: 700,
                fontStyle: "italic",
                fontSize: 118,
                lineHeight: 1.0,
                letterSpacing: -1,
                color: IVORY,
                opacity: s,
                transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
                textShadow: "0 4px 22px rgba(0,0,0,0.55)",
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 26,
            fontFamily: inter,
            fontWeight: 500,
            fontSize: 38,
            color: IVORY,
            opacity: interpolate(f, [18, 30], [0, 1], { extrapolateRight: "clamp" }),
            letterSpacing: 0.3,
            textShadow: "0 2px 10px rgba(0,0,0,0.55)",
          }}
        >
          {sub}
        </div>
      )}
    </AbsoluteFill>
  );
};

/** Bottom-safe chip caption. */
const Chip: React.FC<{ text: string; accent?: boolean }> = ({ text, accent }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 16, stiffness: 210 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: SAFE.bottom - 40 }}>
      <div
        style={{
          background: accent ? WARM : "rgba(20,19,16,0.78)",
          color: IVORY,
          padding: "20px 32px",
          borderRadius: 999,
          fontFamily: inter,
          fontWeight: 700,
          fontSize: 44,
          letterSpacing: 0.4,
          opacity: s,
          transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
          maxWidth: `calc(100% - ${SAFE.left + SAFE.right}px)`,
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
          border: `1px solid ${accent ? "rgba(255,255,255,0.25)" : "rgba(245,241,232,0.10)"}`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** Vertical marker line + micro-serif label. Feels editorial. */
const EditorialMark: React.FC<{ label: string }> = ({ label }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 20 } });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: SAFE.left,
          top: SAFE.top + 40,
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: s,
          transform: `translateX(${interpolate(s, [0, 1], [-30, 0])}px)`,
        }}
      >
        <div style={{ width: 3, height: 56, background: WARM }} />
        <div style={{ fontFamily: inter, fontWeight: 700, fontSize: 26, letterSpacing: 4, color: IVORY, textTransform: "uppercase" }}>
          {label}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SceneShell: React.FC<{ children: React.ReactNode; duration: number }> = ({ children, duration }) => {
  const f = useCurrentFrame();
  const inFade = interpolate(f, [0, 5], [0, 1], { extrapolateRight: "clamp" });
  const outFade = interpolate(f, [duration - 6, duration], [1, 0], { extrapolateLeft: "clamp" });
  return <AbsoluteFill style={{ opacity: Math.min(inFade, outFade) }}>{children}</AbsoluteFill>;
};

// -------------------- SCENES --------------------

const Scene1Hook: React.FC<{ duration: number }> = ({ duration }) => (
  <SceneShell duration={duration}>
    <Handheld amount={1.3}>
      <KenBurns src={staticFile("ailurova/tiktok/hero-livingroom.jpg")} duration={duration} motion="push_in" focus={[50, 60]} />
    </Handheld>
    <Scrim />
    <HookWords text="Tired of litter everywhere?" sub="A litter box worthy of your living room." />
    <Grain />
  </SceneShell>
);

const Scene2Reveal: React.FC<{ duration: number }> = ({ duration }) => (
  <SceneShell duration={duration}>
    <Handheld amount={0.6}>
      <KenBurns src={staticFile("ailurova/tiktok/hero-livingroom.jpg")} duration={duration} motion="pull_out" focus={[50, 55]} />
    </Handheld>
    <Scrim />
    <EditorialMark label="Ailurova XL" />
    <Chip text="XL Stainless Steel" />
  </SceneShell>
);

const Scene3Cat: React.FC<{ duration: number }> = ({ duration }) => (
  <SceneShell duration={duration}>
    <Handheld amount={1}>
      <KenBurns src={staticFile("ailurova/tiktok/cat-entering.jpg")} duration={duration} motion="push_in" focus={[42, 55]} />
    </Handheld>
    <Scrim />
    <Chip text="Made for Large Cats" />
  </SceneShell>
);

const Scene4Steel: React.FC<{ duration: number }> = ({ duration }) => (
  <SceneShell duration={duration}>
    <Handheld amount={0.5}>
      <KenBurns src={staticFile("ailurova/tiktok/macro-steel.jpg")} duration={duration} motion="pan_right" focus={[45, 55]} />
    </Handheld>
    <Scrim />
    <EditorialMark label="Brushed Steel Tray" />
    <Chip text="Cleaner. Sleeker." accent />
  </SceneShell>
);

const Scene5Filter: React.FC<{ duration: number }> = ({ duration }) => (
  <SceneShell duration={duration}>
    <Handheld amount={0.9}>
      <KenBurns src={staticFile("ailurova/tiktok/filter-step.jpg")} duration={duration} motion="hold_zoom" focus={[50, 55]} />
    </Handheld>
    <Scrim />
    <Chip text="Removable Filter Step" />
  </SceneShell>
);

const Scene6Lid: React.FC<{ duration: number }> = ({ duration }) => (
  <SceneShell duration={duration}>
    <Handheld amount={1.1}>
      <KenBurns src={staticFile("ailurova/tiktok/fliptop-open.jpg")} duration={duration} motion="push_in" focus={[52, 50]} />
    </Handheld>
    <Scrim />
    <Chip text="Easy to Maintain" accent />
  </SceneShell>
);

const Scene7Lifestyle: React.FC<{ duration: number }> = ({ duration }) => (
  <SceneShell duration={duration}>
    <Handheld amount={0.7}>
      <KenBurns src={staticFile("ailurova/tiktok/lifestyle-calm-cat.jpg")} duration={duration} motion="pan_left" focus={[50, 60]} />
    </Handheld>
    <Scrim />
    <Chip text="Calm. Quiet. Elegant." />
  </SceneShell>
);

const Scene8CTA: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bg = interpolate(f, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const logoS = spring({ frame: f - 4, fps, config: { damping: 18, stiffness: 200 } });
  const priceS = spring({ frame: f - 22, fps, config: { damping: 14, stiffness: 200 } });
  const ctaS = spring({ frame: f - 44, fps, config: { damping: 12, stiffness: 210 } });
  const linkS = spring({ frame: f - 60, fps, config: { damping: 18 } });
  const heroScale = interpolate(f, [0, duration], [1.02, 1.09]);
  return (
    <SceneShell duration={duration}>
      <AbsoluteFill style={{ background: IVORY }}>
        <AbsoluteFill style={{ opacity: 0.94 }}>
          <Img
            src={staticFile("ailurova/tiktok/hero-livingroom.jpg")}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${heroScale})`,
              filter: "saturate(1.05) contrast(1.05) brightness(1.05)",
            }}
          />
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            background: `linear-gradient(180deg, rgba(245,241,232,${bg * 0.35}) 0%, rgba(245,241,232,${bg * 0.75}) 55%, rgba(245,241,232,${bg * 0.95}) 100%)`,
          }}
        />
        <AbsoluteFill style={{ padding: `${SAFE.top - 60}px ${SAFE.left}px ${SAFE.bottom - 40}px`, alignItems: "center", justifyContent: "space-between" }}>
          {/* Wordmark */}
          <div
            style={{
              opacity: logoS,
              transform: `translateY(${interpolate(logoS, [0, 1], [-24, 0])}px)`,
              fontFamily: playfair,
              fontWeight: 700,
              fontSize: 108,
              letterSpacing: 6,
              color: INK,
              textAlign: "center",
            }}
          >
            AILUROVA
          </div>

          {/* Price + CTA */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
            <div style={{ opacity: priceS, transform: `translateY(${interpolate(priceS, [0, 1], [30, 0])}px)`, textAlign: "center" }}>
              <div style={{ fontFamily: inter, fontWeight: 500, fontSize: 30, letterSpacing: 6, color: INK, opacity: 0.65, textTransform: "uppercase" }}>
                Now
              </div>
              <div style={{ fontFamily: playfair, fontWeight: 700, fontSize: 200, lineHeight: 1, color: INK, letterSpacing: -2 }}>
                $99
              </div>
            </div>
            <div
              style={{
                opacity: ctaS,
                transform: `scale(${interpolate(ctaS, [0, 1], [0.85, 1])})`,
                background: INK,
                color: IVORY,
                padding: "26px 68px",
                borderRadius: 999,
                fontFamily: inter,
                fontWeight: 800,
                fontSize: 46,
                letterSpacing: 3,
                textTransform: "uppercase",
                boxShadow: "0 18px 50px rgba(20,19,16,0.35)",
              }}
            >
              Shop Now
            </div>
            <div
              style={{
                opacity: linkS,
                fontFamily: inter,
                fontWeight: 600,
                fontSize: 34,
                letterSpacing: 4,
                color: INK,
                textTransform: "uppercase",
              }}
            >
              Ailurova.com
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
      <Grain />
    </SceneShell>
  );
};

// -------------------- ROOT --------------------

const D = {
  hook: 60,
  reveal: 75,
  cat: 60,
  steel: 50,
  filter: 55,
  lid: 60,
  lifestyle: 60,
  cta: 120,
} as const;
// total = 540 frames = 18s @ 30fps

export const AILUROVA_TIKTOK_DURATION = D.hook + D.reveal + D.cat + D.steel + D.filter + D.lid + D.lifestyle + D.cta;

export const MainVideoAilurovaTikTok: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Series>
        <Series.Sequence durationInFrames={D.hook}><Scene1Hook duration={D.hook} /></Series.Sequence>
        <Series.Sequence durationInFrames={D.reveal}><Scene2Reveal duration={D.reveal} /></Series.Sequence>
        <Series.Sequence durationInFrames={D.cat}><Scene3Cat duration={D.cat} /></Series.Sequence>
        <Series.Sequence durationInFrames={D.steel}><Scene4Steel duration={D.steel} /></Series.Sequence>
        <Series.Sequence durationInFrames={D.filter}><Scene5Filter duration={D.filter} /></Series.Sequence>
        <Series.Sequence durationInFrames={D.lid}><Scene6Lid duration={D.lid} /></Series.Sequence>
        <Series.Sequence durationInFrames={D.lifestyle}><Scene7Lifestyle duration={D.lifestyle} /></Series.Sequence>
        <Series.Sequence durationInFrames={D.cta}><Scene8CTA duration={D.cta} /></Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};