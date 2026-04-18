import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] });

// SCENE 5 — Warm, emotional close. Soft product silhouette + price + warm CTA.
export const Scene5CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const productEnter = spring({ frame: frame - 0, fps, config: { damping: 30, stiffness: 90 } });
  const productOpacity = interpolate(productEnter, [0, 1], [0, 1]);
  const productScale = interpolate(productEnter, [0, 1], [1.1, 1]);

  const headEnter = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const priceEnter = spring({ frame: frame - 24, fps, config: { damping: 18, stiffness: 130 } });
  const oldPriceEnter = spring({ frame: frame - 38, fps, config: { damping: 200 } });
  const ctaEnter = spring({ frame: frame - 55, fps, config: { damping: 14, stiffness: 130 } });
  const urlEnter = spring({ frame: frame - 72, fps, config: { damping: 200 } });

  const ctaScale = interpolate(ctaEnter, [0, 1], [0.85, 1]);
  const pulse = 1 + Math.sin(frame * 0.16) * 0.018;

  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily }}>
      {/* Product softly faded in background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: productOpacity * 0.5,
          transform: `scale(${productScale})`,
        }}
      >
        <Img
          src={staticFile("litter-box/hero.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            filter: "blur(2px) saturate(0.85)",
          }}
        />
      </div>

      {/* Warm cream wash */}
      <AbsoluteFill style={{ background: "rgba(247, 240, 226, 0.62)" }} />

      {/* Top eyebrow */}
      <div
        style={{
          position: "absolute",
          top: 220,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: headEnter,
          transform: `translateY(${interpolate(headEnter, [0, 1], [20, 0])}px)`,
        }}
      >
        <div
          style={{
            fontSize: 26,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "#8b6f47",
            fontWeight: 400,
            marginBottom: 30,
          }}
        >
          ⸺  give yourself this  ⸺
        </div>
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 88,
            color: "#1a1a1a",
            fontStyle: "italic",
            lineHeight: 1.02,
            padding: "0 60px",
          }}
        >
          more cuddles.<br />
          <span style={{ color: "#d97435" }}>less mess.</span>
        </div>
      </div>

      {/* Price block */}
      <div
        style={{
          position: "absolute",
          top: 870,
          left: 0,
          right: 0,
          textAlign: "center",
        }}
      >
        {/* Old price */}
        <div
          style={{
            opacity: oldPriceEnter,
            transform: `translateY(${interpolate(oldPriceEnter, [0, 1], [10, 0])}px)`,
          }}
        >
          <span
            style={{
              fontFamily: display.fontFamily,
              fontSize: 50,
              color: "#999",
              fontWeight: 400,
              textDecoration: "line-through",
              textDecorationColor: "#d97435",
              textDecorationThickness: "3px",
            }}
          >
            $345.99
          </span>
        </div>

        {/* New price */}
        <div
          style={{
            marginTop: 20,
            opacity: priceEnter,
            transform: `scale(${interpolate(priceEnter, [0, 1], [0.7, 1])})`,
          }}
        >
          <span
            style={{
              fontFamily: display.fontFamily,
              fontSize: 168,
              color: "#d97435",
              fontWeight: 500,
              fontStyle: "italic",
              lineHeight: 1,
            }}
          >
            $268
          </span>
          <span
            style={{
              fontFamily: display.fontFamily,
              fontSize: 64,
              color: "#d97435",
              fontWeight: 400,
              verticalAlign: "top",
              marginLeft: 4,
            }}
          >
            .99
          </span>
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#b85a1f",
            fontWeight: 600,
          }}
        >
          save 22% · today only
        </div>
      </div>

      {/* CTA */}
      <div
        style={{
          position: "absolute",
          bottom: 280,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: ctaEnter,
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "#1a1a1a",
            color: "#fdfaf3",
            padding: "34px 78px",
            borderRadius: 100,
            fontSize: 40,
            fontWeight: 500,
            letterSpacing: 3,
            textTransform: "lowercase",
            transform: `scale(${ctaScale * pulse})`,
            boxShadow: "0 24px 60px rgba(217,116,53,0.35)",
          }}
        >
          bring peace home →
        </div>
      </div>

      {/* URL */}
      <div
        style={{
          position: "absolute",
          bottom: 180,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 26,
          letterSpacing: 8,
          textTransform: "uppercase",
          color: "#1a1a1a",
          fontWeight: 500,
          opacity: interpolate(urlEnter, [0, 1], [0, 0.85]),
          transform: `translateY(${interpolate(urlEnter, [0, 1], [10, 0])}px)`,
        }}
      >
        getpawsy.pet
      </div>
    </AbsoluteFill>
  );
};
