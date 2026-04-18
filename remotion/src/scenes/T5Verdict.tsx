import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const display = loadDisplay("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

// "The pets have spoken."
export const T5Verdict: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eyebrow = spring({ frame: frame - 2, fps, config: { damping: 200 } });
  const word1 = spring({ frame: frame - 8, fps, config: { damping: 16, stiffness: 120 } });
  const word2 = spring({ frame: frame - 22, fps, config: { damping: 16, stiffness: 120 } });
  const word3 = spring({ frame: frame - 36, fps, config: { damping: 16, stiffness: 120 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ textAlign: "center", padding: "0 60px" }}>
        <div
          style={{
            fontFamily: mono.fontFamily,
            fontSize: 26,
            color: "#3a2a1a",
            letterSpacing: 10,
            textTransform: "uppercase",
            fontWeight: 500,
            opacity: eyebrow * 0.85,
            marginBottom: 60,
          }}
        >
          ⸺ verdict ⸺
        </div>
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 156,
            color: "#1a1a1a",
            lineHeight: 0.98,
            fontWeight: 500,
          }}
        >
          <span
            style={{
              display: "inline-block",
              opacity: word1,
              transform: `translateY(${interpolate(word1, [0, 1], [40, 0])}px)`,
            }}
          >
            the pets
          </span>{" "}
          <span
            style={{
              display: "inline-block",
              opacity: word2,
              transform: `translateY(${interpolate(word2, [0, 1], [40, 0])}px)`,
            }}
          >
            have
          </span>
          <br />
          <span
            style={{
              display: "inline-block",
              fontStyle: "italic",
              color: "#c2410c",
              opacity: word3,
              transform: `translateY(${interpolate(word3, [0, 1], [40, 0])}px) scale(${interpolate(word3, [0, 1], [0.85, 1])})`,
              transformOrigin: "center",
            }}
          >
            spoken.
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
