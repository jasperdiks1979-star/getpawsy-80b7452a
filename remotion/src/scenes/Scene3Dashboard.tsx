import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene3Dashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  // Products page screenshot reveal
  const prodScreenOp = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const prodScreenY = interpolate(frame, [20, 40], [30, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ padding: "60px 80px" }}>
      <div style={{ opacity: headerOp, marginBottom: 8 }}>
        <div style={{
          fontFamily: poppinsFont, fontSize: 16, fontWeight: 600,
          color: "#E8793B", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8,
        }}>
          Live Pinterest Integration
        </div>
        <div style={{ fontFamily: poppinsFont, fontSize: 40, fontWeight: 700, color: "white" }}>
          Connected account, boards and publishing queue
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 24 }}>
        {[
          { label: "Pinterest account", value: "@getpawsy.pet", color: "#E60023" },
          { label: "Boards synced", value: "6", color: "#10B981" },
          { label: "Queued pins", value: "8", color: "#F59E0B" },
          { label: "Published today", value: "3", color: "#E8793B" },
        ].map((stat, i) => {
          const s = spring({ frame: frame - 8 - i * 6, fps, config: { damping: 16 } });
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
              <div style={{ fontFamily: poppinsFont, fontSize: stat.label === "Pinterest account" ? 24 : 36, fontWeight: 800, color: stat.color }}>
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
        {/* Real products page screenshot */}
        <div style={{
          width: 440,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.1)",
          opacity: prodScreenOp,
          transform: `translateY(${prodScreenY}px)`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}>
          <div style={{
            background: "rgba(255,255,255,0.06)", padding: "8px 14px",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{ display: "flex", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF5F57" }} />
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FFBD2E" }} />
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#28C840" }} />
            </div>
            <div style={{ fontFamily: interFont, fontSize: 10, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.06)", padding: "3px 10px", borderRadius: 4, flex: 1 }}>
              getpawsy.pet/products
            </div>
          </div>
          <Img
            src={staticFile("images/products-page.png")}
            style={{ width: "100%", display: "block" }}
          />
        </div>

        {/* Publishing queue */}
        <div style={{
          flex: 1, background: "rgba(255,255,255,0.03)",
          borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)",
          overflow: "hidden",
          opacity: interpolate(frame, [45, 60], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
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
            { title: "Self-cleaning cat litter box", board: "Cat essentials", status: "queued", time: "Today 09:00" },
            { title: "Orthopedic dog bed for travel", board: "Dog travel", status: "queued", time: "Today 13:00" },
            { title: "Smart treat camera for pets", board: "Pet tech", status: "queued", time: "Today 17:00" },
            { title: "Automatic feeder comparison", board: "Best sellers", status: "published", time: "Yesterday" },
          ].map((row, i) => {
            const rowOp = interpolate(frame, [56 + i * 6, 68 + i * 6], [0, 1], {
              extrapolateRight: "clamp", extrapolateLeft: "clamp",
            });
            return (
              <div key={i} style={{
                display: "flex", padding: "13px 20px", alignItems: "center",
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
      </div>
    </AbsoluteFill>
  );
};
