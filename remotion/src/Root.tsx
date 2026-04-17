import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// Litter Box TikTok: 9:16 vertical, 30fps, 18 seconds = 540 frames
export const RemotionRoot = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={540}
    fps={30}
    width={1080}
    height={1920}
  />
);
