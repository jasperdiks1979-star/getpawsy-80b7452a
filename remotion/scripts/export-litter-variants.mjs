/**
 * One-click export queue for the 3 TikTok litter-box ad variants.
 *
 * Pipeline per variant:
 *   1. Bundle Remotion project (once, reused)
 *   2. Render silent MP4 -> /tmp/litterbox-<vN>-silent.mp4
 *   3. Mux voiceover (250ms delay) + background music (10%) via ffmpeg
 *   4. Output -> /mnt/documents/getpawsy-litterbox-tiktok-<vN>.mp4
 *
 * Usage: node remotion/scripts/export-litter-variants.mjs
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
  { id: "litterbox-ad-v3", slug: "v3", angle: "time-saving",   duration: 19, vo: "litterbox-vo-v3.mp3" },
  { id: "litterbox-ad-v4", slug: "v4", angle: "pov-guests",    duration: 19, vo: "litterbox-vo-v4.mp3" },
  { id: "litterbox-ad-v5", slug: "v5", angle: "tech-demo",     duration: 17, vo: "litterbox-vo-v5.mp3" },
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
    "[1:a]volume=1.0,adelay=250|250,apad[vo];" +
    "[2:a]volume=0.10,aloop=loop=-1:size=2e9[mus];" +
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

      const silentPath = `/tmp/litterbox-${v.slug}-silent.mp4`;
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

      const outPath = path.join(OUT_DIR, `getpawsy-litterbox-tiktok-${v.slug}.mp4`);
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

  fs.writeFileSync(path.join(OUT_DIR, "tiktok-export-manifest.json"), JSON.stringify({
    exportedAt: new Date().toISOString(),
    totalSeconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
    variants: manifest,
  }, null, 2));

  log("─────────────────────────────────────");
  log(`done. ${manifest.length} files written to ${OUT_DIR}`);
  for (const m of manifest) log(`  • ${path.basename(m.file)}  (${m.sizeMb} MB, ${m.angle})`);
}

main().catch((e) => { console.error("[export] FAILED:", e); process.exit(1); });
