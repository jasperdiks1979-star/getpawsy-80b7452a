// CONVERSION VARIANT A — TIME PAIN
// VO: 15.0s • total: 18s @ 30fps = 540 frames
// Voice-over script (word-synced captions below):
//   0.0  This saves me ten minutes every single day.        (~3.0s)
//   3.0  I was so done with the daily scooping.             (~2.5s)
//   5.5  So I switched to this self-cleaning litter box.    (~3.0s)
//   8.5  It cleans itself automatically and keeps           (~3.0s)
//        everything fresh.
//  11.5  No more scooping. Ever.                            (~1.8s)
//  13.3  Get yours now before it sells out.                 (~1.7s)
//  15.0  [hard CTA hold + button pulse]                     (~3.0s)
import { AbsoluteFill, Audio, Series, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { display, body, ORANGE, CREAM, INK, WHITE, IMG, KenBurns, CTAScene } from "./litterboxShared";

const Caption: React.FC<{ text: string; size?: number; color?: string; bg?: string; bottom?: number }> = ({
  text, size = 78, color = WHITE, bg = INK, bottom = 380,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 15, stiffness: 200 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: bottom }}>
      <div style={{
        fontFamily: display.fontFamily, fontSize: size, color, background: bg,
        padding: "20px 30px", borderRadius: 14, opacity: s, maxWidth: "92%", textAlign: "center",
        textTransform: "uppercase", letterSpacing: -0.5, lineHeight: 1.0, whiteSpace: "pre-line",
        transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        WebkitTextStroke: bg === WHITE ? "0" : "2px rgba(0,0,0,0.25)",
      }}>{text}</div>
    </AbsoluteFill>
  );
};

const HighlightBadge: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 10, stiffness: 220 } });
  const pulse = 1 + Math.sin((frame - delay) * 0.3) * 0.03;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 160 }}>
      <div style={{
        background: ORANGE, color: WHITE, padding: "22px 36px", borderRadius: 16,
        fontFamily: display.fontFamily, fontSize: 92, textTransform: "uppercase", letterSpacing: -1,
        opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.7, 1]) * pulse})`,
        boxShadow: "0 16px 50px rgba(255,106,26,0.6)", textAlign: "center", maxWidth: "92%",
      }}>{text}</div>
    </AbsoluteFill>
  );
};

// Scene 1 (0-3.0s = 90f): Hook — "10 minutes every day"
const SceneHook: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src={IMG("hero.jpg")} from={1.05} to={1.15} pan="none" bg={CREAM} fit="contain" />
    <HighlightBadge text={"SAVES ME\n10 MIN/DAY"} delay={2} />
    <Caption text="every single day" size={62} bg={INK} bottom={260} />
  </AbsoluteFill>
);

// Scene 2 (3.0-5.5s = 75f): Pain — "done with daily scooping"
const ScenePain: React.FC = () => (
  <AbsoluteFill style={{ background: INK }}>
    <AbsoluteFill style={{ opacity: 0.4 }}>
      <KenBurns src={IMG("lifestyle.jpg")} from={1.05} to={1.15} pan="left" bg={INK} fit="cover" />
    </AbsoluteFill>
    <HighlightBadge text={"DONE WITH\nDAILY SCOOPING"} delay={2} />
  </AbsoluteFill>
);

// Scene 3 (5.5-8.5s = 90f): Solution — product reveal
const SceneSolution: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src={IMG("clean.jpg")} from={1.02} to={1.12} pan="up" bg={CREAM} fit="contain" />
    <HighlightBadge text="SELF-CLEANING" delay={2} />
    <Caption text="So I switched to this →" size={56} bg={ORANGE} color={WHITE} bottom={300} />
  </AbsoluteFill>
);

// Scene 4 (8.5-11.5s = 90f): Mechanism bullets
const SceneMechanism: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = ["Cleans itself automatically", "Always fresh", "Zero effort"];
  return (
    <AbsoluteFill style={{ background: INK }}>
      <AbsoluteFill style={{ opacity: 0.25 }}>
        <KenBurns src={IMG("safety.jpg")} from={1.05} to={1.15} pan="right" bg={INK} fit="cover" />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {items.map((it, i) => {
            const s = spring({ frame: frame - i * 14, fps, config: { damping: 14, stiffness: 180 } });
            return (
              <div key={i} style={{
                background: WHITE, color: INK, padding: "22px 34px", borderRadius: 14,
                fontFamily: body.fontFamily, fontWeight: 900, fontSize: 54,
                opacity: s, transform: `translateX(${interpolate(s, [0, 1], [-120, 0])}px)`,
                display: "flex", alignItems: "center", gap: 18,
                boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
              }}>
                <span style={{ color: ORANGE, fontSize: 56 }}>✓</span>{it}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Scene 5 (11.5-13.3s = 54f): Result — "no more scooping ever"
const SceneResult: React.FC = () => (
  <AbsoluteFill style={{ background: ORANGE }}>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <HighlightBadge text={"NO MORE\nSCOOPING."} delay={0} />
      <div style={{ position: "absolute", bottom: 320, fontFamily: display.fontFamily, fontSize: 110,
        color: WHITE, textTransform: "uppercase", textShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>EVER.</div>
    </AbsoluteFill>
  </AbsoluteFill>
);

// Scene 6 (13.3-18.0s = 141f): CTA
export const MainVideoTimePain: React.FC = () => (
  <AbsoluteFill style={{ background: INK, fontFamily: body.fontFamily }}>
    <Series>
      <Series.Sequence durationInFrames={90}><SceneHook /></Series.Sequence>
      <Series.Sequence durationInFrames={75}><ScenePain /></Series.Sequence>
      <Series.Sequence durationInFrames={90}><SceneSolution /></Series.Sequence>
      <Series.Sequence durationInFrames={90}><SceneMechanism /></Series.Sequence>
      <Series.Sequence durationInFrames={54}><SceneResult /></Series.Sequence>
      <Series.Sequence durationInFrames={141}>
        <CTAScene headline={"Get yours now\nbefore it sells out"} button="Shop Now →" sub="Limited stock · Free US Shipping" />
      </Series.Sequence>
    </Series>
    <Audio src={staticFile("audio/litterbox-vo-timepain.mp3")} startFrom={0} volume={1} />
  </AbsoluteFill>
);