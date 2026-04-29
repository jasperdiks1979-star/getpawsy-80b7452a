// CONVERSION VARIANT B — SMELL PROBLEM
// VO: 13.5s • total: 17s @ 30fps = 510 frames
// VO timing:
//   0.0  This is why your house smells.            (~2.2s)
//   2.2  Dirty litter, every single day.           (~2.3s)
//   4.5  So I switched to this.                    (~1.6s)
//   6.1  It cleans itself, traps the odor,         (~2.5s)
//        and keeps the air fresh.
//   8.6  No more smell. No more scooping.          (~2.5s)
//  11.1  Get yours now before it's gone.           (~2.4s)
//  13.5  [CTA pulse hold]                          (~3.5s)
import { AbsoluteFill, Audio, Series, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { display, body, ORANGE, CREAM, INK, WHITE, IMG, KenBurns, CTAScene } from "./litterboxShared";

const SmellBadge: React.FC<{ text: string; bg?: string; color?: string; size?: number }> = ({
  text, bg = ORANGE, color = WHITE, size = 90,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 11, stiffness: 220 } });
  const shake = Math.sin(frame * 0.6) * (frame < 30 ? 4 : 0);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 180 }}>
      <div style={{
        background: bg, color, padding: "22px 36px", borderRadius: 16,
        fontFamily: display.fontFamily, fontSize: size, textTransform: "uppercase", letterSpacing: -1,
        opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.7, 1])}) translateX(${shake}px)`,
        boxShadow: "0 16px 50px rgba(0,0,0,0.45)", textAlign: "center", maxWidth: "92%",
        whiteSpace: "pre-line", lineHeight: 0.95,
      }}>{text}</div>
    </AbsoluteFill>
  );
};

const BottomCap: React.FC<{ text: string; bg?: string; color?: string; size?: number }> = ({
  text, bg = INK, color = WHITE, size = 60,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 200 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 320 }}>
      <div style={{
        background: bg, color, padding: "18px 28px", borderRadius: 12,
        fontFamily: display.fontFamily, fontSize: size, textTransform: "uppercase", letterSpacing: -0.5,
        opacity: s, transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
        boxShadow: "0 10px 30px rgba(0,0,0,0.4)", textAlign: "center", maxWidth: "92%",
      }}>{text}</div>
    </AbsoluteFill>
  );
};

// Scene 1 (0-2.2s = 66f) — Hook: "this is why your house smells"
const SceneHook: React.FC = () => (
  <AbsoluteFill style={{ background: INK }}>
    <AbsoluteFill style={{ opacity: 0.55 }}>
      <KenBurns src={IMG("lifestyle.jpg")} from={1.08} to={1.18} pan="left" bg={INK} fit="cover" />
    </AbsoluteFill>
    <SmellBadge text={"WHY YOUR\nHOUSE SMELLS"} size={86} />
    <BottomCap text="🤢" size={120} bg="transparent" />
  </AbsoluteFill>
);

// Scene 2 (2.2-4.5s = 69f) — Pain: dirty every day
const ScenePain: React.FC = () => (
  <AbsoluteFill style={{ background: INK }}>
    <AbsoluteFill style={{ opacity: 0.4 }}>
      <KenBurns src={IMG("safety.jpg")} from={1.05} to={1.15} pan="right" bg={INK} fit="cover" />
    </AbsoluteFill>
    <SmellBadge text={"DIRTY LITTER\nEVERY DAY"} bg={INK} color={WHITE} size={80} />
    <BottomCap text="No thanks." size={56} bg={ORANGE} />
  </AbsoluteFill>
);

// Scene 3 (4.5-6.1s = 48f) — Switch
const SceneSwitch: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src={IMG("hero.jpg")} from={1.05} to={1.15} pan="none" bg={CREAM} fit="contain" />
    <SmellBadge text="SO I SWITCHED →" size={78} />
  </AbsoluteFill>
);

// Scene 4 (6.1-8.6s = 75f) — Mechanism: cleans, traps odor, fresh
const SceneMechanism: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = ["Cleans itself", "Traps the odor", "Air stays fresh"];
  return (
    <AbsoluteFill style={{ background: CREAM }}>
      <AbsoluteFill style={{ opacity: 0.25 }}>
        <KenBurns src={IMG("clean.jpg")} from={1.02} to={1.1} pan="up" bg={CREAM} fit="contain" />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {items.map((it, i) => {
            const s = spring({ frame: frame - i * 12, fps, config: { damping: 13, stiffness: 200 } });
            return (
              <div key={i} style={{
                background: INK, color: WHITE, padding: "22px 34px", borderRadius: 14,
                fontFamily: body.fontFamily, fontWeight: 900, fontSize: 52,
                opacity: s, transform: `translateX(${interpolate(s, [0, 1], [-130, 0])}px)`,
                display: "flex", alignItems: "center", gap: 18,
                boxShadow: "0 14px 40px rgba(0,0,0,0.4)",
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

// Scene 5 (8.6-11.1s = 75f) — Result: no more smell
const SceneResult: React.FC = () => (
  <AbsoluteFill style={{ background: ORANGE }}>
    <SmellBadge text={"NO MORE\nSMELL."} bg={WHITE} color={INK} size={104} />
    <BottomCap text="No more scooping." size={62} bg={INK} />
  </AbsoluteFill>
);

// Scene 6 (11.1-17s = 177f) — CTA
export const MainVideoSmellProblem: React.FC = () => (
  <AbsoluteFill style={{ background: INK, fontFamily: body.fontFamily }}>
    <Series>
      <Series.Sequence durationInFrames={66}><SceneHook /></Series.Sequence>
      <Series.Sequence durationInFrames={69}><ScenePain /></Series.Sequence>
      <Series.Sequence durationInFrames={48}><SceneSwitch /></Series.Sequence>
      <Series.Sequence durationInFrames={75}><SceneMechanism /></Series.Sequence>
      <Series.Sequence durationInFrames={75}><SceneResult /></Series.Sequence>
      <Series.Sequence durationInFrames={177}>
        <CTAScene headline={"Get yours now\nbefore it's gone"} button="Shop Now →" sub="Limited stock · Free US Shipping" />
      </Series.Sequence>
    </Series>
    <Audio src={staticFile("audio/litterbox-vo-smell.mp3")} startFrom={0} volume={1} />
  </AbsoluteFill>
);