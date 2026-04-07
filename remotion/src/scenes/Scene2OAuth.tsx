import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Sequence } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene2OAuth: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerY = interpolate(spring({ frame, fps, config: { damping: 20 } }), [0, 1], [-40, 0]);
  const headerOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ padding: "70px 80px" }}>
      {/* Section header */}
      <div style={{
        fontFamily: poppinsFont, fontSize: 18, fontWeight: 600,
        color: "#E8793B", letterSpacing: 3, textTransform: "uppercase",
        marginBottom: 12, opacity: headerOp, transform: `translateY(${headerY}px)`,
      }}>
        Step 1
      </div>
      <div style={{
        fontFamily: poppinsFont, fontSize: 48, fontWeight: 700,
        color: "white", marginBottom: 40, opacity: headerOp,
        transform: `translateY(${headerY}px)`,
      }}>
        OAuth 2.0 Authentication
      </div>

      <div style={{ display: "flex", gap: 50, alignItems: "flex-start" }}>
        {/* Flow diagram */}
        <div style={{ flex: 1 }}>
          {[
            { icon: "👤", label: "User clicks 'Connect Pinterest'", delay: 20 },
            { icon: "🔐", label: "Redirect to Pinterest OAuth", delay: 32 },
            { icon: "✅", label: "User grants permissions", delay: 44 },
            { icon: "🔑", label: "Receive authorization code", delay: 56 },
            { icon: "🎫", label: "Exchange for access + refresh token", delay: 68 },
            { icon: "💾", label: "Store tokens securely", delay: 80 },
          ].map((step, i) => {
            const s = spring({ frame: frame - step.delay, fps, config: { damping: 18 } });
            const x = interpolate(s, [0, 1], [-60, 0]);
            const op = interpolate(frame, [step.delay, step.delay + 12], [0, 1], {
              extrapolateRight: "clamp", extrapolateLeft: "clamp",
            });
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 18,
                marginBottom: 16, transform: `translateX(${x}px)`, opacity: op,
              }}>
                <div style={{
                  width: 50, height: 50, borderRadius: 12,
                  background: "rgba(232, 121, 59, 0.12)",
                  border: "1px solid rgba(232, 121, 59, 0.25)",
                  display: "flex", justifyContent: "center", alignItems: "center",
                  fontSize: 22, flexShrink: 0,
                }}>
                  {step.icon}
                </div>
                <div style={{
                  fontFamily: interFont, fontSize: 20, color: "rgba(255,255,255,0.85)",
                  fontWeight: 400,
                }}>
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scopes card */}
        <div style={{
          width: 400, background: "rgba(255,255,255,0.04)",
          borderRadius: 20, padding: 32, border: "1px solid rgba(255,255,255,0.08)",
          transform: `scale(${spring({ frame: frame - 40, fps, config: { damping: 15 } })})`,
        }}>
          <div style={{
            fontFamily: poppinsFont, fontSize: 18, fontWeight: 700,
            color: "white", marginBottom: 20,
          }}>
            Requested Scopes
          </div>
          {[
            { scope: "pins:read", desc: "Read user's pins" },
            { scope: "pins:write", desc: "Create & update pins" },
            { scope: "boards:read", desc: "Read board data" },
            { scope: "boards:write", desc: "Manage boards" },
            { scope: "user_accounts:read", desc: "Read profile" },
          ].map((s, i) => {
            const op = interpolate(frame, [55 + i * 8, 65 + i * 8], [0, 1], {
              extrapolateRight: "clamp", extrapolateLeft: "clamp",
            });
            return (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "9px 0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.06)" : "none",
                opacity: op,
              }}>
                <code style={{
                  fontFamily: "monospace", fontSize: 15, color: "#E8793B",
                  background: "rgba(232, 121, 59, 0.1)", padding: "3px 10px", borderRadius: 6,
                }}>
                  {s.scope}
                </code>
                <span style={{ fontFamily: interFont, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                  {s.desc}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
