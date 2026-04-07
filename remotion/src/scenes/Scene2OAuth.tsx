import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Sequence } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene2OAuth: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerY = interpolate(spring({ frame, fps, config: { damping: 20 } }), [0, 1], [-40, 0]);
  const headerOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ padding: 80 }}>
      {/* Section header */}
      <div style={{
        fontFamily: poppinsFont, fontSize: 18, fontWeight: 600,
        color: "#E8793B", letterSpacing: 3, textTransform: "uppercase",
        marginBottom: 16, opacity: headerOp, transform: `translateY(${headerY}px)`,
      }}>
        Step 1
      </div>
      <div style={{
        fontFamily: poppinsFont, fontSize: 52, fontWeight: 700,
        color: "white", marginBottom: 50, opacity: headerOp,
        transform: `translateY(${headerY}px)`,
      }}>
        OAuth 2.0 Authentication
      </div>

      <div style={{ display: "flex", gap: 60, alignItems: "flex-start" }}>
        {/* Flow diagram */}
        <div style={{ flex: 1 }}>
          {[
            { icon: "👤", label: "User clicks 'Connect Pinterest'", delay: 20 },
            { icon: "🔐", label: "Redirect to Pinterest OAuth", delay: 35 },
            { icon: "✅", label: "User grants permissions", delay: 50 },
            { icon: "🔑", label: "Receive authorization code", delay: 65 },
            { icon: "🎫", label: "Exchange for access_token + refresh_token", delay: 80 },
            { icon: "💾", label: "Store tokens securely (encrypted)", delay: 95 },
          ].map((step, i) => {
            const s = spring({ frame: frame - step.delay, fps, config: { damping: 18 } });
            const x = interpolate(s, [0, 1], [-80, 0]);
            const op = interpolate(frame, [step.delay, step.delay + 15], [0, 1], {
              extrapolateRight: "clamp", extrapolateLeft: "clamp",
            });
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 20,
                marginBottom: 22, transform: `translateX(${x}px)`, opacity: op,
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: "rgba(232, 121, 59, 0.12)",
                  border: "1px solid rgba(232, 121, 59, 0.25)",
                  display: "flex", justifyContent: "center", alignItems: "center",
                  fontSize: 26, flexShrink: 0,
                }}>
                  {step.icon}
                </div>
                <div style={{
                  fontFamily: interFont, fontSize: 22, color: "rgba(255,255,255,0.85)",
                  fontWeight: 400,
                }}>
                  {step.label}
                </div>
                {i < 5 && (
                  <div style={{
                    position: "absolute", left: 107, top: 56 + i * 78,
                    width: 2, height: 22, background: "rgba(232, 121, 59, 0.2)",
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Scopes card */}
        <Sequence from={40}>
          <ScopesCard />
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};

const ScopesCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 15 } });

  const scopes = [
    { scope: "pins:read", desc: "Read user's pins" },
    { scope: "pins:write", desc: "Create & update pins" },
    { scope: "boards:read", desc: "Read board data" },
    { scope: "boards:write", desc: "Manage boards" },
    { scope: "user_accounts:read", desc: "Read profile" },
  ];

  return (
    <div style={{
      width: 420, background: "rgba(255,255,255,0.04)",
      borderRadius: 20, padding: 36, border: "1px solid rgba(255,255,255,0.08)",
      transform: `scale(${scale})`,
    }}>
      <div style={{
        fontFamily: poppinsFont, fontSize: 20, fontWeight: 700,
        color: "white", marginBottom: 24,
      }}>
        Requested Scopes
      </div>
      {scopes.map((s, i) => {
        const op = interpolate(frame, [15 + i * 8, 25 + i * 8], [0, 1], {
          extrapolateRight: "clamp", extrapolateLeft: "clamp",
        });
        return (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 0", borderBottom: i < scopes.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
            opacity: op,
          }}>
            <code style={{
              fontFamily: "monospace", fontSize: 16, color: "#E8793B",
              background: "rgba(232, 121, 59, 0.1)", padding: "4px 10px", borderRadius: 6,
            }}>
              {s.scope}
            </code>
            <span style={{ fontFamily: interFont, fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
              {s.desc}
            </span>
          </div>
        );
      })}
    </div>
  );
};
