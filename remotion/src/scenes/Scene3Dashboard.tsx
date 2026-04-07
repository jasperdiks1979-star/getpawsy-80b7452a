import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene3Dashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ padding: 80 }}>
      <div style={{
        fontFamily: poppinsFont, fontSize: 18, fontWeight: 600,
        color: "#E8793B", letterSpacing: 3, textTransform: "uppercase",
        marginBottom: 16, opacity: headerOp,
      }}>
        Step 2
      </div>
      <div style={{
        fontFamily: poppinsFont, fontSize: 52, fontWeight: 700,
        color: "white", marginBottom: 50, opacity: headerOp,
      }}>
        Admin Dashboard
      </div>

      {/* Mock dashboard */}
      <div style={{ display: "flex", gap: 30 }}>
        {/* Stats cards */}
        {[
          { label: "Draft Pins", value: "12", color: "#6B7280" },
          { label: "Queued", value: "8", color: "#F59E0B" },
          { label: "Posted", value: "156", color: "#10B981" },
          { label: "Failed", value: "2", color: "#EF4444" },
        ].map((stat, i) => {
          const s = spring({ frame: frame - 15 - i * 10, fps, config: { damping: 15 } });
          return (
            <div key={i} style={{
              flex: 1, background: "rgba(255,255,255,0.04)",
              borderRadius: 16, padding: "28px 24px",
              border: "1px solid rgba(255,255,255,0.08)",
              transform: `scale(${s})`,
            }}>
              <div style={{
                fontFamily: interFont, fontSize: 14, color: "rgba(255,255,255,0.5)",
                marginBottom: 8, textTransform: "uppercase", letterSpacing: 1,
              }}>
                {stat.label}
              </div>
              <div style={{
                fontFamily: poppinsFont, fontSize: 48, fontWeight: 800, color: stat.color,
              }}>
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Queue table */}
      <div style={{
        marginTop: 40, background: "rgba(255,255,255,0.03)",
        borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
        opacity: interpolate(frame, [50, 70], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
      }}>
        <div style={{
          display: "flex", padding: "16px 24px",
          background: "rgba(255,255,255,0.04)",
          fontFamily: interFont, fontSize: 13, color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase", letterSpacing: 1, gap: 0,
        }}>
          <div style={{ flex: 3 }}>Pin Title</div>
          <div style={{ flex: 1 }}>Status</div>
          <div style={{ flex: 2 }}>Scheduled</div>
          <div style={{ flex: 1 }}>Actions</div>
        </div>
        {[
          { title: "Best Cat Litter Box 2025 🐱", status: "queued", time: "9:00 AM EST" },
          { title: "Why Pet Owners Love This...", status: "queued", time: "1:00 PM EST" },
          { title: "Smart Pet Gadgets Guide", status: "draft", time: "5:00 PM EST" },
        ].map((row, i) => {
          const rowOp = interpolate(frame, [60 + i * 10, 75 + i * 10], [0, 1], {
            extrapolateRight: "clamp", extrapolateLeft: "clamp",
          });
          return (
            <div key={i} style={{
              display: "flex", padding: "14px 24px", alignItems: "center",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              fontFamily: interFont, fontSize: 16, color: "rgba(255,255,255,0.8)",
              opacity: rowOp,
            }}>
              <div style={{ flex: 3 }}>{row.title}</div>
              <div style={{ flex: 1 }}>
                <span style={{
                  padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: row.status === "queued" ? "rgba(245, 158, 11, 0.15)" : "rgba(107, 114, 128, 0.15)",
                  color: row.status === "queued" ? "#F59E0B" : "#6B7280",
                }}>
                  {row.status}
                </span>
              </div>
              <div style={{ flex: 2, color: "rgba(255,255,255,0.5)" }}>{row.time}</div>
              <div style={{ flex: 1, color: "#E8793B", fontSize: 14 }}>Retry · Delete</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
