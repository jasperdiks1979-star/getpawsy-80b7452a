import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const titleY = interpolate(spring({ frame: frame - 20, fps, config: { damping: 20 } }), [0, 1], [60, 0]);
  const titleOpacity = interpolate(frame, [20, 45], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const subtitleOpacity = interpolate(frame, [45, 70], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const badgeScale = spring({ frame: frame - 60, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Decorative circles */}
      <div style={{
        position: "absolute", width: 400, height: 400, borderRadius: "50%",
        border: "1px solid rgba(232, 121, 59, 0.15)",
        top: "50%", left: "50%", transform: `translate(-50%, -50%) scale(${logoScale * 1.8})`,
        opacity: 0.3,
      }} />
      <div style={{
        position: "absolute", width: 600, height: 600, borderRadius: "50%",
        border: "1px solid rgba(232, 121, 59, 0.08)",
        top: "50%", left: "50%", transform: `translate(-50%, -50%) scale(${logoScale * 1.5})`,
        opacity: 0.2,
      }} />

      {/* Logo / Brand */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 30,
        transform: `scale(${logoScale})`,
      }}>
        {/* Paw icon */}
        <div style={{
          width: 100, height: 100, borderRadius: 24,
          background: "linear-gradient(135deg, #E8793B, #D4602A)",
          display: "flex", justifyContent: "center", alignItems: "center",
          fontSize: 50, boxShadow: "0 20px 60px rgba(232, 121, 59, 0.4)",
        }}>
          🐾
        </div>

        <div style={{
          fontFamily: poppinsFont, fontSize: 72, fontWeight: 800,
          color: "white", letterSpacing: -2,
          transform: `translateY(${titleY}px)`, opacity: titleOpacity,
        }}>
          GetPawsy
        </div>

        <div style={{
          fontFamily: interFont, fontSize: 28, fontWeight: 400,
          color: "rgba(255,255,255,0.6)", opacity: subtitleOpacity,
          letterSpacing: 4, textTransform: "uppercase",
        }}>
          Pinterest API Integration Demo
        </div>

        <div style={{
          fontFamily: interFont, fontSize: 20, fontWeight: 600,
          color: "#E8793B", background: "rgba(232, 121, 59, 0.12)",
          padding: "10px 28px", borderRadius: 30,
          border: "1px solid rgba(232, 121, 59, 0.3)",
          transform: `scale(${badgeScale})`,
        }}>
          Standard Access Application
        </div>
      </div>
    </AbsoluteFill>
  );
};
