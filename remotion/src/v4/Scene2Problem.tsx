import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { SafeZoneFrame } from "./SafeZoneFrame";
import { AutoFitText } from "./AutoFitText";

export const Scene2Problem: React.FC<{ image?: string; problem: string }> = ({ image, problem }) => (
  <SafeZoneFrame>
    {image && (
      <AbsoluteFill>
        <Img src={image} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "saturate(0.8) brightness(0.85)" }} />
        <AbsoluteFill style={{ background: "linear-gradient(180deg,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.2) 50%,rgba(0,0,0,0.6) 100%)" }} />
      </AbsoluteFill>
    )}
    <AutoFitText text={problem} topY={420} />
  </SafeZoneFrame>
);