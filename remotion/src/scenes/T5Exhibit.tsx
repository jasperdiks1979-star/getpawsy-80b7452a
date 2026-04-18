import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] });

interface Props {
  rank: string;          // "05"
  exhibit: string;       // "E"
  productName: string;
  quote: string;         // "the floor is hot, Brian."
  price: string;
  imageSrc: string;
  isWinner?: boolean;
}

// EXHIBIT SCENE — looks like a documentary evidence card.
export const T5Exhibit: React.FC<Props> = ({
  rank,
  exhibit,
  productName,
  quote,
  price,
  imageSrc,
  isWinner = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Top exhibit label slams in
  const labelEnter = spring({ frame: frame - 0, fps, config: { damping: 11, stiffness: 220 } });
  const labelScale = interpolate(labelEnter, [0, 1], [1.6, 1]);
  const labelRot = interpolate(labelEnter, [0, 1], [-4, 0]);

  // Number reveal — huge ranking
  const numEnter = spring({ frame: frame - 8, fps, config: { damping: 14, stiffness: 140 } });

  // Image slides up + ken burns
  const imgEnter = spring({ frame: frame - 14, fps, config: { damping: 26, stiffness: 90 } });
  const imgY = interpolate(imgEnter, [0, 1], [60, 0]);
  const imgScale = interpolate(frame, [14, 180], [1.0, 1.08]);
  const drift = Math.sin(frame * 0.05) * 5;

  // Product name typed/slid
  const nameEnter = spring({ frame: frame - 32, fps, config: { damping: 28, stiffness: 95 } });

  // Quote with hand-drawn underline
  const quoteEnter = spring({ frame: frame - 56, fps, config: { damping: 200 } });
  const quoteUnderline = interpolate(frame, [80, 130], [0, 1], { extrapolateRight: "clamp" });

  // Price stamp
  const priceEnter = spring({ frame: frame - 90, fps, config: { damping: 12, stiffness: 160 } });
  const priceScale = interpolate(priceEnter, [0, 1], [1.5, 1]);
  const priceRot = interpolate(priceEnter, [0, 1], [-6, -2]);

  // Winner badge
  const winnerPulse = isWinner ? 1 + Math.sin(frame * 0.18) * 0.02 : 1;

  const accent = isWinner ? "#c2410c" : "#d97435";

  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily }}>
      {/* Top: EXHIBIT label like a court doc */}
      <div
        style={{
          position: "absolute",
          top: 90,
          left: 70,
          fontFamily: mono.fontFamily,
          fontSize: 22,
          color: "#1a1a1a",
          fontWeight: 500,
          letterSpacing: 6,
          textTransform: "uppercase",
          opacity: labelEnter,
          transform: `scale(${labelScale}) rotate(${labelRot}deg)`,
          transformOrigin: "left center",
        }}
      >
        <span style={{ background: "#1a1a1a", color: "#fdfaf3", padding: "6px 14px", marginRight: 12 }}>
          exhibit {exhibit}
        </span>
        rank #{rank}
      </div>

      {/* Frame counter top-right */}
      <div
        style={{
          position: "absolute",
          top: 95,
          right: 70,
          fontFamily: mono.fontFamily,
          fontSize: 18,
          color: "#3a2a1a",
          opacity: 0.5 * labelEnter,
          letterSpacing: 1.5,
        }}
      >
        TAPE A · 00:0{rank}
      </div>

      {/* Huge editorial number, behind image */}
      <div
        style={{
          position: "absolute",
          top: 200,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: display.fontFamily,
          fontSize: 460,
          color: accent,
          opacity: 0.14 * numEnter,
          fontWeight: 700,
          fontStyle: "italic",
          lineHeight: 0.85,
          transform: `scale(${interpolate(numEnter, [0, 1], [0.7, 1])})`,
        }}
      >
        {rank}
      </div>

      {/* Centerpiece product image */}
      <div
        style={{
          position: "absolute",
          top: 380,
          left: 80,
          right: 80,
          height: 880,
          opacity: imgEnter,
          transform: `translateY(${imgY}px)`,
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
              filter: "drop-shadow(0 30px 50px rgba(40,25,10,0.18))",
            }}
          />
        </div>
      </div>

      {/* Bottom: name + quote + price */}
      <div
        style={{
          position: "absolute",
          bottom: 220,
          left: 80,
          right: 80,
        }}
      >
        {/* Product name */}
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 64,
            color: "#1a1a1a",
            fontWeight: 500,
            lineHeight: 1.05,
            opacity: nameEnter,
            transform: `translateY(${interpolate(nameEnter, [0, 1], [16, 0])}px)`,
          }}
        >
          {productName}
        </div>

        {/* Quote — looks like a transcribed witness statement */}
        <div
          style={{
            marginTop: 26,
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            opacity: quoteEnter,
            transform: `translateY(${interpolate(quoteEnter, [0, 1], [10, 0])}px)`,
          }}
        >
          <span
            style={{
              fontFamily: display.fontFamily,
              fontSize: 100,
              color: accent,
              lineHeight: 0.7,
              fontStyle: "italic",
              fontWeight: 700,
            }}
          >
            "
          </span>
          <div style={{ flex: 1, position: "relative" }}>
            <div
              style={{
                fontFamily: mono.fontFamily,
                fontSize: 36,
                color: "#1a1a1a",
                fontWeight: 400,
                lineHeight: 1.3,
                fontStyle: "italic",
              }}
            >
              {quote}
            </div>
            {/* Hand-drawn underline */}
            <svg
              width="100%"
              height="14"
              style={{ marginTop: 6 }}
              viewBox="0 0 800 14"
              preserveAspectRatio="none"
            >
              <path
                d="M 4 7 Q 200 2, 400 6 T 796 5"
                stroke={accent}
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="800"
                strokeDashoffset={interpolate(quoteUnderline, [0, 1], [800, 0])}
              />
            </svg>
            <div
              style={{
                marginTop: 10,
                fontFamily: mono.fontFamily,
                fontSize: 18,
                color: "#3a2a1a",
                opacity: quoteEnter * 0.6,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              — anonymous, verified pet
            </div>
          </div>
        </div>

        {/* Price stamp + winner */}
        <div
          style={{
            marginTop: 28,
            display: "flex",
            alignItems: "center",
            gap: 28,
            opacity: priceEnter,
          }}
        >
          <div
            style={{
              fontFamily: display.fontFamily,
              fontSize: 76,
              color: accent,
              fontStyle: "italic",
              fontWeight: 500,
              lineHeight: 1,
              transform: `scale(${priceScale}) rotate(${priceRot}deg) scale(${winnerPulse})`,
              transformOrigin: "left center",
            }}
          >
            {price}
          </div>
          {isWinner && (
            <div
              style={{
                fontFamily: mono.fontFamily,
                fontSize: 22,
                color: "#fdfaf3",
                background: accent,
                padding: "10px 20px",
                fontWeight: 600,
                letterSpacing: 4,
                textTransform: "uppercase",
                transform: `rotate(2deg) scale(${winnerPulse})`,
                boxShadow: "0 8px 20px rgba(194,65,12,0.3)",
              }}
            >
              ★ #1 most demanded
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
