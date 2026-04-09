import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene2OAuth: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  // Simulate a browser window showing the OAuth flow
  const browserScale = spring({ frame: frame - 15, fps, config: { damping: 18 } });
  const step1Op = interpolate(frame, [30, 45], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const step2Op = interpolate(frame, [50, 65], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const step3Op = interpolate(frame, [70, 85], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const checkOp = interpolate(frame, [90, 105], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ padding: "60px 80px" }}>
      <div style={{ opacity: headerOp, marginBottom: 8 }}>
        <div style={{
          fontFamily: poppinsFont, fontSize: 16, fontWeight: 600,
          color: "#E8793B", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8,
        }}>
          User Authentication
        </div>
        <div style={{ fontFamily: poppinsFont, fontSize: 40, fontWeight: 700, color: "white" }}>
          Pinterest OAuth 2.0 Login
        </div>
      </div>

      <div style={{ display: "flex", gap: 40, marginTop: 30, alignItems: "flex-start" }}>
        {/* Left: Browser mockup */}
        <div style={{
          flex: 1, transform: `scale(${browserScale})`, transformOrigin: "top left",
        }}>
          {/* Browser chrome */}
          <div style={{
            background: "rgba(255,255,255,0.08)", borderRadius: "14px 14px 0 0",
            padding: "12px 16px", display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FFBD2E" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
            </div>
            <div style={{
              fontFamily: interFont, fontSize: 12, color: "rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.06)", padding: "4px 14px", borderRadius: 6, flex: 1,
            }}>
              getpawsy.pet/admin/integrations
            </div>
          </div>
          {/* Browser content - app showing connect button */}
          <div style={{
            background: "rgba(255,255,255,0.04)", borderRadius: "0 0 14px 14px",
            padding: 32, minHeight: 340, border: "1px solid rgba(255,255,255,0.06)",
            borderTop: "none",
          }}>
            <div style={{ fontFamily: poppinsFont, fontSize: 22, fontWeight: 700, color: "white", marginBottom: 20 }}>
              Pinterest Integration
            </div>
            <div style={{
              fontFamily: interFont, fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 24,
            }}>
              Connect your Pinterest account to enable automated pin publishing
            </div>
            {/* Connect button */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: "#E60023", color: "white", padding: "12px 28px",
              borderRadius: 24, fontFamily: interFont, fontSize: 15, fontWeight: 600,
              boxShadow: "0 4px 16px rgba(230, 0, 35, 0.3)",
            }}>
              <span style={{ fontSize: 18 }}>📌</span> Connect Pinterest Account
            </div>

            {/* Status after connecting */}
            <div style={{
              marginTop: 24, padding: 16, borderRadius: 12,
              background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)",
              opacity: checkOp,
            }}>
              <div style={{ fontFamily: interFont, fontSize: 14, color: "#10B981", fontWeight: 600 }}>
                ✓ Connected successfully — tokens stored securely
              </div>
            </div>
          </div>
        </div>

        {/* Right: Flow steps */}
        <div style={{ width: 480, display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { num: "1", label: "Admin clicks 'Connect Pinterest'", desc: "Initiates OAuth 2.0 authorization flow", op: step1Op },
            { num: "2", label: "Redirect to Pinterest consent", desc: "User reviews requested permissions (pins:read, pins:write, boards:read, boards:write)", op: step2Op },
            { num: "3", label: "User grants access", desc: "Pinterest redirects back with authorization code", op: step3Op },
            { num: "4", label: "Tokens stored securely", desc: "Access + refresh tokens encrypted and saved server-side", op: checkOp },
          ].map((step, i) => (
            <div key={i} style={{
              display: "flex", gap: 14, opacity: step.op, alignItems: "flex-start",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: "rgba(232, 121, 59, 0.15)", border: "1px solid rgba(232, 121, 59, 0.3)",
                display: "flex", justifyContent: "center", alignItems: "center",
                fontFamily: poppinsFont, fontSize: 14, fontWeight: 700, color: "#E8793B",
              }}>
                {step.num}
              </div>
              <div>
                <div style={{ fontFamily: poppinsFont, fontSize: 16, fontWeight: 600, color: "white", marginBottom: 2 }}>
                  {step.label}
                </div>
                <div style={{ fontFamily: interFont, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                  {step.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
