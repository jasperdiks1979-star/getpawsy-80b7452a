import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene5Publishing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const steps = [
    { icon: "⏰", title: "Cron Worker", desc: "Runs every 5 min, picks queued pins where scheduled_time ≤ now()", delay: 20 },
    { icon: "📤", title: "POST /v5/pins", desc: "Sends title, description, image_url, board_id, link to Pinterest API", delay: 40 },
    { icon: "🔄", title: "Token Refresh", desc: "Auto-refreshes expired tokens using refresh_token before each batch", delay: 60 },
    { icon: "⚡", title: "Rate Limiting", desc: "Max 5 pins per batch, 1.5s delay between posts to respect API limits", delay: 80 },
    { icon: "📊", title: "Logging", desc: "Every attempt logged with status, error, timestamp in pinterest_post_logs", delay: 100 },
  ];

  return (
    <AbsoluteFill style={{ padding: 80 }}>
      <div style={{
        fontFamily: poppinsFont, fontSize: 18, fontWeight: 600,
        color: "#E8793B", letterSpacing: 3, textTransform: "uppercase",
        marginBottom: 16, opacity: headerOp,
      }}>
        Step 4
      </div>
      <div style={{
        fontFamily: poppinsFont, fontSize: 52, fontWeight: 700,
        color: "white", marginBottom: 50, opacity: headerOp,
      }}>
        Automated Publishing
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {steps.map((step, i) => {
          const s = spring({ frame: frame - step.delay, fps, config: { damping: 18 } });
          const x = interpolate(s, [0, 1], [-60, 0]);
          const op = interpolate(frame, [step.delay, step.delay + 15], [0, 1], {
            extrapolateRight: "clamp", extrapolateLeft: "clamp",
          });

          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 24,
              background: "rgba(255,255,255,0.03)", borderRadius: 16,
              padding: "20px 28px", border: "1px solid rgba(255,255,255,0.06)",
              transform: `translateX(${x}px)`, opacity: op,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: "rgba(232, 121, 59, 0.12)",
                display: "flex", justifyContent: "center", alignItems: "center",
                fontSize: 28, flexShrink: 0,
              }}>
                {step.icon}
              </div>
              <div>
                <div style={{
                  fontFamily: poppinsFont, fontSize: 20, fontWeight: 700, color: "white", marginBottom: 4,
                }}>
                  {step.title}
                </div>
                <div style={{
                  fontFamily: interFont, fontSize: 15, color: "rgba(255,255,255,0.5)",
                }}>
                  {step.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
