import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { SafeZoneFrame } from "./SafeZoneFrame";
import { AutoFitText } from "./AutoFitText";

export const Scene3Benefit: React.FC<{ image?: string; benefit: string }> = ({ image, benefit }) => (
  <SafeZoneFrame>
    {image && (
      <AbsoluteFill>
        <Img src={image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <AbsoluteFill style={{ background: "linear-gradient(180deg,rgba(0,0,0,0.15) 0%,rgba(0,0,0,0) 35%,rgba(0,0,0,0.7) 100%)" }} />
      </AbsoluteFill>
    )}
    <AutoFitText text={benefit} topY={1080} />
  </SafeZoneFrame>
);