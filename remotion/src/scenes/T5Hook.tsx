import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] });

// HOOK — "I asked a thousand pets what they really want."
// Documentary timestamp + hand-typed feel.
export const T5Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const recDot = (Math.sin(frame * 0.4) + 1) / 2;
  const stamp = spring({ frame: frame - 2, fps, config: { damping: 12, stiffness: 180 } });

  // Typewriter effect for the hook line
  const fullText = "i asked 1,000 pets...";
  const chars = Math.floor(interpolate(frame, [10, 50], [0, fullText.length], { extrapolateRight: "clamp" }));
  const visible = fullText.slice(0, chars);
  const cursor = Math.floor(frame / 8) % 2 === 0 ? "▍" : " ";

  const sub = spring({ frame: frame - 60, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily }}>
      {/* REC indicator top-left */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 70,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: mono.fontFamily,
          fontSize: 22,
          color: "#1a1a1a",
          fontWeight: 500,
          letterSpacing: 2,
          opacity: stamp,
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#d33a2c",
            opacity: 0.4 + recDot * 0.6,
            boxShadow: "0 0 10px rgba(211,58,44,0.5)",
          }}
        />
        REC · 00:00:0{Math.floor(frame / 30) % 10}
      </div>

      {/* Frame counter top-right */}
      <div
        style={{
          position: "absolute",
          top: 80,
          right: 70,
          fontFamily: mono.fontFamily,
          fontSize: 18,
          color: "#3a2a1a",
          opacity: 0.6 * stamp,
          letterSpacing: 1.5,
        }}
      >
        FILE 001 / TAPE A
      </div>

      {/* Center hook */}
      <div
        style={{
          position: "absolute",
          top: 660,
          left: 0,
          right: 0,
          textAlign: "center",
          padding: "0 60px",
        }}
      >
        <div
          style={{
            fontFamily: mono.fontFamily,
            fontSize: 56,
            color: "#1a1a1a",
            fontWeight: 500,
            lineHeight: 1.15,
            minHeight: 200,
          }}
        >
          {visible}
          <span style={{ color: "#d97435" }}>{cursor}</span>
        </div>
      </div>

      {/* Subtitle reveal */}
      <div
        style={{
          position: "absolute",
          top: 1020,
          left: 0,
          right: 0,
          textAlign: "center",
          padding: "0 80px",
          opacity: sub,
          transform: `translateY(${interpolate(sub, [0, 1], [20, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 96,
            fontStyle: "italic",
            color: "#1a1a1a",
            lineHeight: 1.0,
            fontWeight: 400,
          }}
        >
          what do you{" "}
          <span style={{ color: "#d97435" }}>really</span>
          <br />
          want?
        </div>
      </div>

      {/* Bottom film strip / source label */}
      <div
        style={{
          position: "absolute",
          bottom: 90,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: mono.fontFamily,
          fontSize: 20,
          color: "#3a2a1a",
          opacity: 0.55,
          letterSpacing: 6,
          textTransform: "uppercase",
        }}
      >
        ⸺  field study · spring 2026  ⸺
      </div>
    </AbsoluteFill>
  );
};
