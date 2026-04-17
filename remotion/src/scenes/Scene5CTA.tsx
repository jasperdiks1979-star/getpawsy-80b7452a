import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] });

// SCENE 5 — Conversion close. Product silhouette + price reveal + CTA.
export const Scene5CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const productEnter = spring({ frame: frame - 0, fps, config: { damping: 30, stiffness: 90 } });
  const productOpacity = interpolate(productEnter, [0, 1], [0, 1]);
  const productScale = interpolate(productEnter, [0, 1], [1.1, 1]);

  const oldPriceEnter = spring({ frame: frame - 12, fps, config: { damping: 30 } });
  const newPriceEnter = spring({ frame: frame - 20, fps, config: { damping: 18, stiffness: 130 } });
  const newPriceScale = interpolate(newPriceEnter, [0, 1], [0.7, 1]);

  // Strikethrough draws across old price
  const strikeProgress = interpolate(frame, [25, 38], [0, 1], { extrapolateRight: "clamp" });

  const ctaEnter = spring({ frame: frame - 38, fps, config: { damping: 30 } });
  const ctaOpacity = interpolate(ctaEnter, [0, 1], [0, 1]);
  const ctaY = interpolate(ctaEnter, [0, 1], [30, 0]);

  // CTA pulse
  const pulse = 1 + Math.sin(frame * 0.18) * 0.02;

  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily }}>
      {/* Product softly faded in background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: productOpacity * 0.55,
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

      {/* Cream wash overlay */}
      <AbsoluteFill style={{ background: "rgba(247, 242, 232, 0.55)" }} />

      {/* Content */}
      <div
        style={{
          position: "absolute",
          top: 280,
          left: 0,
          right: 0,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "#8b6f47",
            fontWeight: 400,
            marginBottom: 30,
          }}
        >
          ⸺  limited launch  ⸺
        </div>
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 76,
            color: "#1a1a1a",
            fontStyle: "italic",
            lineHeight: 1.05,
            padding: "0 80px",
          }}
        >
          your home,<br />unbothered.
        </div>
      </div>

      {/* Price block */}
      <div
        style={{
          position: "absolute",
          top: 850,
          left: 0,
          right: 0,
          textAlign: "center",
        }}
      >
        {/* Old price with animated strikethrough */}
        <div
          style={{
            display: "inline-block",
            position: "relative",
            opacity: oldPriceEnter,
            transform: `translateY(${interpolate(oldPriceEnter, [0, 1], [10, 0])}px)`,
          }}
        >
          <span
            style={{
              fontFamily: display.fontFamily,
              fontSize: 56,
              color: "#999",
              fontWeight: 400,
            }}
          >
            $345.99
          </span>
          {/* Strike line */}
          <div
            style={{
              position: "absolute",
              top: "55%",
              left: 0,
              height: 3,
              width: `${strikeProgress * 100}%`,
              background: "#d97435",
              transformOrigin: "left center",
            }}
          />
        </div>

        {/* New price */}
        <div
          style={{
            marginTop: 24,
            opacity: newPriceEnter,
            transform: `scale(${newPriceScale})`,
          }}
        >
          <span
            style={{
              fontFamily: display.fontFamily,
              fontSize: 156,
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
      </div>

      {/* CTA */}
      <div
        style={{
          position: "absolute",
          bottom: 240,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: ctaOpacity,
          transform: `translateY(${ctaY}px)`,
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "#1a1a1a",
            color: "#fafaf7",
            padding: "32px 80px",
            borderRadius: 100,
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: 2,
            transform: `scale(${pulse})`,
            boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
          }}
        >
          shop · GetPawsy.pet
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#1a1a1a",
            opacity: 0.7,
          }}
        >
          free us shipping  ·  link in bio
        </div>
      </div>
    </AbsoluteFill>
  );
};
