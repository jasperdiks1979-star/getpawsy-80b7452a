import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Scene1Intro } from "./scenes/Scene1Intro";
import { Scene2OAuth } from "./scenes/Scene2OAuth";
import { Scene3Dashboard } from "./scenes/Scene3Dashboard";
import { Scene4PinCreation } from "./scenes/Scene4PinCreation";
import { Scene5Publishing } from "./scenes/Scene5Publishing";
import { Scene6Closing } from "./scenes/Scene6Closing";

export const MainVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const hueShift = interpolate(frame, [0, 630], [0, 18]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, 
          hsl(${220 + hueShift}, 12%, 7%) 0%, 
          hsl(${225 + hueShift}, 16%, 11%) 50%,
          hsl(${218 + hueShift}, 14%, 9%) 100%)`,
      }}
    >
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={105}>
          <Scene1Intro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={145}>
          <Scene2OAuth />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={120}>
          <Scene3Dashboard />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={105}>
          <Scene4PinCreation />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={115}>
          <Scene5Publishing />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={115}>
          <Scene6Closing />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
