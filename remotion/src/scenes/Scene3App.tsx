import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400", "500"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] });

// Counter that animates 0 → target over `frames` frames, starting at `delay`.
const useCounter = (target: number, delay: number, frames: number) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + frames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Easing
  const eased = 1 - Math.pow(1 - progress, 3);
  return Math.round(target * eased);
};

// SCENE 3 — App control. Faux iPhone mockup with stats counting up.
export const Scene3App: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleEnter = spring({ frame: frame - 5, fps, config: { damping: 30 } });
  const phoneEnter = spring({ frame: frame - 18, fps, config: { damping: 25, stiffness: 90 } });
  const phoneOpacity = interpolate(phoneEnter, [0, 1], [0, 1]);
  const phoneScale = interpolate(phoneEnter, [0, 1], [0.85, 1]);
  const phoneY = interpolate(phoneEnter, [0, 1], [60, 0]);

  const visits = useCounter(247, 35, 50);
  const minutes = useCounter(189, 40, 50);
  const days = useCounter(30, 45, 50);

  // Subtle phone hover
  const hover = Math.sin(frame * 0.05) * 6;

  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily }}>
      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 180,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: titleEnter,
          transform: `translateY(${interpolate(titleEnter, [0, 1], [20, 0])}px)`,
        }}
      >
        <div
          style={{
            fontSize: 26,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#d97435",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          control · in your pocket
        </div>
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 78,
            fontWeight: 400,
            color: "#1a1a1a",
            fontStyle: "italic",
            lineHeight: 1,
          }}
        >
          everything, monitored.
        </div>
      </div>

      {/* iPhone mockup */}
      <div
        style={{
          position: "absolute",
          top: 540,
          left: "50%",
          marginLeft: -260,
          width: 520,
          height: 1080,
          opacity: phoneOpacity,
          transform: `translateY(${phoneY + hover}px) scale(${phoneScale})`,
        }}
      >
        {/* Phone bezel */}
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#0a0a0a",
            borderRadius: 64,
            padding: 14,
            boxShadow: "0 30px 80px rgba(0,0,0,0.25), 0 10px 30px rgba(0,0,0,0.15)",
          }}
        >
          {/* Screen */}
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "linear-gradient(180deg, #fafaf7 0%, #f5f0e8 100%)",
              borderRadius: 50,
              padding: 50,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Notch */}
            <div
              style={{
                position: "absolute",
                top: 18,
                left: "50%",
                marginLeft: -55,
                width: 110,
                height: 32,
                background: "#0a0a0a",
                borderRadius: 16,
              }}
            />
            {/* Status bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 18,
                color: "#1a1a1a",
                fontWeight: 600,
                marginBottom: 60,
              }}
            >
              <span>9:41</span>
              <span>● ● ●</span>
            </div>

            {/* App header */}
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ fontSize: 18, color: "#999", letterSpacing: 2, textTransform: "uppercase" }}>
                Smart Litter Box
              </div>
              <div
                style={{
                  fontFamily: display.fontFamily,
                  fontSize: 40,
                  color: "#1a1a1a",
                  marginTop: 8,
                  fontStyle: "italic",
                }}
              >
                Live
              </div>
            </div>

            {/* Status orb */}
            <div
              style={{
                width: 180,
                height: 180,
                borderRadius: "50%",
                background: "radial-gradient(circle, #d97435 0%, #b85a1f 100%)",
                margin: "0 auto 32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 ${30 + Math.sin(frame * 0.1) * 10}px rgba(217,116,53,0.4)`,
              }}
            >
              <div style={{ color: "white", fontSize: 18, letterSpacing: 3, textTransform: "uppercase" }}>
                Active
              </div>
            </div>

            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 12 }}>
              <StatTile label="Visits" value={visits} />
              <StatTile label="Minutes" value={minutes} />
              <StatTile label="Days clean" value={days} />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const StatTile: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div
    style={{
      flex: 1,
      background: "white",
      borderRadius: 18,
      padding: "22px 12px",
      textAlign: "center",
      boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
    }}
  >
    <div
      style={{
        fontFamily: "Playfair Display",
        fontSize: 44,
        fontWeight: 500,
        color: "#1a1a1a",
        lineHeight: 1,
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 13,
        color: "#999",
        textTransform: "uppercase",
        letterSpacing: 1.5,
        marginTop: 6,
      }}
    >
      {label}
    </div>
  </div>
);
