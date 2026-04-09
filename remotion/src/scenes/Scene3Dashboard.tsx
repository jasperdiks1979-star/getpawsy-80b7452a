import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene3Dashboard: React.FC = () => {
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
          Pin Management
        </div>
        <div style={{ fontFamily: poppinsFont, fontSize: 40, fontWeight: 700, color: "white" }}>
          Admin Dashboard & Queue
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 20, marginTop: 24 }}>
        {[
          { label: "Queued", value: "8", color: "#F59E0B" },
          { label: "Published", value: "156", color: "#10B981" },
          { label: "Boards", value: "6", color: "#6366F1" },
          { label: "Today", value: "3", color: "#E8793B" },
        ].map((stat, i) => {
          const s = spring({ frame: frame - 12 - i * 6, fps, config: { damping: 16 } });
          return (
            <div key={i} style={{
              flex: 1, background: "rgba(255,255,255,0.04)",
              borderRadius: 14, padding: "20px 18px",
              border: "1px solid rgba(255,255,255,0.07)",
              transform: `scale(${s})`,
            }}>
              <div style={{ fontFamily: interFont, fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                {stat.label}
              </div>
              <div style={{ fontFamily: poppinsFont, fontSize: 36, fontWeight: 800, color: stat.color }}>
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pin queue table */}
      <div style={{
        marginTop: 24, background: "rgba(255,255,255,0.03)",
        borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)",
        overflow: "hidden",
        opacity: interpolate(frame, [40, 55], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
      }}>
        <div style={{
          display: "flex", padding: "12px 20px",
          background: "rgba(255,255,255,0.04)",
          fontFamily: interFont, fontSize: 11, color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase", letterSpacing: 1,
        }}>
          <div style={{ flex: 3 }}>Pin Title</div>
          <div style={{ flex: 2 }}>Board</div>
          <div style={{ flex: 1 }}>Status</div>
          <div style={{ flex: 2 }}>Scheduled</div>
        </div>
        {[
          { title: "Best Cat Litter Box 2025", board: "Cat Supplies", status: "queued", time: "Today 9:00 AM" },
          { title: "Why Pet Owners Love This Bed", board: "Dog Products", status: "queued", time: "Today 1:00 PM" },
          { title: "Top 5 Fish Tank Filters", board: "Fish & Aquarium", status: "queued", time: "Today 5:00 PM" },
          { title: "Smart Pet Camera Review", board: "Pet Tech", status: "published", time: "Yesterday" },
          { title: "Healthy Dog Treats Guide", board: "Dog Products", status: "published", time: "Yesterday" },
        ].map((row, i) => {
          const rowOp = interpolate(frame, [50 + i * 6, 62 + i * 6], [0, 1], {
            extrapolateRight: "clamp", extrapolateLeft: "clamp",
          });
          return (
            <div key={i} style={{
              display: "flex", padding: "12px 20px", alignItems: "center",
              borderTop: "1px solid rgba(255,255,255,0.04)",
              fontFamily: interFont, fontSize: 14, color: "rgba(255,255,255,0.75)",
              opacity: rowOp,
            }}>
              <div style={{ flex: 3 }}>{row.title}</div>
              <div style={{ flex: 2, color: "rgba(255,255,255,0.45)" }}>{row.board}</div>
              <div style={{ flex: 1 }}>
                <span style={{
                  padding: "3px 10px", borderRadius: 16, fontSize: 11, fontWeight: 600,
                  background: row.status === "queued" ? "rgba(245, 158, 11, 0.12)" : "rgba(16, 185, 129, 0.12)",
                  color: row.status === "queued" ? "#F59E0B" : "#10B981",
                }}>
                  {row.status}
                </span>
              </div>
              <div style={{ flex: 2, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{row.time}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
