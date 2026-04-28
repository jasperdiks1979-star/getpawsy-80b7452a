import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/Anton";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

export const display = loadDisplay("normal", { weights: ["400"], subsets: ["latin"] });
export const body = loadBody("normal", { weights: ["600", "700", "800", "900"], subsets: ["latin"] });

export const ORANGE = "#FF6A1A";
export const CREAM = "#FAF6F0";
export const INK = "#1A1410";
export const WHITE = "#FFFFFF";

export const IMG = (name: string) => staticFile(`images/litterbox-real/${name}`);

export const KenBurns: React.FC<{ src: string; from?: number; to?: number; pan?: "left" | "right" | "up" | "down" | "none"; bg?: string; fit?: "cover" | "contain" }> = ({
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
      <Img src={src} style={{
        width: "100%", height: "100%", objectFit: fit, objectPosition: "center",
        transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
      }} />
    </AbsoluteFill>
  );
};

export const TopText: React.FC<{ text: string; color?: string; bg?: string; size?: number; delay?: number }> = ({ text, color = INK, bg = WHITE, size = 78, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 180 } });
  const y = interpolate(s, [0, 1], [-60, 0]);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 120 }}>
      <div style={{
        fontFamily: display.fontFamily, fontSize: size, lineHeight: 0.95, color,
        background: bg, padding: "20px 28px", borderRadius: 16, transform: `translateY(${y}px)`,
        opacity: s, textAlign: "center", maxWidth: "90%", letterSpacing: -1, whiteSpace: "pre-line",
        boxShadow: "0 12px 40px rgba(0,0,0,0.18)", textTransform: "uppercase",
      }}>{text}</div>
    </AbsoluteFill>
  );
};

export const BottomText: React.FC<{ text: string; color?: string; bg?: string; size?: number; delay?: number }> = ({ text, color = WHITE, bg = ORANGE, size = 64, delay = 0 }) => {
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
        boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
      }}>{text}</div>
    </AbsoluteFill>
  );
};

export const CTAScene: React.FC<{ headline: string; button: string; sub?: string }> = ({ headline, button, sub = "Free US Shipping · 30-Day Returns" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 1 + Math.sin(frame * 0.25) * 0.04;
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  return (
    <AbsoluteFill>
      <KenBurns src={IMG("hero.jpg")} from={1.1} to={1.18} pan="none" bg={CREAM} fit="contain" />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 100%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30 }}>
        <div style={{
          fontFamily: display.fontFamily, fontSize: 92, color: WHITE, whiteSpace: "pre-line",
          textAlign: "center", textTransform: "uppercase", lineHeight: 0.95,
          textShadow: "0 4px 20px rgba(0,0,0,0.7)", opacity: s, maxWidth: "92%",
        }}>{headline}</div>
        <div style={{
          background: ORANGE, color: WHITE, padding: "26px 56px", borderRadius: 999,
          fontFamily: display.fontFamily, fontSize: 60, textTransform: "uppercase",
          transform: `scale(${pulse})`, boxShadow: "0 16px 50px rgba(255,106,26,0.6)",
          border: `4px solid ${WHITE}`, textAlign: "center",
        }}>{button}</div>
        <div style={{
          fontFamily: body.fontFamily, fontWeight: 700, fontSize: 30, color: WHITE,
          background: "rgba(0,0,0,0.55)", padding: "10px 22px", borderRadius: 8, opacity: s,
        }}>{sub}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const FeatureCard: React.FC<{ src: string; label: string; sub: string; fit?: "cover" | "contain" }> = ({ src, label, sub, fit = "contain" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16, stiffness: 160 } });
  return (
    <AbsoluteFill style={{ background: CREAM, opacity: s }}>
      <KenBurns src={src} from={1.02} to={1.1} pan="right" bg={CREAM} fit={fit} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 280 }}>
        <div style={{
          background: ORANGE, color: WHITE, padding: "20px 34px", borderRadius: 16,
          fontFamily: display.fontFamily, fontSize: 70, textTransform: "uppercase", letterSpacing: -1,
          boxShadow: "0 12px 40px rgba(255,106,26,0.5)", textAlign: "center",
          transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
        }}>{label}</div>
        <div style={{
          marginTop: 14, background: INK, color: WHITE, padding: "12px 22px", borderRadius: 10,
          fontFamily: body.fontFamily, fontWeight: 700, fontSize: 34,
        }}>{sub}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
