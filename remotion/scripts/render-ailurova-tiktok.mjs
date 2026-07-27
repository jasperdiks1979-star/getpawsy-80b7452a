import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = "/mnt/documents/ailurova/tiktok";

console.log("[ailurova-tiktok] Bundling...");
const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (c) => c,
});

console.log("[ailurova-tiktok] Launching Chrome...");
const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
  chromeMode: "chrome-for-testing",
});

const composition = await selectComposition({
  serveUrl: bundled,
  id: "ailurova-tiktok",
  puppeteerInstance: browser,
});

console.log(`[ailurova-tiktok] ${composition.durationInFrames} frames @ ${composition.fps}fps → ${composition.width}x${composition.height}`);

// Cover (first frame)
await renderStill({
  composition,
  serveUrl: bundled,
  output: `${OUT_DIR}/cover-first-frame.jpg`,
  frame: 0,
  imageFormat: "jpeg",
  jpegQuality: 92,
  puppeteerInstance: browser,
});
console.log("[ailurova-tiktok] Cover frame saved.");

// Thumbnail — pick a strong mid-film hero moment (Scene 2 reveal, frame 90)
await renderStill({
  composition,
  serveUrl: bundled,
  output: `${OUT_DIR}/thumbnail.jpg`,
  frame: 90,
  imageFormat: "jpeg",
  jpegQuality: 92,
  puppeteerInstance: browser,
});
console.log("[ailurova-tiktok] Thumbnail saved.");

// Full render
await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  outputLocation: `${OUT_DIR}/ailurova-tiktok-launch.mp4`,
  puppeteerInstance: browser,
  muted: true,
  concurrency: 1,
  crf: 18,
});

console.log(`[ailurova-tiktok] MP4 → ${OUT_DIR}/ailurova-tiktok-launch.mp4`);
await browser.close({ silent: false });