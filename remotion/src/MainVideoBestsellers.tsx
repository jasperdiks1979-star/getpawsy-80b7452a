import { AbsoluteFill, Series, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { BSScene1Hook } from "./scenes/BSScene1Hook";
import { BSProductCard } from "./scenes/BSProductCard";
import { BSSceneCTA } from "./scenes/BSSceneCTA";

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

// Bestsellers showcase: 25 seconds @ 30fps = 750 frames
// Hook 105 + 4 products × 120 = 480 + CTA 165 = 750
export const MainVideoBestsellers: React.FC = () => {
  return (
    <AbsoluteFill>
      <PersistentBackground />

      {/* Background music — soft and warm */}
      <Audio src={staticFile("audio/music.mp3")} volume={0.085} />

      {/* Voice-over starts at frame 12 (~0.4s in) */}
      <Sequence from={12}>
        <Audio src={staticFile("audio/voiceover.mp3")} volume={1.0} />
      </Sequence>

      <Series>
        <Series.Sequence durationInFrames={105}>
          <BSScene1Hook />
        </Series.Sequence>

        <Series.Sequence durationInFrames={120}>
          <BSProductCard
            number="01"
            category="litter, solved"
            productName="Self-Cleaning Litter Box"
            benefit="Automatic cleaning. App control. Goodbye, daily scoop."
            price="$268.99"
            imageSrc="images/bestsellers/litterbox.png"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={120}>
          <BSProductCard
            number="02"
            category="cool, calm rest"
            productName="Elevated Cooling Dog Bed"
            benefit="Breathable mesh that lifts your pup off the heat — for the lazy afternoons they deserve."
            price="$127.99"
            imageSrc="images/bestsellers/dogbed.jpg"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={120}>
          <BSProductCard
            number="03"
            category="vertical playground"
            productName="Multi-Level Cat Tree"
            benefit="Sisal posts, a cozy condo, and a hammock at the top — your cat's new favorite room."
            price="$128.99"
            imageSrc="images/bestsellers/cattree.jpg"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={120}>
          <BSProductCard
            number="04"
            category="hidden in plain sight"
            productName="Litter Box Furniture Enclosure"
            benefit="A barn-door enclosure that turns the litter box into beautiful, quiet furniture."
            price="$176.99"
            imageSrc="images/bestsellers/enclosure.jpg"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={165}>
          <BSSceneCTA />
        </Series.Sequence>
      </Series>

      <FilmGrain />
    </AbsoluteFill>
  );
};
