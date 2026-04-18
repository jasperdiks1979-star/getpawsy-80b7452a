import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] });

// SCENE 1 — Editorial hook. Gentle reveal of the promise.
export const BSScene1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eyebrow = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const title1 = spring({ frame: frame - 14, fps, config: { damping: 26, stiffness: 90 } });
  const title2 = spring({ frame: frame - 32, fps, config: { damping: 26, stiffness: 90 } });
  const rule = interpolate(frame, [50, 80], [0, 1], { extrapolateRight: "clamp" });
  const sub = spring({ frame: frame - 60, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily, justifyContent: "center", alignItems: "center" }}>
      <div style={{ textAlign: "center", padding: "0 80px" }}>
        <div
          style={{
            fontSize: 26,
            letterSpacing: 10,
            textTransform: "uppercase",
            color: "#8b6f47",
            fontWeight: 500,
            opacity: eyebrow,
            transform: `translateY(${interpolate(eyebrow, [0, 1], [12, 0])}px)`,
            marginBottom: 60,
          }}
        >
          ⸺  the getpawsy edit  ⸺
        </div>

        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 132,
            color: "#1a1a1a",
            lineHeight: 0.98,
            fontWeight: 400,
            opacity: title1,
            transform: `translateY(${interpolate(title1, [0, 1], [40, 0])}px)`,
          }}
        >
          four little
        </div>
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 132,
            color: "#d97435",
            fontStyle: "italic",
            lineHeight: 0.98,
            fontWeight: 400,
            opacity: title2,
            transform: `translateY(${interpolate(title2, [0, 1], [40, 0])}px)`,
          }}
        >
          things…
        </div>

        <div
          style={{
            margin: "70px auto 0",
            height: 1,
            width: 200 * rule,
            background: "#d97435",
          }}
        />

        <div
          style={{
            marginTop: 50,
            fontSize: 38,
            color: "#1a1a1a",
            fontWeight: 300,
            opacity: sub * 0.9,
            transform: `translateY(${interpolate(sub, [0, 1], [10, 0])}px)`,
            letterSpacing: 1,
          }}
        >
          that change everything.
        </div>
      </div>
    </AbsoluteFill>
  );
};
