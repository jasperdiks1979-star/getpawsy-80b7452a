import React from "react";
import { AbsoluteFill } from "remotion";

// 1080x1920 canvas. Safe vertical area: y=288..1536 (15% top reserve, 20% bottom reserve).
// Max usable text width: 864px (centered).
export const SAFE_ZONE = {
  width: 1080,
  height: 1920,
  topReserve: 288,
  bottomReserve: 384,
  safeTop: 288,
  safeBottom: 1536,
  textMaxWidth: 864,
  textLeft: (1080 - 864) / 2,
};

export const SafeZoneFrame: React.FC<{ children: React.ReactNode; debug?: boolean }> = ({
  children,
  debug = false,
}) => (
  <AbsoluteFill style={{ background: "#0B0B0F" }}>
    {children}
    {debug && (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: SAFE_ZONE.textLeft,
            top: SAFE_ZONE.safeTop,
            width: SAFE_ZONE.textMaxWidth,
            height: SAFE_ZONE.safeBottom - SAFE_ZONE.safeTop,
            border: "2px dashed rgba(0,255,170,0.5)",
          }}
        />
      </AbsoluteFill>
    )}
  </AbsoluteFill>
);