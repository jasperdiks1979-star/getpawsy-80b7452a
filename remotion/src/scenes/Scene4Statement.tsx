import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "600"], subsets: ["latin"] });

// SCENE 4 — Editorial emotional moment. Reclaim your weekends.
// Warmer copy, less "flex" — focus on what the owner gets back.
export const Scene4Statement: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const line1 = spring({ frame: frame - 5, fps, config: { damping: 30, stiffness: 100 } });
  const headEnter = spring({ frame: frame - 22, fps, config: { damping: 22, stiffness: 110 } });
  const subEnter = spring({ frame: frame - 50, fps, config: { damping: 30, stiffness: 100 } });
  const sigEnter = spring({ frame: frame - 75, fps, config: { damping: 30 } });

  const drift = Math.sin(frame * 0.04) * 4;

  return (
    <AbsoluteFill
      style={{
        fontFamily: body.fontFamily,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 80px",
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          fontSize: 28,
          letterSpacing: 8,
          textTransform: "uppercase",
          color: "#8b6f47",
          opacity: line1,
          transform: `translateY(${interpolate(line1, [0, 1], [20, 0])}px)`,
          marginBottom: 80,
        }}
      >
        ⸺  what you get back  ⸺
      </div>

      {/* Hero line — emotional */}
      <div
        style={{
          fontFamily: display.fontFamily,
          fontSize: 138,
          fontWeight: 400,
          color: "#1a1a1a",
          fontStyle: "italic",
          textAlign: "center",
          lineHeight: 0.98,
          opacity: headEnter,
          transform: `translateY(${interpolate(headEnter, [0, 1], [40, 0])}px) translateY(${drift}px)`,
        }}
      >
        your sundays.
        <br />
        <span style={{ color: "#d97435" }}>your peace.</span>
        <br />
        your home.
      </div>

      {/* Soft sub */}
      <div
        style={{
          fontFamily: display.fontFamily,
          fontSize: 56,
          color: "#5a4a38",
          fontStyle: "italic",
          textAlign: "center",
          marginTop: 80,
          opacity: interpolate(subEnter, [0, 1], [0, 0.95]),
          transform: `translateY(${interpolate(subEnter, [0, 1], [20, 0])}px)`,
          lineHeight: 1.15,
        }}
      >
        no more scooping.
        <br />
        just more love.
      </div>

      {/* Tiny line */}
      <div
        style={{
          fontSize: 22,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: "#8b6f47",
          marginTop: 90,
          opacity: interpolate(sigEnter, [0, 1], [0, 0.7]),
          transform: `translateY(${interpolate(sigEnter, [0, 1], [10, 0])}px)`,
        }}
      >
        the way it should be
      </div>
    </AbsoluteFill>
  );
};
