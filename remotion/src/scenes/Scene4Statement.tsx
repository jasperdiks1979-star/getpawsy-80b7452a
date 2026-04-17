import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "600"], subsets: ["latin"] });

// SCENE 4 — Editorial statement. Big numbers slam in. Days-without-scooping flex.
export const Scene4Statement: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Ascending lines stagger in
  const line1 = spring({ frame: frame - 5, fps, config: { damping: 30, stiffness: 100 } });
  const numEnter = spring({ frame: frame - 22, fps, config: { damping: 20, stiffness: 130 } });
  const line2 = spring({ frame: frame - 50, fps, config: { damping: 30, stiffness: 100 } });
  const sigEnter = spring({ frame: frame - 75, fps, config: { damping: 30 } });

  // The "30" number scales in dramatically then settles
  const numScale = interpolate(numEnter, [0, 1], [0.4, 1]);
  // Subtle continuous drift
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
      {/* Top line */}
      <div
        style={{
          fontSize: 30,
          letterSpacing: 8,
          textTransform: "uppercase",
          color: "#8b6f47",
          opacity: line1,
          transform: `translateY(${interpolate(line1, [0, 1], [20, 0])}px)`,
          marginBottom: 60,
        }}
      >
        ⸺  the result  ⸺
      </div>

      {/* Massive number */}
      <div
        style={{
          position: "relative",
          opacity: numEnter,
          transform: `scale(${numScale}) translateY(${drift}px)`,
        }}
      >
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 560,
            fontWeight: 500,
            lineHeight: 0.85,
            color: "#d97435",
            fontStyle: "italic",
            textAlign: "center",
            letterSpacing: -20,
          }}
        >
          30
        </div>
        <div
          style={{
            fontSize: 38,
            letterSpacing: 12,
            textTransform: "uppercase",
            color: "#1a1a1a",
            textAlign: "center",
            marginTop: 20,
            fontWeight: 400,
          }}
        >
          days
        </div>
      </div>

      {/* Bottom line */}
      <div
        style={{
          fontFamily: display.fontFamily,
          fontSize: 78,
          color: "#1a1a1a",
          fontStyle: "italic",
          textAlign: "center",
          marginTop: 80,
          opacity: line2,
          transform: `translateY(${interpolate(line2, [0, 1], [30, 0])}px)`,
          lineHeight: 1.1,
        }}
      >
        without scooping.
      </div>

      {/* Tiny disclaimer / signature line */}
      <div
        style={{
          fontSize: 22,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: "#8b6f47",
          marginTop: 120,
          opacity: interpolate(sigEnter, [0, 1], [0, 0.7]),
          transform: `translateY(${interpolate(sigEnter, [0, 1], [10, 0])}px)`,
        }}
      >
        based on average cleaning cycle
      </div>
    </AbsoluteFill>
  );
};
