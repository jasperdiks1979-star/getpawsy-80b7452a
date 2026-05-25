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
import { CinematicProductDemo, cinematicDemoSchema } from "./cinematic/CinematicProductDemo";
import { CompilationReel, compilationSchema } from "./cinematic/CompilationReel";
import { UgcPovScene, ugcPovSchema } from "./cinematic/UgcPovScene";
import { LifestyleScene, lifestyleSchema } from "./cinematic/LifestyleScene";

export const RemotionRoot = () => (
  <>
    {/* ---------------- Cinematic v4 ---------------- */}
    <Composition
      id="cinematic-product-demo"
      component={CinematicProductDemo}
      durationInFrames={600}
      fps={30}
      width={1080}
      height={1920}
      schema={cinematicDemoSchema}
      defaultProps={{
        product: { name: "Self-Cleaning Litter Box", price: "$268.99", slug: "self-cleaning-litter-box" },
        scenes: [
          { beat: "HOOK" as const, image: "", caption: "Stop scooping. Forever.", durationFrames: 75 },
          { beat: "PROBLEM" as const, image: "", caption: "Litter boxes are gross.", durationFrames: 75 },
          { beat: "SOLUTION" as const, image: "", caption: "Meet the self-cleaning box.", durationFrames: 90 },
          { beat: "FEATURE" as const, image: "", caption: "App-controlled. Whisper quiet.", durationFrames: 90 },
          { beat: "PROOF" as const, image: "", caption: "Trusted by 12,000 cat parents.", durationFrames: 75 },
          { beat: "LIFESTYLE" as const, image: "", caption: "Clean. Calm. Effortless.", durationFrames: 75 },
          { beat: "CTA" as const, image: "", caption: "Tap to Shop.", durationFrames: 60 },
        ],
        cta: "Tap to Shop →",
      }}
      calculateMetadata={({ props }) => {
        const total = (props.scenes ?? []).reduce((a, s) => a + (s.durationFrames || 0), 0) + 90;
        return { durationInFrames: Math.max(120, total) };
      }}
    />
    <Composition
      id="cinematic-compilation"
      component={CompilationReel}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
      schema={compilationSchema}
      defaultProps={{
        title: "5 Cat Picks You'll Love",
        subtitle: "GetPawsy Picks",
        products: [],
        cta: "Tap to Shop →",
      }}
      calculateMetadata={({ props }) => {
        const productCount = (props.products ?? []).length || 5;
        return { durationInFrames: 75 + productCount * 120 + 90 };
      }}
    />
    <Composition
      id="cinematic-ugc-pov"
      component={UgcPovScene}
      durationInFrames={540}
      fps={30}
      width={1080}
      height={1920}
      schema={ugcPovSchema}
      defaultProps={{
        product: { name: "Premium Pet Product", price: "$99", slug: "premium" },
        beats: [
          { beat: "HOOK" as const, image: "", caption: "Wait — watch this.", durationFrames: 60 },
          { beat: "REACTION" as const, image: "", caption: "Okay this is unreal.", durationFrames: 75 },
          { beat: "DEMO" as const, image: "", caption: "Look how it works.", durationFrames: 105 },
          { beat: "PROOF" as const, image: "", caption: "12k+ five-star reviews.", durationFrames: 75 },
          { beat: "CTA" as const, image: "", caption: "Linked below.", durationFrames: 60 },
        ],
        cta: "Tap to Shop →",
      }}
      calculateMetadata={({ props }) => {
        const total = (props.beats ?? []).reduce((a, s) => a + (s.durationFrames || 0), 0) + 90;
        return { durationInFrames: Math.max(120, total) };
      }}
    />
    <Composition
      id="cinematic-lifestyle"
      component={LifestyleScene}
      durationInFrames={600}
      fps={30}
      width={1080}
      height={1920}
      schema={lifestyleSchema}
      defaultProps={{
        product: { name: "Premium Pet Product", price: "$99", slug: "premium" },
        scenes: [
          { image: "", caption: "Made for the way they live.", durationFrames: 120 },
          { image: "", caption: "Quiet. Calm. Beautiful.", durationFrames: 120 },
          { image: "", caption: "Designed for modern homes.", durationFrames: 120 },
        ],
        closingLine: "Made for the way they really live.",
        cta: "Tap to Shop →",
      }}
      calculateMetadata={({ props }) => {
        const total = (props.scenes ?? []).reduce((a, s) => a + (s.durationFrames || 0), 0) + 90 + 90;
        return { durationInFrames: Math.max(180, total) };
      }}
    />

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
