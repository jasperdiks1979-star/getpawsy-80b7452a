import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "500"], subsets: ["latin"] });

// SCENE 1 — Editorial reveal. Tiny eyebrow text, then massive serif statement,
// product subtly drifts in from below the frame. Apple-style breathing space.
export const Scene1Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eyebrowIn = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const eyebrowOpacity = interpolate(eyebrowIn, [0, 1], [0, 1]);
  const eyebrowY = interpolate(eyebrowIn, [0, 1], [20, 0]);

  // Stagger the title words: "the litter box," / "reimagined."
  const word1 = spring({ frame: frame - 18, fps, config: { damping: 30, stiffness: 120 } });
  const word2 = spring({ frame: frame - 32, fps, config: { damping: 30, stiffness: 120 } });

  // Product image drifts up slowly from below
  const productProgress = interpolate(frame, [20, 90], [0, 1], { extrapolateRight: "clamp" });
  const productY = interpolate(productProgress, [0, 1], [400, 60]);
  const productOpacity = interpolate(frame, [25, 60], [0, 1], { extrapolateRight: "clamp" });
  const productScale = interpolate(productProgress, [0, 1], [0.92, 1]);

  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily }}>
      {/* Eyebrow */}
      <div
        style={{
          position: "absolute",
          top: 180,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: eyebrowOpacity,
          transform: `translateY(${eyebrowY}px)`,
        }}
      >
        <span
          style={{
            fontSize: 28,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "#8b6f47",
            fontWeight: 400,
          }}
        >
          ⸺  GetPawsy  ⸺
        </span>
      </div>

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 280,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: display.fontFamily,
          color: "#1a1a1a",
        }}
      >
        <div
          style={{
            fontSize: 92,
            lineHeight: 1.05,
            fontWeight: 400,
            opacity: word1,
            transform: `translateY(${interpolate(word1, [0, 1], [40, 0])}px)`,
            fontStyle: "italic",
          }}
        >
          the litter box,
        </div>
        <div
          style={{
            fontSize: 124,
            lineHeight: 1.05,
            fontWeight: 500,
            marginTop: 12,
            opacity: word2,
            transform: `translateY(${interpolate(word2, [0, 1], [40, 0])}px)`,
            color: "#d97435",
            fontStyle: "italic",
          }}
        >
          reimagined.
        </div>
      </div>

      {/* Product reveal from below */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 1100,
          opacity: productOpacity,
          transform: `translateY(${productY}px) scale(${productScale})`,
          transformOrigin: "center bottom",
        }}
      >
        <Img
          src={staticFile("litter-box/hero.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center bottom",
            filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.15))",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
