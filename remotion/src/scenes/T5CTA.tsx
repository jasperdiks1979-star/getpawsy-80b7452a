import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] });

// CTA — "you're welcome." → getpawsy.pet
export const T5CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eyebrow = spring({ frame: frame - 2, fps, config: { damping: 200 } });
  const head1 = spring({ frame: frame - 14, fps, config: { damping: 26, stiffness: 95 } });
  const head2 = spring({ frame: frame - 36, fps, config: { damping: 14, stiffness: 130 } });
  const cta = spring({ frame: frame - 70, fps, config: { damping: 13, stiffness: 140 } });
  const url = spring({ frame: frame - 100, fps, config: { damping: 200 } });
  const stamp = spring({ frame: frame - 130, fps, config: { damping: 11, stiffness: 200 } });

  const ctaScale = interpolate(cta, [0, 1], [0.85, 1]);
  const pulse = 1 + Math.sin(frame * 0.16) * 0.018;

  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily }}>
      {/* Eyebrow */}
      <div
        style={{
          position: "absolute",
          top: 320,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: eyebrow * 0.85,
          fontFamily: mono.fontFamily,
          fontSize: 26,
          color: "#3a2a1a",
          letterSpacing: 10,
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        ⸺ end of transmission ⸺
      </div>

      {/* Headline */}
      <div
        style={{
          position: "absolute",
          top: 480,
          left: 0,
          right: 0,
          textAlign: "center",
          padding: "0 60px",
        }}
      >
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 132,
            color: "#1a1a1a",
            fontWeight: 500,
            lineHeight: 1.0,
            opacity: head1,
            transform: `translateY(${interpolate(head1, [0, 1], [30, 0])}px)`,
          }}
        >
          you're
        </div>
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 196,
            color: "#c2410c",
            fontStyle: "italic",
            fontWeight: 700,
            lineHeight: 0.95,
            marginTop: 4,
            opacity: head2,
            transform: `translateY(${interpolate(head2, [0, 1], [40, 0])}px) scale(${interpolate(head2, [0, 1], [0.85, 1])})`,
          }}
        >
          welcome.
        </div>
      </div>

      {/* Approval stamp */}
      <div
        style={{
          position: "absolute",
          top: 1080,
          right: 90,
          fontFamily: mono.fontFamily,
          fontSize: 22,
          color: "#a93226",
          fontWeight: 600,
          letterSpacing: 4,
          textTransform: "uppercase",
          border: "4px solid #a93226",
          padding: "10px 18px",
          transform: `rotate(-12deg) scale(${interpolate(stamp, [0, 1], [2, 1])})`,
          opacity: Math.min(stamp * 1.2, 0.85),
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        approved
        <br />
        by pets
      </div>

      {/* CTA pill */}
      <div
        style={{
          position: "absolute",
          bottom: 380,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: cta,
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "#1a1a1a",
            color: "#fdfaf3",
            padding: "38px 90px",
            borderRadius: 100,
            fontSize: 46,
            fontWeight: 500,
            letterSpacing: 3,
            textTransform: "lowercase",
            transform: `scale(${ctaScale * pulse})`,
            boxShadow: "0 24px 60px rgba(194,65,12,0.35)",
            fontFamily: body.fontFamily,
          }}
        >
          shop the pets' picks →
        </div>
      </div>

      {/* URL */}
      <div
        style={{
          position: "absolute",
          bottom: 220,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 36,
          letterSpacing: 12,
          textTransform: "uppercase",
          color: "#1a1a1a",
          fontWeight: 600,
          opacity: interpolate(url, [0, 1], [0, 0.92]),
          transform: `translateY(${interpolate(url, [0, 1], [10, 0])}px)`,
          fontFamily: body.fontFamily,
        }}
      >
        getpawsy.pet
      </div>

      {/* Tape footer */}
      <div
        style={{
          position: "absolute",
          bottom: 90,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: mono.fontFamily,
          fontSize: 18,
          color: "#3a2a1a",
          opacity: 0.5 * url,
          letterSpacing: 4,
          textTransform: "uppercase",
        }}
      >
        ⸻  tape ends  ⸻
      </div>
    </AbsoluteFill>
  );
};
