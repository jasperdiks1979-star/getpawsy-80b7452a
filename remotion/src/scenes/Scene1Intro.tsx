import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const titleOp = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const subtitleOp = interpolate(frame, [35, 55], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const badgeOp = interpolate(frame, [55, 75], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const footerOp = interpolate(frame, [68, 86], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  // Screenshot reveal
  const screenshotOp = interpolate(frame, [20, 50], [0, 0.12], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const screenshotScale = interpolate(frame, [20, 80], [1.05, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {/* Background: real homepage screenshot */}
      <div style={{
        position: "absolute", inset: 0, overflow: "hidden",
        opacity: screenshotOp,
      }}>
        <Img
          src={staticFile("images/homepage.png")}
          style={{
            width: "100%", height: "100%", objectFit: "cover",
            transform: `scale(${screenshotScale})`,
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, position: "relative", zIndex: 1 }}>
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
          textShadow: "0 4px 24px rgba(0,0,0,0.5)",
        }}>
          GetPawsy × Pinterest
        </div>

        <div style={{
          fontFamily: interFont, fontSize: 24, color: "rgba(255,255,255,0.55)",
          opacity: subtitleOp, letterSpacing: 2, textTransform: "uppercase",
        }}>
          Native Pinterest integration demo
        </div>

        <div style={{
          fontFamily: interFont, fontSize: 16, color: "rgba(255,255,255,0.7)",
          background: "rgba(255,255,255,0.06)", padding: "10px 24px", borderRadius: 30,
          border: "1px solid rgba(255,255,255,0.1)", opacity: badgeOp, marginTop: 8,
        }}>
          Shows full OAuth flow, live account connection, board sync and pin publishing
        </div>

        <div style={{
          fontFamily: interFont, fontSize: 14, color: "rgba(255,255,255,0.46)",
          opacity: footerOp, letterSpacing: 0.5,
        }}>
          Reviewer walkthrough for Pinterest Standard Access
        </div>
      </div>
    </AbsoluteFill>
  );
};
