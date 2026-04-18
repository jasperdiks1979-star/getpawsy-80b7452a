import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const display = loadDisplay("normal", { weights: ["400", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

// "The answers were... concerning."
export const T5Disclaimer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stamp = spring({ frame: frame - 2, fps, config: { damping: 11, stiffness: 220 } });
  const stampScale = interpolate(stamp, [0, 1], [2.4, 1]);
  const stampRot = interpolate(stamp, [0, 1], [-18, -8]);

  const sub = spring({ frame: frame - 22, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ fontFamily: mono.fontFamily, justifyContent: "center", alignItems: "center" }}>
      {/* Big stamped word */}
      <div style={{ position: "relative", textAlign: "center", padding: "0 60px" }}>
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 200,
            color: "#a93226",
            fontStyle: "italic",
            fontWeight: 700,
            lineHeight: 0.95,
            transform: `scale(${stampScale}) rotate(${stampRot}deg)`,
            opacity: Math.min(stamp * 1.2, 0.92),
            letterSpacing: -4,
            textShadow: "0 0 1px rgba(169,50,38,0.4)",
          }}
        >
          concerning.
        </div>
        {/* Stamp border */}
        <div
          style={{
            position: "absolute",
            inset: -30,
            border: "8px solid #a93226",
            borderRadius: 12,
            transform: `rotate(${stampRot}deg) scale(${stampScale})`,
            opacity: stamp * 0.5,
            pointerEvents: "none",
          }}
        />
      </div>

      <div
        style={{
          marginTop: 80,
          fontFamily: mono.fontFamily,
          fontSize: 28,
          color: "#3a2a1a",
          letterSpacing: 8,
          textTransform: "uppercase",
          opacity: sub * 0.85,
        }}
      >
        — official findings —
      </div>
    </AbsoluteFill>
  );
};
