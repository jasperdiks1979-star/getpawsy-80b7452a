import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const titleOp = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const subtitleOp = interpolate(frame, [35, 55], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const badgeOp = interpolate(frame, [55, 75], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <div style={{
          width: 90, height: 90, borderRadius: 22,
          background: "linear-gradient(135deg, #E8793B, #D4602A)",
          display: "flex", justifyContent: "center", alignItems: "center",
          fontSize: 44, boxShadow: "0 16px 48px rgba(232, 121, 59, 0.35)",
          transform: `scale(${logoScale})`,
        }}>
          🐾
        </div>

        <div style={{
          fontFamily: poppinsFont, fontSize: 64, fontWeight: 800,
          color: "white", letterSpacing: -2, opacity: titleOp,
        }}>
          Pawsy Dashboard
        </div>

        <div style={{
          fontFamily: interFont, fontSize: 24, color: "rgba(255,255,255,0.55)",
          opacity: subtitleOp, letterSpacing: 2, textTransform: "uppercase",
        }}>
          Pinterest Integration Demo
        </div>

        <div style={{
          fontFamily: interFont, fontSize: 16, color: "rgba(255,255,255,0.7)",
          background: "rgba(255,255,255,0.06)", padding: "10px 24px", borderRadius: 30,
          border: "1px solid rgba(255,255,255,0.1)", opacity: badgeOp, marginTop: 8,
        }}>
          Automated pin creation, scheduling & publishing for pet products
        </div>
      </div>
    </AbsoluteFill>
  );
};
