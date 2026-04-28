import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";

const root = "/dev-server/remotion";
const which = process.argv[2]; // v3, v4, v5
const ids = { v3: "litterbox-ad-v3", v4: "litterbox-ad-v4", v5: "litterbox-ad-v5" };
const id = ids[which];
if (!id) { console.error("Pass v3|v4|v5"); process.exit(1); }

const bundled = await bundle({ entryPoint: path.resolve(root, "src/index.ts"), webpackOverride: (c) => c });
const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
  chromeMode: "chrome-for-testing",
});
const composition = await selectComposition({ serveUrl: bundled, id, puppeteerInstance: browser });
console.log(`Rendering ${id}: ${composition.durationInFrames}f`);
await renderMedia({
  composition, serveUrl: bundled, codec: "h264",
  outputLocation: `/tmp/litterbox-${which}-silent.mp4`,
  puppeteerInstance: browser, muted: true, concurrency: 1,
});
await browser.close({ silent: false });
console.log("OK", which);
