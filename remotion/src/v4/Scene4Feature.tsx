import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { SafeZoneFrame } from "./SafeZoneFrame";
import { AutoFitText } from "./AutoFitText";

export const Scene4Feature: React.FC<{ image?: string; feature: string }> = ({ image, feature }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 120], [1.18, 1.28], { extrapolateRight: "clamp" });
  return (
    <SafeZoneFrame>
      {image && (
        <AbsoluteFill>
          <Img src={image} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
          <AbsoluteFill style={{ background: "linear-gradient(180deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,0.8) 100%)" }} />
        </AbsoluteFill>
      )}
      <AutoFitText text={feature} topY={1120} />
    </SafeZoneFrame>
  );
};