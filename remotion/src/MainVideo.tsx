import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Scene1Intro } from "./scenes/Scene1Intro";
import { Scene2OAuth } from "./scenes/Scene2OAuth";
import { Scene3Dashboard } from "./scenes/Scene3Dashboard";
import { Scene4PinCreation } from "./scenes/Scene4PinCreation";
import { Scene5Publishing } from "./scenes/Scene5Publishing";
import { Scene6Closing } from "./scenes/Scene6Closing";

export const MainVideo: React.FC = () => {
  const frame = useCurrentFrame();

  // Subtle animated gradient background
  const hueShift = interpolate(frame, [0, 750], [0, 30]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, 
          hsl(${220 + hueShift}, 15%, 8%) 0%, 
          hsl(${230 + hueShift}, 20%, 12%) 50%,
          hsl(${210 + hueShift}, 18%, 10%) 100%)`,
      }}
    >
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={140}>
          <Scene1Intro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={140}>
          <Scene2OAuth />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-left" })}
          timing={linearTiming({ durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={130}>
          <Scene3Dashboard />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={140}>
          <Scene4PinCreation />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={140}>
          <Scene5Publishing />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={160}>
          <Scene6Closing />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
