// CONVERSION VARIANT C — DIRECT BUYER
// VO: 10.6s • total: 14s @ 30fps = 420 frames
// VO timing:
//   0.0  If you have a cat, you need this.        (~2.5s)
//   2.5  Self-cleaning litter box.                 (~1.7s)
//   4.2  No scooping. No smell. Always clean.      (~3.0s)
//   7.2  Free US shipping. Thirty-day returns.     (~2.0s)
//   9.2  Get yours now before it sells out.        (~1.4s)
//  10.6  [CTA pulse hold]                          (~3.4s)
import { AbsoluteFill, Audio, Series, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { display, body, ORANGE, CREAM, INK, WHITE, IMG, KenBurns, CTAScene } from "./litterboxShared";

const Stamp: React.FC<{ text: string; bg?: string; color?: string; size?: number; pos?: "top" | "center" }> = ({
  text, bg = ORANGE, color = WHITE, size = 100, pos = "top",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 10, stiffness: 240 } });
  const rot = interpolate(s, [0, 1], [-6, 0]);
  return (
    <AbsoluteFill style={{
      alignItems: "center",
      justifyContent: pos === "top" ? "flex-start" : "center",
      paddingTop: pos === "top" ? 200 : 0,
    }}>
      <div style={{
        background: bg, color, padding: "26px 40px", borderRadius: 18,
        fontFamily: display.fontFamily, fontSize: size, textTransform: "uppercase", letterSpacing: -1,
        opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.5, 1])}) rotate(${rot}deg)`,
        boxShadow: "0 18px 55px rgba(0,0,0,0.5)", textAlign: "center", maxWidth: "92%",
        whiteSpace: "pre-line", lineHeight: 0.95,
        border: `4px solid ${color}`,
      }}>{text}</div>
    </AbsoluteFill>
  );
};

// Scene 1 (0-2.5s = 75f) — Hook: if you have a cat
const SceneHook: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src={IMG("hero.jpg")} from={1.08} to={1.18} pan="none" bg={CREAM} fit="contain" />
    <Stamp text={"IF YOU HAVE\nA CAT…"} size={92} />
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 320 }}>
      <div style={{
        background: INK, color: WHITE, padding: "18px 28px", borderRadius: 12,
        fontFamily: display.fontFamily, fontSize: 64, textTransform: "uppercase",
        boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
      }}>YOU NEED THIS.</div>
    </AbsoluteFill>
  </AbsoluteFill>
);

// Scene 2 (2.5-4.2s = 51f) — Product label
const SceneLabel: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src={IMG("clean.jpg")} from={1.02} to={1.12} pan="up" bg={CREAM} fit="contain" />
    <Stamp text="SELF-CLEANING" size={92} bg={ORANGE} />
  </AbsoluteFill>
);

// Scene 3 (4.2-7.2s = 90f) — Triple benefit fast cuts
const SceneBenefits: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = [
    { t: "NO SCOOPING", img: "safety.jpg" },
    { t: "NO SMELL", img: "washable.jpg" },
    { t: "ALWAYS CLEAN", img: "clean.jpg" },
  ];
  // 90 frames / 3 = 30f each
  const idx = Math.min(2, Math.floor(frame / 30));
  const localFrame = frame - idx * 30;
  const s = spring({ frame: localFrame, fps, config: { damping: 10, stiffness: 240 } });
  const it = items[idx];
  return (
    <AbsoluteFill>
      <KenBurns src={IMG(it.img)} from={1.05} to={1.15} pan="right" bg={CREAM} fit="contain" />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.55) 100%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{
          background: ORANGE, color: WHITE, padding: "28px 44px", borderRadius: 18,
          fontFamily: display.fontFamily, fontSize: 120, textTransform: "uppercase", letterSpacing: -2,
          opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)", textAlign: "center",
          border: `5px solid ${WHITE}`,
        }}>{it.t}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Scene 4 (7.2-9.2s = 60f) — Trust: shipping + returns
const SceneTrust: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = ["Free US Shipping", "30-Day Returns", "Secure Checkout"];
  return (
    <AbsoluteFill style={{ background: INK }}>
      <AbsoluteFill style={{ opacity: 0.2 }}>
        <KenBurns src={IMG("hero.jpg")} from={1.05} to={1.12} pan="none" bg={INK} fit="contain" />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {items.map((it, i) => {
            const s = spring({ frame: frame - i * 8, fps, config: { damping: 14, stiffness: 220 } });
            return (
              <div key={i} style={{
                background: WHITE, color: INK, padding: "20px 30px", borderRadius: 12,
                fontFamily: body.fontFamily, fontWeight: 900, fontSize: 50,
                opacity: s, transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
                display: "flex", alignItems: "center", gap: 16,
                boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
              }}>
                <span style={{ color: ORANGE, fontSize: 54 }}>✓</span>{it}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Scene 5 (9.2-14s = 144f) — CTA
export const MainVideoDirectBuyer: React.FC = () => (
  <AbsoluteFill style={{ background: INK, fontFamily: body.fontFamily }}>
    <Series>
      <Series.Sequence durationInFrames={75}><SceneHook /></Series.Sequence>
      <Series.Sequence durationInFrames={51}><SceneLabel /></Series.Sequence>
      <Series.Sequence durationInFrames={90}><SceneBenefits /></Series.Sequence>
      <Series.Sequence durationInFrames={60}><SceneTrust /></Series.Sequence>
      <Series.Sequence durationInFrames={144}>
        <CTAScene headline={"Get yours now\nbefore it sells out"} button="Shop Now →" sub="Limited stock · Free US Shipping" />
      </Series.Sequence>
    </Series>
    <Audio src={staticFile("audio/litterbox-vo-direct.mp3")} startFrom={0} volume={1} />
  </AbsoluteFill>
);