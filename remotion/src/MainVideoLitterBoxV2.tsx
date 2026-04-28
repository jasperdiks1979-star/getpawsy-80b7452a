import { AbsoluteFill, Audio, Img, Sequence, Series, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/Anton";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["600", "700", "800", "900"], subsets: ["latin"] });

// 22s @ 30fps = 660 frames
// Hook 90 | Problem 90 | Solution 180 | Features 180 | Trust 60 | CTA 60

const ORANGE = "#FF6A1A";
const ORANGE_DARK = "#E55A0F";
const CREAM = "#FAF6F0";
const INK = "#1A1410";
const WHITE = "#FFFFFF";

const KenBurns: React.FC<{ src: string; from?: number; to?: number; pan?: "left" | "right" | "up" | "down" | "none"; bg?: string; fit?: "cover" | "contain" }> = ({
  src, from = 1.0, to = 1.12, pan = "right", bg = CREAM, fit = "cover",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [from, to]);
  const t = interpolate(frame, [0, durationInFrames], [0, 1]);
  const tx = pan === "left" ? -25 * t : pan === "right" ? 25 * t : 0;
  const ty = pan === "up" ? -25 * t : pan === "down" ? 25 * t : 0;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: bg }}>
      <Img
        src={src}
        style={{
          width: "100%", height: "100%", objectFit: fit, objectPosition: "center",
          transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

const TopText: React.FC<{ text: string; color?: string; bg?: string; size?: number; delay?: number }> = ({ text, color = INK, bg = WHITE, size = 78, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 180 } });
  const y = interpolate(s, [0, 1], [-60, 0]);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 120 }}>
      <div style={{
        fontFamily: display.fontFamily, fontSize: size, lineHeight: 0.95, color,
        background: bg, padding: "20px 28px", borderRadius: 16, transform: `translateY(${y}px)`,
        opacity: s, textAlign: "center", maxWidth: "90%", letterSpacing: -1,
        boxShadow: "0 12px 40px rgba(0,0,0,0.18)", textTransform: "uppercase",
      }}>{text}</div>
    </AbsoluteFill>
  );
};

const BottomText: React.FC<{ text: string; color?: string; bg?: string; size?: number; delay?: number }> = ({ text, color = WHITE, bg = ORANGE, size = 64, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 180 } });
  const y = interpolate(s, [0, 1], [80, 0]);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 220 }}>
      <div style={{
        fontFamily: display.fontFamily, fontSize: size, color,
        background: bg, padding: "18px 32px", borderRadius: 14, transform: `translateY(${y}px)`,
        opacity: s, textAlign: "center", textTransform: "uppercase", letterSpacing: -0.5,
        boxShadow: "0 10px 30px rgba(255,106,26,0.4)",
      }}>{text}</div>
    </AbsoluteFill>
  );
};

const BulletList: React.FC<{ items: string[]; delay?: number }> = ({ items, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {items.map((item, i) => {
          const s = spring({ frame: frame - delay - i * 8, fps, config: { damping: 14, stiffness: 180 } });
          return (
            <div key={i} style={{
              fontFamily: body.fontFamily, fontWeight: 800, fontSize: 56, color: WHITE,
              background: INK, padding: "16px 28px", borderRadius: 12, opacity: s,
              transform: `translateX(${interpolate(s, [0, 1], [-80, 0])}px)`,
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <span style={{ color: ORANGE, fontSize: 48 }}>✓</span>{item}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// SCENE 1: HOOK (0-3s) — real hero product
const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flash = frame < 4 ? 1 : 0;
  return (
    <AbsoluteFill>
      <KenBurns src={staticFile("images/litterbox-real/hero.jpg")} from={1.05} to={1.18} pan="none" bg={CREAM} fit="contain" />
      {flash > 0 && <AbsoluteFill style={{ background: WHITE, opacity: flash }} />}
      <TopText text={"Stop scooping\nyour cat's litter"} size={84} bg={ORANGE} color={WHITE} delay={4} />
      <BottomText text="THIS changes everything" size={52} delay={50} />
    </AbsoluteFill>
  );
};

// SCENE 2: PROBLEM (3-6s) — keep on real product (no fake messy box) with problem callouts
const SceneProblem: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: INK }}>
      <AbsoluteFill style={{ opacity: 0.35 }}>
        <KenBurns src={staticFile("images/litterbox-real/hero.jpg")} from={1.1} to={1.2} pan="left" bg={INK} fit="contain" />
      </AbsoluteFill>
      <TopText text="The daily struggle" size={68} bg={WHITE} color={INK} delay={2} />
      <BulletList items={["Smell in your home", "Daily scooping", "Mess everywhere"]} delay={20} />
    </AbsoluteFill>
  );
};

// SCENE 3: SOLUTION (6-12s) — lifestyle + clean cycle
const SceneSolution1: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src={staticFile("images/litterbox-real/lifestyle.jpg")} from={1.0} to={1.1} pan="up" bg={CREAM} fit="cover" />
    <TopText text="Self-cleaning" size={92} bg={ORANGE} color={WHITE} delay={2} />
    <BottomText text="Odor control 24/7" size={58} delay={45} bg={INK} />
  </AbsoluteFill>
);

const SceneSolution2: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src={staticFile("images/litterbox-real/clean.jpg")} from={1.02} to={1.12} pan="right" bg={CREAM} fit="contain" />
    <TopText text="No more daily scooping" size={68} bg={WHITE} color={INK} delay={2} />
  </AbsoluteFill>
);

// SCENE 4: FEATURES (12-18s)
const FeatureCard: React.FC<{ src: string; label: string; sub: string; delay?: number; fit?: "cover" | "contain" }> = ({ src, label, sub, delay = 0, fit = "contain" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 160 } });
  return (
    <AbsoluteFill style={{ background: CREAM, opacity: s }}>
      <KenBurns src={src} from={1.02} to={1.1} pan="right" bg={CREAM} fit={fit} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 280 }}>
        <div style={{
          background: ORANGE, color: WHITE, padding: "20px 34px", borderRadius: 16,
          fontFamily: display.fontFamily, fontSize: 72, textTransform: "uppercase", letterSpacing: -1,
          boxShadow: "0 12px 40px rgba(255,106,26,0.5)", textAlign: "center",
          transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
        }}>{label}</div>
        <div style={{
          marginTop: 14, background: INK, color: WHITE, padding: "12px 22px", borderRadius: 10,
          fontFamily: body.fontFamily, fontWeight: 700, fontSize: 36,
        }}>{sub}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// SCENE 5: TRUST (18-20s)
const SceneTrust: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = ["Loved by US cat parents", "30-Day Risk-Free Returns", "Free US Shipping"];
  return (
    <AbsoluteFill style={{ background: CREAM, alignItems: "center", justifyContent: "center" }}>
      <Img src={staticFile("images/litterbox-real/hero.jpg")} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "contain", opacity: 0.18 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 22, zIndex: 2 }}>
        {items.map((it, i) => {
          const s = spring({ frame: frame - i * 10, fps, config: { damping: 14, stiffness: 170 } });
          return (
            <div key={i} style={{
              background: WHITE, padding: "22px 36px", borderRadius: 14,
              fontFamily: body.fontFamily, fontWeight: 800, fontSize: 50, color: INK,
              boxShadow: "0 10px 30px rgba(0,0,0,0.12)", border: `3px solid ${ORANGE}`,
              opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`,
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <span style={{ color: ORANGE, fontSize: 44 }}>★</span>{it}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// SCENE 6: CTA (20-22s)
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 1 + Math.sin(frame * 0.25) * 0.04;
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  return (
    <AbsoluteFill>
      <KenBurns src={staticFile("images/litterbox-real/hero.jpg")} from={1.1} to={1.18} pan="none" bg={CREAM} fit="contain" />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.5) 100%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30 }}>
        <div style={{
          fontFamily: display.fontFamily, fontSize: 96, color: WHITE,
          textAlign: "center", textTransform: "uppercase", lineHeight: 0.95,
          textShadow: "0 4px 20px rgba(0,0,0,0.6)", opacity: s, maxWidth: "90%",
        }}>Get yours{"\n"}today</div>
        <div style={{
          background: ORANGE, color: WHITE, padding: "26px 56px", borderRadius: 999,
          fontFamily: display.fontFamily, fontSize: 64, textTransform: "uppercase",
          transform: `scale(${pulse})`, boxShadow: "0 16px 50px rgba(255,106,26,0.6)",
          border: `4px solid ${WHITE}`,
        }}>Shop Now →</div>
        <div style={{
          fontFamily: body.fontFamily, fontWeight: 700, fontSize: 32, color: WHITE,
          background: "rgba(0,0,0,0.5)", padding: "10px 22px", borderRadius: 8, opacity: s,
        }}>Free US Shipping · 30-Day Returns</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const MainVideoLitterBoxV2: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: INK, fontFamily: body.fontFamily }}>
      <Series>
        <Series.Sequence durationInFrames={90}><SceneHook /></Series.Sequence>
        <Series.Sequence durationInFrames={90}><SceneProblem /></Series.Sequence>
        <Series.Sequence durationInFrames={90}><SceneSolution1 /></Series.Sequence>
        <Series.Sequence durationInFrames={90}><SceneSolution2 /></Series.Sequence>
        <Series.Sequence durationInFrames={45}>
          <FeatureCard src={staticFile("images/litterbox-real/app.jpg")} label="App Control" sub="Monitor from anywhere" delay={0} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={45}>
          <FeatureCard src={staticFile("images/litterbox-real/washable.jpg")} label="Washable Parts" sub="Easy deep clean" delay={0} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={45}>
          <FeatureCard src={staticFile("images/litterbox-real/safety.jpg")} label="Smart Sensors" sub="PIR + weight detection" delay={0} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={45}>
          <FeatureCard src={staticFile("images/litterbox-real/lifestyle.jpg")} label="Safe Design" sub="Stops when cat enters" delay={0} fit="cover" />
        </Series.Sequence>
        <Series.Sequence durationInFrames={60}><SceneTrust /></Series.Sequence>
        <Series.Sequence durationInFrames={60}><SceneCTA /></Series.Sequence>
      </Series>
      <Audio src={staticFile("audio/litterbox-vo-v2.mp3")} startFrom={0} volume={1} />
    </AbsoluteFill>
  );
};
