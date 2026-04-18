import { AbsoluteFill, Series, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { T5Hook } from "./scenes/T5Hook";
import { T5Disclaimer } from "./scenes/T5Disclaimer";
import { T5Exhibit } from "./scenes/T5Exhibit";
import { T5Verdict } from "./scenes/T5Verdict";
import { T5CTA } from "./scenes/T5CTA";

// Mockumentary "Confessions of a Pet" — top 5 bestsellers.
// 44s @ 30fps = 1320 frames
// Hook 90 + Disclaimer 60 + 5×Exhibit(180) + Verdict 90 + CTA 180 = 1320

const PaperBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = interpolate(frame, [0, durationInFrames], [0, 1]);
  const r = Math.round(247 - t * 4);
  const g = Math.round(243 - t * 5);
  const b = Math.round(232 - t * 6);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 25%, rgb(${r + 4}, ${g + 4}, ${b + 4}) 0%, rgb(${r}, ${g}, ${b}) 55%, rgb(${r - 10}, ${g - 10}, ${b - 12}) 100%)`,
      }}
    />
  );
};

const PaperGrain: React.FC = () => (
  <AbsoluteFill
    style={{
      opacity: 0.06,
      mixBlendMode: "multiply",
      backgroundImage:
        "radial-gradient(circle at 20% 30%, #3a2a1a 0.6px, transparent 1.2px), radial-gradient(circle at 70% 60%, #3a2a1a 0.5px, transparent 1.1px), radial-gradient(circle at 40% 80%, #3a2a1a 0.6px, transparent 1.2px)",
      backgroundSize: "3px 3px, 5px 5px, 4px 4px",
      pointerEvents: "none",
    }}
  />
);

// Subtle camera shake — handheld documentary feel
const HandheldShake: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const x = Math.sin(frame * 0.11) * 2 + Math.sin(frame * 0.27) * 1.2;
  const y = Math.cos(frame * 0.09) * 1.6 + Math.sin(frame * 0.31) * 0.8;
  const r = Math.sin(frame * 0.07) * 0.12;
  return (
    <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px) rotate(${r}deg)` }}>
      {children}
    </AbsoluteFill>
  );
};

export const MainVideoTop5: React.FC = () => {
  return (
    <AbsoluteFill>
      <PaperBackground />

      {/* Background music — quiet documentary jazz feel */}
      <Audio src={staticFile("audio/music.mp3")} volume={0.06} />

      {/* Voice-over starts at frame 6 */}
      <Sequence from={6}>
        <Audio src={staticFile("audio/voiceover-top5.mp3")} volume={1.0} />
      </Sequence>

      <HandheldShake>
        <Series>
          {/* HOOK 0–90 (3s) */}
          <Series.Sequence durationInFrames={90}>
            <T5Hook />
          </Series.Sequence>

          {/* DISCLAIMER 90–150 (2s) — "the answers were concerning" */}
          <Series.Sequence durationInFrames={60}>
            <T5Disclaimer />
          </Series.Sequence>

          {/* 5 EXHIBITS — 180 frames each (6s) */}
          <Series.Sequence durationInFrames={180}>
            <T5Exhibit
              rank="05"
              exhibit="E"
              productName="The Cooling Bed"
              quote="the floor is hot, Brian."
              price="$127.99"
              imageSrc="images/top5/coolbed.jpg"
            />
          </Series.Sequence>

          <Series.Sequence durationInFrames={180}>
            <T5Exhibit
              rank="04"
              exhibit="D"
              productName="The Cactus Cat Tree"
              quote="your couch was never yours."
              price="$79.99"
              imageSrc="images/top5/cactustree.jpg"
            />
          </Series.Sequence>

          <Series.Sequence durationInFrames={180}>
            <T5Exhibit
              rank="03"
              exhibit="C"
              productName="The Pet Backpack"
              quote="we want to come. we don't want to walk."
              price="$79.99"
              imageSrc="images/top5/backpack.jpg"
            />
          </Series.Sequence>

          <Series.Sequence durationInFrames={180}>
            <T5Exhibit
              rank="02"
              exhibit="B"
              productName="The Car Bed"
              quote="we judge your driving in comfort."
              price="$59.99"
              imageSrc="images/top5/carbed.jpg"
            />
          </Series.Sequence>

          <Series.Sequence durationInFrames={180}>
            <T5Exhibit
              rank="01"
              exhibit="A"
              productName="The Self-Cleaning Litter Box"
              quote="tired of your nonsense."
              price="$268.99"
              imageSrc="images/top5/litterbox.png"
              isWinner
            />
          </Series.Sequence>

          {/* VERDICT 90 (3s) */}
          <Series.Sequence durationInFrames={90}>
            <T5Verdict />
          </Series.Sequence>

          {/* CTA 180 (6s) */}
          <Series.Sequence durationInFrames={180}>
            <T5CTA />
          </Series.Sequence>
        </Series>
      </HandheldShake>

      <PaperGrain />

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(40,25,10,0.18) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
