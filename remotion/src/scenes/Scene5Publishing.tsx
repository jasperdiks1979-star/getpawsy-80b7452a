import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene5Publishing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ padding: "60px 80px" }}>
      <div style={{ opacity: headerOp, marginBottom: 8 }}>
        <div style={{
          fontFamily: poppinsFont, fontSize: 16, fontWeight: 600,
          color: "#E8793B", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8,
        }}>
          Automated Publishing
        </div>
        <div style={{ fontFamily: poppinsFont, fontSize: 40, fontWeight: 700, color: "white" }}>
          Scheduled Pin Posting
        </div>
      </div>

      <div style={{ display: "flex", gap: 40, marginTop: 24 }}>
        {/* Left: Publishing pipeline */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { icon: "⏰", title: "Scheduled Publishing", desc: "3 pins per day at optimal times (morning, afternoon, evening)" },
            { icon: "📤", title: "Pinterest API v5", desc: "POST /v5/pins — sends title, description, image, board, and product link" },
            { icon: "🔄", title: "Auto Token Refresh", desc: "Expired access tokens refreshed automatically using stored refresh token" },
            { icon: "⚡", title: "Rate Limit Safe", desc: "Max 5 pins per batch with 1.5s delay between posts" },
            { icon: "📊", title: "Status Tracking", desc: "Every pin logged with status, timestamp, and error details" },
          ].map((step, i) => {
            const delay = 15 + i * 14;
            const s = spring({ frame: frame - delay, fps, config: { damping: 18 } });
            const x = interpolate(s, [0, 1], [-40, 0]);
            const op = interpolate(frame, [delay, delay + 12], [0, 1], {
              extrapolateRight: "clamp", extrapolateLeft: "clamp",
            });
            return (
              <div key={i} style={{
                display: "flex", gap: 14, alignItems: "center",
                background: "rgba(255,255,255,0.03)", borderRadius: 12,
                padding: "14px 18px", border: "1px solid rgba(255,255,255,0.05)",
                transform: `translateX(${x}px)`, opacity: op,
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: "rgba(232, 121, 59, 0.1)",
                  display: "flex", justifyContent: "center", alignItems: "center", fontSize: 20,
                }}>
                  {step.icon}
                </div>
                <div>
                  <div style={{ fontFamily: poppinsFont, fontSize: 15, fontWeight: 600, color: "white", marginBottom: 2 }}>
                    {step.title}
                  </div>
                  <div style={{ fontFamily: interFont, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                    {step.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: API response mockup */}
        <div style={{
          width: 420, background: "rgba(255,255,255,0.03)",
          borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)",
          overflow: "hidden",
          opacity: interpolate(frame, [50, 65], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
        }}>
          <div style={{
            padding: "10px 16px", background: "rgba(255,255,255,0.04)",
            fontFamily: interFont, fontSize: 12, color: "rgba(255,255,255,0.4)",
          }}>
            POST /v5/pins Response
          </div>
          <div style={{ padding: 16 }}>
            <pre style={{
              fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.6)",
              lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap",
            }}>
{`{
  "id": "pin_12345678",
  "board_id": "board_cat_supplies",
  "title": "Stop Scooping Litter Forever",
  "link": "https://getpawsy.pet/products/...",
  "media": {
    "media_type": "image"
  },
  "created_at": "2025-04-09T09:00:00Z"
}`}
            </pre>
          </div>
          <div style={{
            padding: "10px 16px", background: "rgba(16, 185, 129, 0.06)",
            borderTop: "1px solid rgba(16, 185, 129, 0.1)",
            fontFamily: interFont, fontSize: 12, color: "#10B981", fontWeight: 600,
          }}>
            ✓ Pin published successfully
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
