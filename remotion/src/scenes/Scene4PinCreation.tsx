import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { poppinsFont, interFont } from "../fonts";

export const Scene4PinCreation: React.FC = () => {
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
          Pinterest Pin Composer
        </div>
        <div style={{ fontFamily: poppinsFont, fontSize: 40, fontWeight: 700, color: "white" }}>
          Product data becomes publish-ready Pinterest creatives
        </div>
      </div>

      <div style={{ display: "flex", gap: 32, marginTop: 24 }}>
        {/* Product card */}
        <div style={{
          width: 320, background: "rgba(255,255,255,0.04)", borderRadius: 16,
          padding: 24, border: "1px solid rgba(255,255,255,0.07)",
          opacity: interpolate(frame, [12, 28], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
        }}>
          <div style={{ fontFamily: poppinsFont, fontSize: 15, fontWeight: 700, color: "white", marginBottom: 16 }}>
            Product Data
          </div>
          {[
            { k: "Name", v: "Self-Cleaning Cat Litter Box" },
            { k: "Price", v: "$149.99" },
            { k: "Category", v: "Cat Supplies" },
              { k: "Board", v: "Cat essentials" },
              { k: "Link", v: "getpawsy.pet/products/self-cleaning-cat-litter-box" },
          ].map((item, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: interFont, fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 3, textTransform: "uppercase", letterSpacing: 1 }}>
                {item.k}
              </div>
              <div style={{
                fontFamily: interFont, fontSize: 14, color: "rgba(255,255,255,0.75)",
                background: "rgba(255,255,255,0.05)", padding: "6px 10px", borderRadius: 6,
              }}>
                {item.v}
              </div>
            </div>
          ))}
        </div>

        {/* Arrow */}
        <div style={{
          display: "flex", alignItems: "center",
          opacity: interpolate(frame, [30, 42], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
        }}>
          <div style={{
            fontFamily: poppinsFont, fontSize: 14, color: "#E8793B", fontWeight: 600,
            writingMode: "vertical-rl" as const, textAlign: "center", letterSpacing: 2,
          }}>
            AI GENERATES
          </div>
          <div style={{ fontSize: 36, color: "#E8793B", marginLeft: 8 }}>→</div>
        </div>

        {/* Generated pin variants */}
        <div style={{ flex: 1, display: "flex", gap: 16 }}>
          {[
            { hook: "Problem → Solution", title: "Stop Scooping Litter Forever", desc: "Clear benefit, product image and destination URL for Pinterest" },
            { hook: "Curiosity", title: "Why Cat Owners Are Switching", desc: "Alternative hook generated from the same product record" },
            { hook: "Lifestyle", title: "Cleaner Home, Happier Cat", desc: "A third Pinterest-ready pin variant for testing" },
          ].map((pin, i) => {
            const s = spring({ frame: frame - 38 - i * 12, fps, config: { damping: 15 } });
            return (
              <div key={i} style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                borderRadius: 14, padding: 18, border: "1px solid rgba(255,255,255,0.07)",
                transform: `scale(${s})`, transformOrigin: "top center",
              }}>
                <div style={{
                  fontFamily: interFont, fontSize: 10, fontWeight: 600,
                  color: "#E8793B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10,
                }}>
                  {pin.hook}
                </div>
                <div style={{
                  width: "100%", aspectRatio: "2/3", borderRadius: 10,
                  background: `linear-gradient(135deg, hsl(${20 + i * 20}, 55%, 30%), hsl(${30 + i * 20}, 45%, 22%))`,
                  marginBottom: 12, display: "flex", justifyContent: "center", alignItems: "center",
                  fontSize: 32,
                }}>
                  🐱
                </div>
                <div style={{ fontFamily: poppinsFont, fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4, lineHeight: 1.3 }}>
                  {pin.title}
                </div>
                <div style={{ fontFamily: interFont, fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
                  {pin.desc}
                </div>
                <div style={{
                  marginTop: 8, fontFamily: interFont, fontSize: 10, color: "rgba(255,255,255,0.3)",
                }}>
                  → getpawsy.pet/products/self-cleaning-cat-litter-box
                </div>
                <div style={{
                  marginTop: 6,
                  display: "inline-flex",
                  padding: "4px 9px",
                  borderRadius: 999,
                  background: "rgba(230,0,35,0.1)",
                  color: "#FF6B81",
                  fontFamily: interFont,
                  fontSize: 10,
                  fontWeight: 600,
                }}>
                  Ready for Pinterest board posting
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
