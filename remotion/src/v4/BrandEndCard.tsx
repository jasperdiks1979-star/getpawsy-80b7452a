import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { SAFE_ZONE } from "./SafeZoneFrame";
import { AutoFitText } from "./AutoFitText";

export const BrandEndCard: React.FC<{ cta: string; url?: string }> = ({ cta, url = "getpawsy.pet" }) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#0B0B0F 0%,#1A0F2E 100%)", opacity: fade }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 640,
          textAlign: "center",
          color: "#FFFFFF",
          fontFamily: "Inter, sans-serif",
          fontWeight: 900,
          fontSize: 72,
          letterSpacing: "-0.03em",
        }}
      >
        GetPawsy
      </div>
      <AutoFitText text={cta} topY={880} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1280,
          textAlign: "center",
          color: "#A78BFA",
          fontFamily: "Inter, sans-serif",
          fontWeight: 600,
          fontSize: 40,
        }}
      >
        {url}
      </div>
    </AbsoluteFill>
  );
};