import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene6Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame: frame - 10, fps, config: { damping: 12 } });
  const titleOp = interpolate(frame, [20, 45], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const listOp = (delay: number) => interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateRight: "clamp", extrapolateLeft: "clamp",
  });

  const features = [
    "✅ OAuth 2.0 with secure token storage",
    "✅ AI-powered pin generation from product catalog",
    "✅ Automated scheduling & publishing via cron",
    "✅ Rate limiting & token refresh",
    "✅ Full admin dashboard with queue management",
    "✅ Comprehensive logging & error handling",
  ];

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 30,
      }}>
        <div style={{
          fontSize: 60, transform: `scale(${logoScale})`,
        }}>
          🐾
        </div>

        <div style={{
          fontFamily: poppinsFont, fontSize: 48, fontWeight: 800,
          color: "white", opacity: titleOp, textAlign: "center",
        }}>
          GetPawsy × Pinterest
        </div>

        <div style={{
          fontFamily: interFont, fontSize: 22, color: "rgba(255,255,255,0.5)",
          opacity: titleOp, textAlign: "center", marginBottom: 20,
        }}>
          Production-Ready Pinterest Integration
        </div>

        <div style={{
          display: "flex", flexDirection: "column", gap: 12,
          alignItems: "flex-start",
        }}>
          {features.map((f, i) => (
            <div key={i} style={{
              fontFamily: interFont, fontSize: 20, color: "rgba(255,255,255,0.8)",
              opacity: listOp(40 + i * 8),
            }}>
              {f}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 30, fontFamily: interFont, fontSize: 18,
          color: "#E8793B", fontWeight: 600,
          opacity: interpolate(frame, [110, 130], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
        }}>
          getpawsy.pet
        </div>
      </div>
    </AbsoluteFill>
  );
};
