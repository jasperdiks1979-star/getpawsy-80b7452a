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
          Native Pinterest Publishing
        </div>
        <div style={{ fontFamily: poppinsFont, fontSize: 40, fontWeight: 700, color: "white" }}>
          Queue → Pinterest API → live board post
        </div>
      </div>

      <div style={{ display: "flex", gap: 40, marginTop: 24 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { icon: "🧾", title: "Queued from GetPawsy", desc: "The next approved product pin is pulled from the internal queue." },
            { icon: "📤", title: "Publish to Pinterest API v5", desc: "Board ID, title, image and canonical product URL are sent to Pinterest." },
            { icon: "📌", title: "Pin lands on synced board", desc: "The published asset appears on the selected Pinterest board." },
            { icon: "🔄", title: "Auto token refresh", desc: "If needed, refresh token is used before posting so publishing continues." },
            { icon: "📊", title: "Status logged for review", desc: "Every successful or failed publish attempt is written to logs." },
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

        <div style={{ width: 430, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.07)",
            overflow: "hidden",
            opacity: interpolate(frame, [48, 63], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
          }}>
            <div style={{
              padding: "10px 16px", background: "rgba(255,255,255,0.04)",
              fontFamily: interFont, fontSize: 12, color: "rgba(255,255,255,0.4)",
            }}>
              Live Pinterest post preview
            </div>
            <div style={{ padding: 16, display: "flex", gap: 14 }}>
              <div style={{
                width: 118,
                aspectRatio: "2/3",
                borderRadius: 12,
                background: "linear-gradient(160deg, rgba(232,121,59,0.95), rgba(126,58,16,0.9))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
              }}>
                🐱
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: poppinsFont, fontSize: 18, fontWeight: 700, color: "white", lineHeight: 1.25, marginBottom: 8 }}>
                  Stop Scooping Litter Forever
                </div>
                <div style={{ fontFamily: interFont, fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,0.62)", marginBottom: 10 }}>
                  Posted to the Pinterest board “Cat essentials” with canonical link back to the product page.
                </div>
                <div style={{ fontFamily: interFont, fontSize: 11, color: "#E60023", fontWeight: 600 }}>
                  pinterest.com/pin/12345678
                </div>
              </div>
            </div>
          </div>

          <div style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)",
            overflow: "hidden",
            opacity: interpolate(frame, [60, 75], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
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
  "board_id": "board_cat_essentials",
  "title": "Stop Scooping Litter Forever",
  "link": "https://getpawsy.pet/products/self-cleaning-cat-litter-box",
  "created_at": "2025-04-09T09:00:00Z"
}`}
              </pre>
            </div>
            <div style={{
              padding: "10px 16px", background: "rgba(16, 185, 129, 0.06)",
              borderTop: "1px solid rgba(16, 185, 129, 0.1)",
              fontFamily: interFont, fontSize: 12, color: "#10B981", fontWeight: 600,
            }}>
              ✓ Pin published successfully to Pinterest
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
