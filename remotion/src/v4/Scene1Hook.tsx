import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { SafeZoneFrame } from "./SafeZoneFrame";
import { AutoFitText } from "./AutoFitText";

export const Scene1Hook: React.FC<{ image?: string; hook: string }> = ({ image, hook }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 120], [1.05, 1.12], { extrapolateRight: "clamp" });
  return (
    <SafeZoneFrame>
      {image && (
        <AbsoluteFill>
          <Img src={image} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
          <AbsoluteFill style={{ background: "linear-gradient(180deg,rgba(0,0,0,0.55) 0%,rgba(0,0,0,0.15) 40%,rgba(0,0,0,0.75) 100%)" }} />
        </AbsoluteFill>
      )}
      <AutoFitText text={hook} topY={360} />
    </SafeZoneFrame>
  );
};