import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { MainVideoBestsellers } from "./MainVideoBestsellers";
import { MainVideoTop5 } from "./MainVideoTop5";

export const RemotionRoot = () => (
  <>
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
  </>
);
