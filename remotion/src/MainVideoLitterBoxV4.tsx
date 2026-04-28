// V4 — POV / GUEST EMBARRASSMENT ANGLE (~22s)
import { AbsoluteFill, Audio, Series, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { display, body, ORANGE, CREAM, INK, WHITE, IMG, KenBurns, TopText, BottomText, FeatureCard, CTAScene } from "./litterboxShared";

const ScenePOV: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 180 } });
  return (
    <AbsoluteFill style={{ background: INK }}>
      <AbsoluteFill style={{ opacity: 0.4 }}>
        <KenBurns src={IMG("hero.jpg")} from={1.1} to={1.2} pan="right" bg={INK} fit="contain" />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 60 }}>
        <div style={{
          fontFamily: display.fontFamily, fontSize: 110, color: WHITE, letterSpacing: -2,
          textTransform: "uppercase", textAlign: "center", lineHeight: 0.95, opacity: s,
          transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
          textShadow: "0 4px 20px rgba(0,0,0,0.7)",
        }}>POV:</div>
        <div style={{
          marginTop: 30, fontFamily: body.fontFamily, fontWeight: 800, fontSize: 56, color: WHITE,
          textAlign: "center", lineHeight: 1.15, maxWidth: "92%",
          background: "rgba(0,0,0,0.55)", padding: "20px 28px", borderRadius: 16, opacity: s,
        }}>guests come over and your house{"\n"}smells like a cat 🫠</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SceneSolution: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src={IMG("hero.jpg")} from={1.05} to={1.15} pan="none" bg={CREAM} fit="contain" />
    <TopText text="Until I got THIS" size={86} bg={ORANGE} color={WHITE} delay={2} />
    <BottomText text="Self-cleaning · Sealed odor" size={48} bg={INK} delay={45} />
  </AbsoluteFill>
);

const SceneFresh: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src={IMG("lifestyle.jpg")} from={1.0} to={1.1} pan="up" bg={CREAM} fit="cover" />
    <TopText text="Now my home smells normal" size={58} bg={WHITE} color={INK} delay={2} />
  </AbsoluteFill>
);

export const MainVideoLitterBoxV4: React.FC = () => (
  <AbsoluteFill style={{ background: INK, fontFamily: body.fontFamily }}>
    <Series>
      <Series.Sequence durationInFrames={100}><ScenePOV /></Series.Sequence>
      <Series.Sequence durationInFrames={90}><SceneSolution /></Series.Sequence>
      <Series.Sequence durationInFrames={90}><SceneFresh /></Series.Sequence>
      <Series.Sequence durationInFrames={50}><FeatureCard src={IMG("clean.jpg")} label="Auto Scoop" sub="After every visit" /></Series.Sequence>
      <Series.Sequence durationInFrames={50}><FeatureCard src={IMG("washable.jpg")} label="Sealed Odor" sub="Stays inside, not in your home" /></Series.Sequence>
      <Series.Sequence durationInFrames={50}><FeatureCard src={IMG("app.jpg")} label="App Control" sub="Track from your phone" /></Series.Sequence>
      <Series.Sequence durationInFrames={130}>
        <CTAScene headline={"Make your home\nsmell normal again"} button="Order Now →" />
      </Series.Sequence>
    </Series>
    <Audio src={staticFile("audio/litterbox-vo-v4.mp3")} startFrom={0} volume={1} />
  </AbsoluteFill>
);
