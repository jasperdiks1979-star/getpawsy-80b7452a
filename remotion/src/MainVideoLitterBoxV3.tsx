// V3 — TIME-SAVING / RELATABLE CONFESSION ANGLE (~22s)
import { AbsoluteFill, Audio, Series, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { display, body, ORANGE, CREAM, INK, WHITE, IMG, KenBurns, TopText, BottomText, FeatureCard, CTAScene } from "./litterboxShared";

const SceneHook: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src={IMG("hero.jpg")} from={1.05} to={1.18} pan="none" bg={CREAM} fit="contain" />
    <TopText text={"I haven't scooped\nin 3 months"} size={80} bg={ORANGE} color={WHITE} delay={2} />
    <BottomText text="Here's why →" size={54} bg={INK} delay={45} />
  </AbsoluteFill>
);

const SceneRelief: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = ["No daily scooping", "No litter all over the floor", "No smell when guests come over"];
  return (
    <AbsoluteFill style={{ background: INK }}>
      <AbsoluteFill style={{ opacity: 0.3 }}>
        <KenBurns src={IMG("lifestyle.jpg")} from={1.05} to={1.15} pan="left" bg={INK} fit="cover" />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {items.map((it, i) => {
            const s = spring({ frame: frame - i * 12, fps, config: { damping: 14, stiffness: 170 } });
            return (
              <div key={i} style={{
                background: WHITE, color: INK, padding: "20px 32px", borderRadius: 14,
                fontFamily: body.fontFamily, fontWeight: 800, fontSize: 50,
                opacity: s, transform: `translateX(${interpolate(s, [0, 1], [-100, 0])}px)`,
                display: "flex", alignItems: "center", gap: 16,
                boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
              }}>
                <span style={{ color: ORANGE, fontSize: 48 }}>✓</span>{it}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SceneSolution: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src={IMG("clean.jpg")} from={1.02} to={1.12} pan="up" bg={CREAM} fit="contain" />
    <TopText text="Cleans itself automatically" size={62} bg={ORANGE} color={WHITE} delay={2} />
  </AbsoluteFill>
);

export const MainVideoLitterBoxV3: React.FC = () => (
  <AbsoluteFill style={{ background: INK, fontFamily: body.fontFamily }}>
    <Series>
      <Series.Sequence durationInFrames={90}><SceneHook /></Series.Sequence>
      <Series.Sequence durationInFrames={120}><SceneRelief /></Series.Sequence>
      <Series.Sequence durationInFrames={90}><SceneSolution /></Series.Sequence>
      <Series.Sequence durationInFrames={50}><FeatureCard src={IMG("app.jpg")} label="App Control" sub="Monitor from anywhere" /></Series.Sequence>
      <Series.Sequence durationInFrames={50}><FeatureCard src={IMG("safety.jpg")} label="Smart + Safe" sub="Sensors stop when cat enters" /></Series.Sequence>
      <Series.Sequence durationInFrames={50}><FeatureCard src={IMG("washable.jpg")} label="Washable Parts" sub="Easy deep clean" /></Series.Sequence>
      <Series.Sequence durationInFrames={120}>
        <CTAScene headline={"Reclaim\nyour weekends"} button="Tap to Shop →" />
      </Series.Sequence>
    </Series>
    <Audio src={staticFile("audio/litterbox-vo-v3.mp3")} startFrom={0} volume={1} />
  </AbsoluteFill>
);
