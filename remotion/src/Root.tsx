import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// Litter Box TikTok: 9:16 vertical, 30fps, 22 seconds = 660 frames
// Voice-over starts at frame 15 (0.5s in), ends ~frame 580; CTA breathes ~3s
export const RemotionRoot = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={660}
    fps={30}
    width={1080}
    height={1920}
  />
);
