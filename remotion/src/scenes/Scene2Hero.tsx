import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "600"], subsets: ["latin"] });

interface SpecProps {
  label: string;
  value: string;
  delay: number;
  side: "left" | "right";
  y: number;
}

const SpecCallout: React.FC<SpecProps> = ({ label, value, delay, side, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 30, stiffness: 100 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const x = interpolate(enter, [0, 1], [side === "left" ? -60 : 60, 0]);
  const isLeft = side === "left";

  return (
    <div
      style={{
        position: "absolute",
        top: y,
        [isLeft ? "left" : "right"]: 80,
        opacity,
        transform: `translateX(${x}px)`,
        textAlign: isLeft ? "left" : "right",
        fontFamily: body.fontFamily,
      }}
    >
      <div
        style={{
          fontSize: 22,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: "#d97435",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 42,
          fontWeight: 300,
          color: "#1a1a1a",
          lineHeight: 1.1,
          maxWidth: 380,
        }}
      >
        {value}
      </div>
      {/* Connector line */}
      <div
        style={{
          marginTop: 14,
          [isLeft ? "marginLeft" : "marginRight"]: 0,
          height: 1,
          width: 80,
          background: "#d97435",
          marginLeft: isLeft ? 0 : "auto",
        }}
      />
    </div>
  );
};

// SCENE 2 — Hero hold with luxury spec callouts. Slow zoom on product.
export const Scene2Hero: React.FC = () => {
  const frame = useCurrentFrame();

  // Continuous slow zoom (Ken Burns)
  const zoom = interpolate(frame, [0, 120], [1, 1.08]);
  const drift = Math.sin(frame * 0.03) * 8;

  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily }}>
      {/* Product image */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${zoom}) translateY(${drift}px)`,
          transformOrigin: "center 60%",
        }}
      >
        <Img
          src={staticFile("litter-box/hero.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.12))",
          }}
        />
      </div>

      {/* Spec callouts — placed to avoid the cat's face which sits roughly center-left at y~900-1300 */}
      <SpecCallout label="01" value="Self-cleaning automation" delay={5} side="left" y={220} />
      <SpecCallout label="02" value="Real-time app control" delay={20} side="right" y={400} />
      <SpecCallout label="03" value="Sealed odor protection" delay={35} side="left" y={1500} />

      {/* Brand mark bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: display.fontFamily,
          fontStyle: "italic",
          fontSize: 32,
          color: "#1a1a1a",
          opacity: interpolate(frame, [50, 80], [0, 0.7], { extrapolateRight: "clamp" }),
        }}
      >
        designed for the modern home
      </div>
    </AbsoluteFill>
  );
};
