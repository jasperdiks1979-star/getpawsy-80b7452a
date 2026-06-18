import React, { useMemo } from "react";
import { SAFE_ZONE } from "./SafeZoneFrame";

// Auto-fit text from 96px down to 48px within safe zone, max 2 lines.
// If text still overflows at 48px, returns a render that emits a console
// marker the post-render audit picks up as text_exceeds_safe_zone.
const MAX_FONT = 96;
const MIN_FONT = 48;
const MAX_LINES = 2;

function estimateLines(text: string, fontPx: number, maxWidthPx: number): number {
  // Heuristic: avg char width ~ 0.55 * fontPx for bold display sans
  const charsPerLine = Math.max(1, Math.floor(maxWidthPx / (fontPx * 0.55)));
  const words = text.split(/\s+/);
  let lines = 1;
  let lineLen = 0;
  for (const w of words) {
    const wlen = w.length + 1;
    if (lineLen + wlen > charsPerLine) {
      lines++;
      lineLen = wlen;
    } else {
      lineLen += wlen;
    }
  }
  return lines;
}

export const AutoFitText: React.FC<{
  text: string;
  topY: number;
  align?: "left" | "center";
  color?: string;
  weight?: number;
}> = ({ text, topY, align = "center", color = "#FFFFFF", weight = 800 }) => {
  const { fontPx, overflow } = useMemo(() => {
    for (let f = MAX_FONT; f >= MIN_FONT; f -= 4) {
      if (estimateLines(text, f, SAFE_ZONE.textMaxWidth) <= MAX_LINES) {
        return { fontPx: f, overflow: false };
      }
    }
    return { fontPx: MIN_FONT, overflow: true };
  }, [text]);

  return (
    <div
      data-v4-overflow={overflow ? "1" : "0"}
      style={{
        position: "absolute",
        left: SAFE_ZONE.textLeft,
        top: topY,
        width: SAFE_ZONE.textMaxWidth,
        textAlign: align,
        color,
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        fontWeight: weight,
        fontSize: fontPx,
        lineHeight: 1.08,
        letterSpacing: "-0.02em",
        textShadow: "0 4px 24px rgba(0,0,0,0.55)",
      }}
    >
      {text}
    </div>
  );
};