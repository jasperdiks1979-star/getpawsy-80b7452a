import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] });

// FINAL CTA — warm, emotional close inviting a webshop visit.
export const BSSceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eyebrow = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const head1 = spring({ frame: frame - 14, fps, config: { damping: 28, stiffness: 95 } });
  const head2 = spring({ frame: frame - 30, fps, config: { damping: 28, stiffness: 95 } });
  const trust = spring({ frame: frame - 52, fps, config: { damping: 200 } });
  const cta = spring({ frame: frame - 70, fps, config: { damping: 14, stiffness: 130 } });
  const url = spring({ frame: frame - 92, fps, config: { damping: 200 } });

  const ctaScale = interpolate(cta, [0, 1], [0.85, 1]);
  const pulse = 1 + Math.sin(frame * 0.16) * 0.018;

  // Soft floating stars/dots
  const dotOpacity = interpolate(frame, [0, 30], [0, 0.5], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily }}>
      {/* Floating warm dots in background */}
      {[
        { x: 140, y: 320, s: 8 },
        { x: 920, y: 240, s: 6 },
        { x: 280, y: 1620, s: 10 },
        { x: 860, y: 1780, s: 7 },
        { x: 540, y: 1540, s: 5 },
      ].map((d, i) => {
        const float = Math.sin((frame + i * 20) * 0.04) * 8;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: d.x,
              top: d.y + float,
              width: d.s,
              height: d.s,
              borderRadius: "50%",
              background: "#d97435",
              opacity: dotOpacity * 0.6,
            }}
          />
        );
      })}

      {/* Eyebrow */}
      <div
        style={{
          position: "absolute",
          top: 320,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: eyebrow,
          transform: `translateY(${interpolate(eyebrow, [0, 1], [12, 0])}px)`,
        }}
      >
        <div
          style={{
            fontSize: 26,
            letterSpacing: 10,
            textTransform: "uppercase",
            color: "#8b6f47",
            fontWeight: 500,
          }}
        >
          ⸺  thousands of happy homes  ⸺
        </div>
      </div>

      {/* Headline */}
      <div
        style={{
          position: "absolute",
          top: 470,
          left: 0,
          right: 0,
          textAlign: "center",
          padding: "0 60px",
        }}
      >
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 122,
            color: "#1a1a1a",
            fontWeight: 400,
            lineHeight: 1.0,
            opacity: head1,
            transform: `translateY(${interpolate(head1, [0, 1], [30, 0])}px)`,
          }}
        >
          come see
        </div>
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 122,
            color: "#d97435",
            fontStyle: "italic",
            fontWeight: 400,
            lineHeight: 1.0,
            marginTop: 8,
            opacity: head2,
            transform: `translateY(${interpolate(head2, [0, 1], [30, 0])}px)`,
          }}
        >
          what's loved.
        </div>
      </div>

      {/* Trust row */}
      <div
        style={{
          position: "absolute",
          top: 1020,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: trust,
          transform: `translateY(${interpolate(trust, [0, 1], [10, 0])}px)`,
        }}
      >
        <div
          style={{
            fontSize: 32,
            color: "#1a1a1a",
            fontWeight: 300,
            letterSpacing: 1,
          }}
        >
          curated · trusted · shipped from the U.S.
        </div>
        <div style={{ marginTop: 18, fontSize: 30, color: "#d97435", letterSpacing: 6 }}>
          ★ ★ ★ ★ ★
        </div>
      </div>

      {/* CTA pill */}
      <div
        style={{
          position: "absolute",
          bottom: 360,
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
            padding: "36px 84px",
            borderRadius: 100,
            fontSize: 44,
            fontWeight: 500,
            letterSpacing: 3,
            textTransform: "lowercase",
            transform: `scale(${ctaScale * pulse})`,
            boxShadow: "0 24px 60px rgba(217,116,53,0.35)",
          }}
        >
          shop the bestsellers →
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
          fontSize: 32,
          letterSpacing: 10,
          textTransform: "uppercase",
          color: "#1a1a1a",
          fontWeight: 600,
          opacity: interpolate(url, [0, 1], [0, 0.9]),
          transform: `translateY(${interpolate(url, [0, 1], [10, 0])}px)`,
        }}
      >
        getpawsy.pet
      </div>
    </AbsoluteFill>
  );
};
