import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { Scene1Reveal } from "./scenes/Scene1Reveal";
import { Scene2Hero } from "./scenes/Scene2Hero";
import { Scene3App } from "./scenes/Scene3App";
import { Scene4Statement } from "./scenes/Scene4Statement";
import { Scene5CTA } from "./scenes/Scene5CTA";

const PersistentBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const warmth = interpolate(frame, [0, durationInFrames], [0, 1]);
  const r = Math.round(245 + warmth * 3);
  const g = Math.round(241 + warmth * 2);
  const b = Math.round(232 - warmth * 4);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 30%, rgb(${r + 5}, ${g + 5}, ${b + 5}) 0%, rgb(${r}, ${g}, ${b}) 60%, rgb(${r - 8}, ${g - 8}, ${b - 8}) 100%)`,
      }}
    />
  );
};

const FilmGrain: React.FC = () => (
  <AbsoluteFill
    style={{
      opacity: 0.04,
      backgroundImage:
        "radial-gradient(circle at 20% 30%, #000 0.5px, transparent 1px), radial-gradient(circle at 70% 60%, #000 0.5px, transparent 1px), radial-gradient(circle at 40% 80%, #000 0.5px, transparent 1px)",
      backgroundSize: "3px 3px, 5px 5px, 4px 4px",
      pointerEvents: "none",
    }}
  />
);

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <PersistentBackground />
      <Series>
        <Series.Sequence durationInFrames={90}>
          <Scene1Reveal />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Scene2Hero />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Scene3App />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <Scene4Statement />
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <Scene5CTA />
        </Series.Sequence>
      </Series>
      <FilmGrain />
    </AbsoluteFill>
  );
};
