import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene6Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame: frame - 5, fps, config: { damping: 14 } });
  const titleOp = interpolate(frame, [15, 30], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const listOp = (d: number) => interpolate(frame, [d, d + 10], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ fontSize: 50, transform: `scale(${logoScale})` }}>🐾</div>

        <div style={{
          fontFamily: poppinsFont, fontSize: 40, fontWeight: 800, color: "white", opacity: titleOp,
        }}>
          Pawsy Dashboard
        </div>

        <div style={{
          fontFamily: interFont, fontSize: 18, color: "rgba(255,255,255,0.45)", opacity: titleOp, marginBottom: 12,
        }}>
          Pinterest Integration Summary
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          {[
            "OAuth 2.0 authentication with secure token storage",
            "Admin dashboard for pin queue management",
            "AI-powered pin generation from product catalog",
            "Automated scheduled publishing via Pinterest API v5",
            "Rate limiting, token refresh & error logging",
          ].map((f, i) => (
            <div key={i} style={{
              fontFamily: interFont, fontSize: 16, color: "rgba(255,255,255,0.7)",
              opacity: listOp(30 + i * 6), display: "flex", gap: 8, alignItems: "center",
            }}>
              <span style={{ color: "#10B981" }}>✓</span> {f}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 16, fontFamily: interFont, fontSize: 15, color: "#E8793B", fontWeight: 600,
          opacity: interpolate(frame, [75, 88], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
        }}>
          getpawsy.pet
        </div>
      </div>
    </AbsoluteFill>
  );
};
