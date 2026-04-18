import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] });

interface Props {
  number: string;          // "01"
  category: string;        // "litter, solved"
  productName: string;     // "Smart Self-Cleaning Litter Box"
  benefit: string;         // headline benefit
  price: string;           // "$268.99"
  imageSrc: string;        // staticFile path
  accent?: string;         // accent color override
}

// SCENE — Reusable bestseller product card with editorial typography.
export const BSProductCard: React.FC<Props> = ({
  number,
  category,
  productName,
  benefit,
  price,
  imageSrc,
  accent = "#d97435",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Number badge scales in
  const numEnter = spring({ frame: frame - 0, fps, config: { damping: 18, stiffness: 110 } });
  const numScale = interpolate(numEnter, [0, 1], [0.6, 1]);

  // Image: clip-path reveal from bottom + slow Ken Burns
  const imgReveal = spring({ frame: frame - 6, fps, config: { damping: 30, stiffness: 80 } });
  const imgClip = interpolate(imgReveal, [0, 1], [100, 0]);
  const imgScale = interpolate(frame, [10, 130], [1.04, 1.12]);
  const drift = Math.sin(frame * 0.04) * 6;

  // Category eyebrow
  const cat = spring({ frame: frame - 22, fps, config: { damping: 200 } });
  // Product name slides up
  const nameEnter = spring({ frame: frame - 32, fps, config: { damping: 28, stiffness: 95 } });
  // Benefit line
  const benefitEnter = spring({ frame: frame - 48, fps, config: { damping: 200 } });
  // Price
  const priceEnter = spring({ frame: frame - 62, fps, config: { damping: 16, stiffness: 130 } });

  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily }}>
      {/* Top: huge editorial number */}
      <div
        style={{
          position: "absolute",
          top: 90,
          left: 80,
          fontFamily: display.fontFamily,
          fontStyle: "italic",
          fontSize: 220,
          color: accent,
          opacity: 0.18,
          fontWeight: 400,
          lineHeight: 0.85,
          transform: `scale(${numScale})`,
          transformOrigin: "top left",
        }}
      >
        {number}
      </div>

      {/* Top-right small label */}
      <div
        style={{
          position: "absolute",
          top: 130,
          right: 80,
          textAlign: "right",
          opacity: cat,
          transform: `translateY(${interpolate(cat, [0, 1], [10, 0])}px)`,
        }}
      >
        <div
          style={{
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#8b6f47",
            fontWeight: 500,
            marginBottom: 6,
          }}
        >
          chapter {number}
        </div>
        <div
          style={{
            fontFamily: display.fontFamily,
            fontStyle: "italic",
            fontSize: 44,
            color: "#1a1a1a",
            fontWeight: 400,
          }}
        >
          {category}
        </div>
      </div>

      {/* Centerpiece product image */}
      <div
        style={{
          position: "absolute",
          top: 420,
          left: 60,
          right: 60,
          height: 1000,
          clipPath: `inset(0 0 ${imgClip}% 0)`,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            transform: `scale(${imgScale}) translateY(${drift}px)`,
            transformOrigin: "center center",
          }}
        >
          <Img
            src={staticFile(imageSrc)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter: "drop-shadow(0 30px 50px rgba(0,0,0,0.14))",
            }}
          />
        </div>
      </div>

      {/* Bottom: name + benefit + price */}
      <div
        style={{
          position: "absolute",
          bottom: 140,
          left: 80,
          right: 80,
        }}
      >
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 64,
            color: "#1a1a1a",
            fontWeight: 500,
            lineHeight: 1.05,
            opacity: nameEnter,
            transform: `translateY(${interpolate(nameEnter, [0, 1], [20, 0])}px)`,
          }}
        >
          {productName}
        </div>

        <div
          style={{
            marginTop: 22,
            fontSize: 30,
            color: "#4a4a4a",
            fontWeight: 300,
            lineHeight: 1.35,
            maxWidth: 820,
            opacity: benefitEnter * 0.95,
            transform: `translateY(${interpolate(benefitEnter, [0, 1], [10, 0])}px)`,
          }}
        >
          {benefit}
        </div>

        {/* Price line */}
        <div
          style={{
            marginTop: 36,
            display: "flex",
            alignItems: "baseline",
            gap: 16,
            opacity: priceEnter,
            transform: `translateY(${interpolate(priceEnter, [0, 1], [10, 0])}px)`,
          }}
        >
          <span
            style={{
              fontFamily: display.fontFamily,
              fontSize: 80,
              color: accent,
              fontStyle: "italic",
              fontWeight: 500,
              lineHeight: 1,
            }}
          >
            {price}
          </span>
          <span
            style={{
              fontSize: 22,
              letterSpacing: 5,
              textTransform: "uppercase",
              color: "#8b6f47",
              fontWeight: 600,
            }}
          >
            · loved by pet parents
          </span>
        </div>

        {/* underline rule */}
        <div
          style={{
            marginTop: 22,
            height: 2,
            width: interpolate(priceEnter, [0, 1], [0, 220]),
            background: accent,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
