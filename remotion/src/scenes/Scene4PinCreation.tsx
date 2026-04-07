import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene4PinCreation: React.FC = () => {
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
        Step 3
      </div>
      <div style={{
        fontFamily: poppinsFont, fontSize: 52, fontWeight: 700,
        color: "white", marginBottom: 50, opacity: headerOp,
      }}>
        AI Pin Generation
      </div>

      <div style={{ display: "flex", gap: 40 }}>
        {/* Product input */}
        <div style={{
          width: 380, background: "rgba(255,255,255,0.04)",
          borderRadius: 20, padding: 32, border: "1px solid rgba(255,255,255,0.08)",
          opacity: interpolate(frame, [15, 35], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
        }}>
          <div style={{
            fontFamily: poppinsFont, fontSize: 18, fontWeight: 700, color: "white", marginBottom: 20,
          }}>
            Product Input
          </div>
          {[
            { k: "Name", v: "Self-Cleaning Cat Litter Box" },
            { k: "Price", v: "$149.99" },
            { k: "Category", v: "Cat Supplies" },
            { k: "Image", v: "product-image.jpg" },
          ].map((item, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: interFont, fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
                {item.k}
              </div>
              <div style={{
                fontFamily: interFont, fontSize: 16, color: "rgba(255,255,255,0.8)",
                background: "rgba(255,255,255,0.06)", padding: "8px 14px", borderRadius: 8,
              }}>
                {item.v}
              </div>
            </div>
          ))}

          {/* Arrow */}
          <div style={{
            textAlign: "center", fontSize: 30, color: "#E8793B", marginTop: 20,
            opacity: interpolate(frame, [40, 55], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
          }}>
            →
          </div>
        </div>

        {/* Generated pins */}
        <div style={{ flex: 1, display: "flex", gap: 20 }}>
          {[
            { angle: "Problem → Solution", title: "Stop Scooping Litter Forever 🐱", hook: "Tired of the daily mess?" },
            { angle: "Curiosity", title: "This Changed Everything for Cat Owners", hook: "2000+ cat parents switched…" },
            { angle: "Lifestyle", title: "Why Cat Parents Love This Box ❤️", hook: "Built for busy pet parents" },
          ].map((pin, i) => {
            const s = spring({ frame: frame - 45 - i * 15, fps, config: { damping: 14 } });
            const y = interpolate(s, [0, 1], [40, 0]);
            return (
              <div key={i} style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                borderRadius: 16, padding: 24, border: "1px solid rgba(255,255,255,0.08)",
                transform: `translateY(${y}px) scale(${s})`,
              }}>
                <div style={{
                  fontFamily: interFont, fontSize: 11, fontWeight: 600,
                  color: "#E8793B", textTransform: "uppercase", letterSpacing: 1,
                  marginBottom: 12,
                }}>
                  {pin.angle}
                </div>
                {/* Mock pin image */}
                <div style={{
                  width: "100%", aspectRatio: "2/3", borderRadius: 12,
                  background: `linear-gradient(135deg, hsl(${25 + i * 15}, 60%, 35%), hsl(${35 + i * 15}, 50%, 25%))`,
                  marginBottom: 16, display: "flex", justifyContent: "center", alignItems: "center",
                  fontSize: 40,
                }}>
                  📌
                </div>
                <div style={{
                  fontFamily: poppinsFont, fontSize: 15, fontWeight: 700, color: "white",
                  marginBottom: 8, lineHeight: 1.3,
                }}>
                  {pin.title}
                </div>
                <div style={{
                  fontFamily: interFont, fontSize: 13, color: "rgba(255,255,255,0.5)",
                  lineHeight: 1.4,
                }}>
                  {pin.hook}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
