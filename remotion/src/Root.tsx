import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { MainVideoBestsellers } from "./MainVideoBestsellers";
import { MainVideoTop5 } from "./MainVideoTop5";
import { MainVideoTikTokAd } from "./MainVideoTikTokAd";
import { MainVideoLitterBox } from "./MainVideoLitterBox";
import { MainVideoLitterBoxV2 } from "./MainVideoLitterBoxV2";
import { MainVideoLitterBoxV3 } from "./MainVideoLitterBoxV3";
import { MainVideoLitterBoxV4 } from "./MainVideoLitterBoxV4";
import { MainVideoLitterBoxV5 } from "./MainVideoLitterBoxV5";
import { MainVideoTimePain } from "./MainVideoTimePain";
import { MainVideoSmellProblem } from "./MainVideoSmellProblem";
import { MainVideoDirectBuyer } from "./MainVideoDirectBuyer";
import { MainVideoViralVertical, viralPropsSchema } from "./MainVideoViralVertical";

export const RemotionRoot = () => (
  <>
    <Composition
      id="viral-vertical"
      component={MainVideoViralVertical}
      durationInFrames={540}
      fps={30}
      width={1080}
      height={1920}
      schema={viralPropsSchema}
      defaultProps={{
        preset: "pin-organic" as const,
        hook: "Stop scooping. Forever.",
        subhook: "The litter box that cleans itself.",
        cta: "Tap to Shop →",
        ctaUrl: "https://getpawsy.pet",
        product: { name: "Self-Cleaning Litter Box", price: "$268.99", slug: "automatic-cat-litter-box-self-cleaning-app-control" },
        media: [],
        debug: false,
        disclosure: false,
        hookByFrame: 24,
        ctaHoldFrames: 120,
      }}
      calculateMetadata={({ props }) => {
        const map: Record<string, number> = {
          "pin-organic": 18 * 30,
          "pin-ads": 22 * 30,
          "tt-organic": 18 * 30,
          "tt-spark": 22 * 30,
        };
        return { durationInFrames: map[(props as any).preset] ?? 540 };
      }}
    />
    <Composition
      id="main"
      component={MainVideo}
      durationInFrames={660}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="bestsellers"
      component={MainVideoBestsellers}
      durationInFrames={750}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="top5"
      component={MainVideoTop5}
      durationInFrames={1320}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="tiktok-ad"
      component={MainVideoTikTokAd}
      durationInFrames={810}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="litterbox-ad"
      component={MainVideoLitterBox}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="litterbox-ad-v2"
      component={MainVideoLitterBoxV2}
      durationInFrames={660}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="litterbox-ad-v3"
      component={MainVideoLitterBoxV3}
      durationInFrames={570}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="litterbox-ad-v4"
      component={MainVideoLitterBoxV4}
      durationInFrames={560}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="litterbox-ad-v5"
      component={MainVideoLitterBoxV5}
      durationInFrames={510}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="conv-timepain"
      component={MainVideoTimePain}
      durationInFrames={540}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="conv-smell"
      component={MainVideoSmellProblem}
      durationInFrames={510}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="conv-direct"
      component={MainVideoDirectBuyer}
      durationInFrames={420}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
