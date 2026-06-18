import React from "react";
import { Sequence, AbsoluteFill } from "remotion";
import { z } from "zod";
import { Scene1Hook } from "./v4/Scene1Hook";
import { Scene2Problem } from "./v4/Scene2Problem";
import { Scene3Benefit } from "./v4/Scene3Benefit";
import { Scene4Feature } from "./v4/Scene4Feature";
import { Scene5CTA } from "./v4/Scene5CTA";

// 24s @ 30fps = 720 frames
// Scene durations (frames): 120 + 150 + 150 + 150 + 150 = 720
export const v4PropsSchema = z.object({
  script: z.object({
    hook: z.string(),
    problem: z.string(),
    benefit: z.string(),
    key_feature: z.string(),
    cta: z.string(),
  }),
  assets: z.object({
    hook: z.string().optional(),
    problem: z.string().optional(),
    benefit: z.string().optional(),
    feature: z.string().optional(),
  }),
  productUrl: z.string().optional(),
});

export type V4Props = z.infer<typeof v4PropsSchema>;

export const MainVideoV4: React.FC<V4Props> = ({ script, assets, productUrl }) => (
  <AbsoluteFill style={{ background: "#0B0B0F" }}>
    <Sequence from={0} durationInFrames={120}>
      <Scene1Hook image={assets.hook} hook={script.hook} />
    </Sequence>
    <Sequence from={120} durationInFrames={150}>
      <Scene2Problem image={assets.problem} problem={script.problem} />
    </Sequence>
    <Sequence from={270} durationInFrames={150}>
      <Scene3Benefit image={assets.benefit} benefit={script.benefit} />
    </Sequence>
    <Sequence from={420} durationInFrames={150}>
      <Scene4Feature image={assets.feature} feature={script.key_feature} />
    </Sequence>
    <Sequence from={570} durationInFrames={150}>
      <Scene5CTA cta={script.cta} url={productUrl} />
    </Sequence>
  </AbsoluteFill>
);