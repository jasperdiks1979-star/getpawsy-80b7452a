/**
 * Export the 3 NEW conversion-optimized TikTok variants:
 *   - conv-timepain  → getpawsy-tiktok-timepain.mp4   (~18s)
 *   - conv-smell     → getpawsy-tiktok-smell.mp4      (~17s)
 *   - conv-direct    → getpawsy-tiktok-direct.mp4     (~14s)
 *
 * Pipeline per variant:
 *   1. Bundle Remotion project once
 *   2. Render silent MP4 → /tmp/conv-<slug>-silent.mp4
 *   3. Mux ElevenLabs VO + background music via ffmpeg
 *   4. Output → /mnt/documents/getpawsy-tiktok-<slug>.mp4
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const ROOT = "/dev-server/remotion";
const OUT_DIR = "/mnt/documents";
const MUSIC = path.resolve(ROOT, "public/audio/music.mp3");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

const VARIANTS = [
  { id: "conv-timepain", slug: "timepain", angle: "time-pain",   duration: 18, vo: "litterbox-vo-timepain.mp3" },
  { id: "conv-smell",    slug: "smell",    angle: "smell-problem", duration: 17, vo: "litterbox-vo-smell.mp3" },
  { id: "conv-direct",   slug: "direct",   angle: "direct-buyer",  duration: 14, vo: "litterbox-vo-direct.mp3" },
];

const log = (m) => console.log(`[export] ${m}`);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => { stderr += d.toString(); });
    p.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}\n${stderr.slice(-1500)}`)));
  });
}

async function muxAudio({ silentPath, voPath, musicPath, durationSec, outPath }) {
  await run(FFMPEG, [
    "-y",
    "-i", silentPath,
    "-i", voPath,
    "-i", musicPath,
    "-filter_complex",
    "[1:a]volume=1.0,adelay=200|200,apad[vo];" +
    "[2:a]volume=0.09,aloop=loop=-1:size=2e9[mus];" +
    "[vo][mus]amix=inputs=2:duration=first:dropout_transition=0[a]",
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    "-t", String(durationSec),
    "-movflags", "+faststart",
    outPath,
  ]);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  log("bundling Remotion project (one-time)…");
  const bundled = await bundle({
    entryPoint: path.resolve(ROOT, "src/index.ts"),
    webpackOverride: (c) => c,
  });

  log("opening Chromium…");
  const browser = await openBrowser("chrome", {
    browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
    chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
    chromeMode: "chrome-for-testing",
  });

  const manifest = [];
  const t0 = Date.now();

  try {
    for (const v of VARIANTS) {
      const tStart = Date.now();
      log(`▶ ${v.slug} (${v.angle})…`);

      const composition = await selectComposition({
        serveUrl: bundled,
        id: v.id,
        puppeteerInstance: browser,
      });

      const silentPath = `/tmp/conv-${v.slug}-silent.mp4`;
      log(`  rendering ${composition.durationInFrames}f → ${silentPath}`);
      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: "h264",
        outputLocation: silentPath,
        puppeteerInstance: browser,
        muted: true,
        concurrency: 1,
      });

      const outPath = path.join(OUT_DIR, `getpawsy-tiktok-${v.slug}.mp4`);
      const voPath = path.resolve(ROOT, "public/audio", v.vo);
      log(`  muxing audio (vo + music) → ${outPath}`);
      await muxAudio({ silentPath, voPath, musicPath: MUSIC, durationSec: v.duration, outPath });

      const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
      const secs = ((Date.now() - tStart) / 1000).toFixed(1);
      log(`  ✓ ${v.slug} ${sizeMb} MB in ${secs}s`);
      manifest.push({ slug: v.slug, angle: v.angle, file: outPath, sizeMb: Number(sizeMb), seconds: Number(secs) });
    }
  } finally {
    await browser.close({ silent: false });
  }

  fs.writeFileSync(path.join(OUT_DIR, "tiktok-conversion-export-manifest.json"), JSON.stringify({
    exportedAt: new Date().toISOString(),
    totalSeconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
    variants: manifest,
  }, null, 2));

  log("─────────────────────────────────────");
  log(`done. ${manifest.length} files written to ${OUT_DIR}`);
  for (const m of manifest) log(`  • ${path.basename(m.file)}  (${m.sizeMb} MB, ${m.angle})`);
}

main().catch((e) => { console.error("[export] FAILED:", e); process.exit(1); });