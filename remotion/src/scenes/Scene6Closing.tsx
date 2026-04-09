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
          Reviewer summary: Pinterest integration is visible end-to-end
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          {[
            "Native Pinterest settings screen shown inside GetPawsy",
            "Complete OAuth flow shown: connect → consent → callback → secure tokens",
            "Connected Pinterest account and synced boards visible in dashboard",
            "Product records converted into Pinterest-ready pin creatives",
            "Pins published to Pinterest boards through API v5 with logs",
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
          opacity: interpolate(frame, [78, 94], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
        }}>
          getpawsy.pet · Pinterest Standard Access demo
        </div>
      </div>
    </AbsoluteFill>
  );
};
