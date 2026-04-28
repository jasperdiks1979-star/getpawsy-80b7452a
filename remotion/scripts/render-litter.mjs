import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";

const root = "/dev-server/remotion";
const bundled = await bundle({ entryPoint: path.resolve(root, "src/index.ts"), webpackOverride: (c) => c });
const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
  chromeMode: "chrome-for-testing",
});
const composition = await selectComposition({ serveUrl: bundled, id: "litterbox-ad", puppeteerInstance: browser });
console.log(`Rendering ${composition.durationInFrames}f @ ${composition.fps}fps`);
await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  outputLocation: "/tmp/litterbox-silent.mp4",
  puppeteerInstance: browser,
  muted: true,
  concurrency: 1,
});
await browser.close({ silent: false });
console.log("OK");
