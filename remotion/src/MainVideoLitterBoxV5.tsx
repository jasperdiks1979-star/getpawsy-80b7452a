// V5 — TECH / CURIOSITY DEMO ANGLE (~20s)
import { AbsoluteFill, Audio, Series, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { display, body, ORANGE, CREAM, INK, WHITE, IMG, KenBurns, TopText, BottomText, FeatureCard, CTAScene } from "./litterboxShared";

const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 180 } });
  return (
    <AbsoluteFill>
      <KenBurns src={IMG("hero.jpg")} from={1.0} to={1.15} pan="none" bg={CREAM} fit="contain" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 100 }}>
        <div style={{
          fontFamily: display.fontFamily, fontSize: 92, color: WHITE, background: INK,
          padding: "22px 30px", borderRadius: 16, textTransform: "uppercase", letterSpacing: -1,
          textAlign: "center", lineHeight: 0.95, opacity: s, maxWidth: "92%",
          transform: `translateY(${interpolate(s, [0, 1], [-60, 0])}px)`,
          boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
        }}>The litter box{"\n"}that cleans itself</div>
      </AbsoluteFill>
      <BottomText text="Watch how →" size={52} bg={ORANGE} delay={40} />
    </AbsoluteFill>
  );
};

const SceneStep: React.FC<{ src: string; num: string; title: string; sub: string; fit?: "cover" | "contain" }> = ({ src, num, title, sub, fit = "contain" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 170 } });
  return (
    <AbsoluteFill>
      <KenBurns src={src} from={1.02} to={1.12} pan="right" bg={CREAM} fit={fit} />
      <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "flex-start", padding: 60 }}>
        <div style={{
          background: ORANGE, color: WHITE, padding: "14px 24px", borderRadius: 12,
          fontFamily: display.fontFamily, fontSize: 56, opacity: s,
          transform: `translateX(${interpolate(s, [0, 1], [-80, 0])}px)`,
        }}>STEP {num}</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 240 }}>
        <div style={{
          background: INK, color: WHITE, padding: "20px 32px", borderRadius: 14,
          fontFamily: display.fontFamily, fontSize: 64, textTransform: "uppercase", letterSpacing: -1,
          textAlign: "center", maxWidth: "92%", opacity: s,
          transform: `translateY(${interpolate(s, [0, 1], [60, 0])}px)`,
        }}>{title}</div>
        <div style={{
          marginTop: 12, background: WHITE, color: INK, padding: "12px 22px", borderRadius: 10,
          fontFamily: body.fontFamily, fontWeight: 700, fontSize: 32, opacity: s,
        }}>{sub}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const MainVideoLitterBoxV5: React.FC = () => (
  <AbsoluteFill style={{ background: INK, fontFamily: body.fontFamily }}>
    <Series>
      <Series.Sequence durationInFrames={90}><SceneHook /></Series.Sequence>
      <Series.Sequence durationInFrames={75}><SceneStep src={IMG("safety.jpg")} num="1" title="Sensors detect your cat" sub="PIR + weight detection" /></Series.Sequence>
      <Series.Sequence durationInFrames={75}><SceneStep src={IMG("clean.jpg")} num="2" title="Auto-scoops when they leave" sub="Quiet, safe, automatic" /></Series.Sequence>
      <Series.Sequence durationInFrames={75}><SceneStep src={IMG("washable.jpg")} num="3" title="Odor sealed inside" sub="Washable parts for deep clean" /></Series.Sequence>
      <Series.Sequence durationInFrames={75}><SceneStep src={IMG("app.jpg")} num="4" title="Control from your phone" sub="App alerts + monitoring" /></Series.Sequence>
      <Series.Sequence durationInFrames={120}>
        <CTAScene headline={"Try it risk-free\nfor 30 days"} button="Get Mine →" sub="Free US Shipping · 30-Day Returns" />
      </Series.Sequence>
    </Series>
    <Audio src={staticFile("audio/litterbox-vo-v5.mp3")} startFrom={0} volume={1} />
  </AbsoluteFill>
);
