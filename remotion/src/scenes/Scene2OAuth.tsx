import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene2OAuth: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const browserScale = spring({ frame: frame - 10, fps, config: { damping: 18 } });
  const step1Op = interpolate(frame, [18, 34], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const step2Op = interpolate(frame, [38, 54], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const step3Op = interpolate(frame, [58, 74], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const step4Op = interpolate(frame, [78, 94], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const proofOp = interpolate(frame, [95, 112], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ padding: "60px 80px" }}>
      <div style={{ opacity: headerOp, marginBottom: 8 }}>
        <div style={{
          fontFamily: poppinsFont, fontSize: 16, fontWeight: 600,
          color: "#E8793B", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8,
        }}>
          Full OAuth Flow
        </div>
        <div style={{ fontFamily: poppinsFont, fontSize: 40, fontWeight: 700, color: "white" }}>
          From connect click to secure Pinterest token exchange
        </div>
      </div>

      <div style={{ display: "flex", gap: 32, marginTop: 28, alignItems: "flex-start" }}>
        <div style={{
          flex: 1,
          transform: `scale(${browserScale})`,
          transformOrigin: "top left",
        }}>
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
              getpawsy.pet/admin/integrations/pinterest
            </div>
          </div>
          <div style={{
            background: "rgba(255,255,255,0.04)", borderRadius: "0 0 14px 14px",
            padding: 28, minHeight: 420, border: "1px solid rgba(255,255,255,0.06)",
            borderTop: "none",
          }}>
            <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
              {[
                {
                  label: "Step 1",
                  title: "GetPawsy admin",
                  text: "Admin opens Pinterest integration and clicks Connect Pinterest.",
                  chip: "Start OAuth",
                  bg: "rgba(232,121,59,0.08)",
                  border: "rgba(232,121,59,0.18)",
                  op: step1Op,
                },
                {
                  label: "Step 2",
                  title: "Pinterest consent",
                  text: "Pinterest shows requested scopes: user_accounts, boards and pins read/write.",
                  chip: "Authorize app",
                  bg: "rgba(230,0,35,0.08)",
                  border: "rgba(230,0,35,0.18)",
                  op: step2Op,
                },
                {
                  label: "Step 3",
                  title: "Callback + exchange",
                  text: "Pinterest returns code + state, then backend exchanges them for tokens.",
                  chip: "Secure callback",
                  bg: "rgba(16,185,129,0.08)",
                  border: "rgba(16,185,129,0.18)",
                  op: step3Op,
                },
              ].map((panel, i) => (
                <div key={i} style={{
                  flex: 1,
                  background: panel.bg,
                  border: `1px solid ${panel.border}`,
                  borderRadius: 16,
                  padding: 18,
                  opacity: panel.op,
                  minHeight: 228,
                }}>
                  <div style={{ fontFamily: interFont, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.38)", marginBottom: 12 }}>
                    {panel.label}
                  </div>
                  <div style={{ fontFamily: poppinsFont, fontSize: 18, fontWeight: 700, color: "white", marginBottom: 10, lineHeight: 1.2 }}>
                    {panel.title}
                  </div>
                  <div style={{ fontFamily: interFont, fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,0.72)", marginBottom: 16 }}>
                    {panel.text}
                  </div>
                  <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 999,
                    padding: "8px 14px",
                    background: "rgba(255,255,255,0.08)",
                    fontFamily: interFont,
                    fontSize: 12,
                    color: "white",
                    fontWeight: 600,
                  }}>
                    {i === 0 ? "📌" : i === 1 ? "🔐" : "↩️"} {panel.chip}
                  </div>
                  {i === 1 && (
                    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                      {["pins:read", "pins:write", "boards:read", "boards:write"].map((scope) => (
                        <div key={scope} style={{ fontFamily: interFont, fontSize: 11, color: "rgba(255,255,255,0.52)" }}>• {scope}</div>
                      ))}
                    </div>
                  )}
                  {i === 2 && (
                    <div style={{ marginTop: 16, fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.45 }}>
                      GET /functions/v1/pinterest-oauth-callback
                      <br />code=***&state=***
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{
              marginTop: 18,
              padding: 18,
              borderRadius: 16,
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.18)",
              opacity: step4Op,
            }}>
              <div style={{ fontFamily: poppinsFont, fontSize: 18, fontWeight: 700, color: "white", marginBottom: 8 }}>
                Step 4 — Connected Pinterest account inside GetPawsy
              </div>
              <div style={{ display: "flex", gap: 18 }}>
                <div style={{ flex: 1, fontFamily: interFont, fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,0.76)" }}>
                  Access token and refresh token are stored server-side, then boards and account data are synced back into the dashboard.
                </div>
                <div style={{
                  width: 260,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.06)",
                  padding: 14,
                }}>
                  <div style={{ fontFamily: interFont, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.38)", marginBottom: 8 }}>
                    Connected account
                  </div>
                  <div style={{ fontFamily: poppinsFont, fontSize: 17, fontWeight: 700, color: "white", marginBottom: 6 }}>
                    @getpawsy.pet
                  </div>
                  <div style={{ fontFamily: interFont, fontSize: 12, color: "#10B981", fontWeight: 600 }}>
                    ✓ Boards synced • publish ready
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: 400, display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { num: "1", label: "Visible Pinterest integration in app", desc: "Reviewer sees the native Pinterest settings screen inside GetPawsy before authorization starts.", op: step1Op },
            { num: "2", label: "Actual Pinterest consent step", desc: "Requested permissions are shown explicitly so the OAuth relationship is unambiguous.", op: step2Op },
            { num: "3", label: "Redirect URI + callback", desc: "Pinterest sends code and state back to the backend callback for secure verification.", op: step3Op },
            { num: "4", label: "Connected account becomes publish-ready", desc: "Board sync and token storage complete the full OAuth lifecycle in-product.", op: step4Op },
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

          <div style={{
            marginTop: 8,
            padding: 18,
            borderRadius: 16,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            opacity: proofOp,
          }}>
            <div style={{ fontFamily: interFont, fontSize: 11, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>
              Technical proof shown in demo
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, color: "rgba(255,255,255,0.58)" }}>
              redirect_uri → /functions/v1/pinterest-oauth-callback
              <br />
              scopes → boards:read, boards:write, pins:read, pins:write
              <br />
              result → access_token + refresh_token + connected account
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
