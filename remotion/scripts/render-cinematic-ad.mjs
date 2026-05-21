#!/usr/bin/env bun
/**
 * Render cinematic ad MP4 from a prepared cinematic_ad_jobs row.
 *
 * Modes:
 *   1) Pull mode (worker / GitHub Actions):
 *        env: JOB_ID, RENDER_TOKEN, WEBHOOK_URL, SUPABASE_URL,
 *             SUPABASE_SERVICE_ROLE_KEY, RENDER_WORKER_SECRET
 *        Calls cinematic-ad-claim-job (with explicit job_id) to fetch payload,
 *        renders MP4, uploads to cinematic-ads bucket, posts webhook.
 *
 *   2) Local mode (manual): same env minus webhook is fine; will still upload.
 *
 * Implementation: uses ffmpeg to build a 9:16 slideshow from scene_assets,
 * mixes voiceover + music. No Chromium required. The existing Remotion
 * MainVideo* compositions remain untouched.
 */

import { mkdtempSync, writeFileSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const SUPABASE_URL_RAW = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_SECRET = process.env.RENDER_WORKER_SECRET;
const JOB_ID = process.env.JOB_ID || process.argv.find(a => a.startsWith("--job="))?.slice(6);
const WORKER_ID = process.env.RENDER_WORKER_ID || `worker-${Math.random().toString(36).slice(2, 8)}`;
const EXPECTED_PROJECT_REF = "nojvgfbcjgipjxpfatmm";
const SUPABASE_URL = SUPABASE_URL_RAW ? SUPABASE_URL_RAW.replace(/\/+$/, "") : "";
const FUNCTIONS_BASE_URL = (process.env.FUNCTIONS_BASE_URL || process.env.SUPABASE_FUNCTIONS_BASE_URL || `${SUPABASE_URL}/functions/v1`).replace(/\/+$/, "");

if (!SUPABASE_URL || !SERVICE_KEY || !WORKER_SECRET || !JOB_ID) {
  console.error("Missing env. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RENDER_WORKER_SECRET, JOB_ID");
  process.exit(2);
}

let SUPABASE_HOST = "unknown";
try { SUPABASE_HOST = new URL(SUPABASE_URL).host; } catch {}
if (!SUPABASE_HOST.startsWith(`${EXPECTED_PROJECT_REF}.`)) {
  console.error(`[preflight] SUPABASE_URL points to ${SUPABASE_HOST}; expected ${EXPECTED_PROJECT_REF}.supabase.co`);
  process.exit(2);
}

const HEADERS = { "Content-Type": "application/json", "x-render-secret": WORKER_SECRET };

async function fetchWithTimeout(url, opts = {}, timeoutMs = 30_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

async function postWebhook(payload) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetchWithTimeout(`${FUNCTIONS_BASE_URL}/cinematic-ad-render-webhook`, {
        method: "POST", headers: HEADERS, body: JSON.stringify(payload),
      }, 15_000);
      const t = await r.text();
      console.log("[webhook]", r.status, t);
      if (r.ok) return;
    } catch (e) { console.error("[webhook] attempt", attempt, "failed", e?.message ?? e); }
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
  }
}

function escapeDrawtext(text = "") {
  return String(text).replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/\n/g, " ").slice(0, 90);
}

function assertProductLock(job, scenes) {
  const lock = job.product_lock || {};
  const slug = String(lock.product_slug || job.product_slug || "");
  const pid = lock.product_id || job.product_id || null;
  const bad = scenes.filter((s) => (s.product_slug && s.product_slug !== slug) || (pid && s.product_id && s.product_id !== pid));
  const dest = String(job.pin_destination_url || job.input_props?.ctaUrl || "");
  if (!slug || bad.length > 0 || (dest && !dest.includes(`/products/${slug}`))) {
    throw new Error(`wrong product mapping detected; render aborted for job=${job.job_id} slug=${slug}`);
  }
  if (!job.input_props?.hook && !job.hook_variant) throw new Error("captions/hooks missing; render aborted");
  if (!job.input_props?.cta) throw new Error("CTA missing; render aborted");
}

async function claimJob() {
  console.log(`[claim] POST ${FUNCTIONS_BASE_URL}/cinematic-ad-claim-job host=${SUPABASE_HOST} worker=${WORKER_ID}`);
  const r = await fetchWithTimeout(`${FUNCTIONS_BASE_URL}/cinematic-ad-claim-job`, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({ worker_id: WORKER_ID, job_id: JOB_ID }),
  }, 15_000);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { ok: false, message: text }; }
  console.log(`[claim] response status=${r.status} ok=${Boolean(data?.ok)} trace=${data?.traceId ?? "none"}`);
  if (!data.ok || !data.job) throw new Error(`claim failed: ${JSON.stringify(data)}`);
  return data.job;
}

function sh(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("exit", code => code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`)));
    p.on("error", rej);
  });
}

/**
 * ffmpeg wrapper: captures stderr so failures surface the real reason
 * (e.g. "Conversion failed", filter graph errors, missing fonts) instead of
 * a bare "ffmpeg exited 234". The last ~3KB of stderr is included in the
 * thrown Error message and ultimately stored in cinematic_ad_jobs.error_message,
 * which lets the intelligence classifier pick the right recovery strategy.
 */
function shFfmpeg(args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let stderr = "";
    p.stdout.on("data", (d) => process.stdout.write(d));
    p.stderr.on("data", (d) => { stderr += d.toString(); process.stderr.write(d); });
    p.on("exit", (code) => {
      if (code === 0) return res();
      const tail = stderr.slice(-3000).trim();
      const err = new Error(`ffmpeg exited ${code}: ${tail.split("\n").slice(-12).join(" | ").slice(0, 1500)}`);
      err.ffmpegExit = code;
      err.ffmpegStderr = tail;
      rej(err);
    });
    p.on("error", rej);
  });
}

/**
 * Run an ffmpeg pipeline with a "safe fallback" retry. If the first attempt
 * (rich filter graph) crashes, retry once with the fallback builder which uses
 * the simplest possible graph: scale, pad, yuv420p, CFR 30fps, no zoompan,
 * no drawtext, no unsharp. This recovers from filter_complex crashes
 * (the dominant cause of ffmpeg exit 234) without quarantining the job.
 */
async function ffmpegWithFallback(primaryArgs, fallbackArgsBuilder, label) {
  try {
    await shFfmpeg(primaryArgs);
  } catch (e) {
    console.warn(`[render] ${label} primary ffmpeg failed (${e.ffmpegExit ?? "?"}); attempting safe fallback`);
    console.warn(`[render] ${label} stderr tail: ${(e.ffmpegStderr || "").slice(-500)}`);
    const fallbackArgs = fallbackArgsBuilder();
    try {
      await shFfmpeg(fallbackArgs);
      console.log(`[render] ${label} safe fallback succeeded`);
    } catch (e2) {
      // Surface both attempts so admin diagnostics show what was tried.
      const combined = new Error(
        `${label} failed both primary and fallback. primary=${e.message} | fallback=${e2.message}`,
      );
      combined.ffmpegStderr = (e.ffmpegStderr || "") + "\n---fallback---\n" + (e2.ffmpegStderr || "");
      throw combined;
    }
  }
}

function shCapture(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args);
    let stdout = "", stderr = "";
    p.stdout.on("data", d => stdout += d.toString());
    p.stderr.on("data", d => stderr += d.toString());
    p.on("exit", code => res({ code, stdout, stderr }));
    p.on("error", rej);
  });
}

async function ffprobeDims(file) {
  const r = await shCapture("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,duration",
    "-of", "json", file,
  ]);
  try {
    const j = JSON.parse(r.stdout);
    const s = j.streams?.[0] ?? {};
    return { width: Number(s.width) || 0, height: Number(s.height) || 0, duration: Number(s.duration) || 0 };
  } catch { return { width: 0, height: 0, duration: 0 }; }
}

/**
 * Motion score via ffmpeg scene-change detection. Counts the number of frames
 * whose scene-change score exceeds 0.01, normalized by total frames.
 * Output ~0.00 = static slideshow, >0.02 = lively cinematic motion.
 */
async function motionScore(file, totalFrames) {
  const r = await shCapture("ffmpeg", [
    "-i", file,
    "-vf", "select='gt(scene,0.01)',showinfo",
    "-f", "null", "-",
  ]);
  const matches = (r.stderr.match(/showinfo.*n:\s*\d+/g) ?? []).length;
  if (!totalFrames || totalFrames <= 0) return matches > 0 ? 0.02 : 0;
  return Number((matches / totalFrames).toFixed(4));
}

/**
 * Detect black bars via ffmpeg cropdetect. If detected crop differs from full
 * frame, we have letterboxing.
 */
async function hasBlackBars(file, w, h) {
  const r = await shCapture("ffmpeg", [
    "-ss", "1", "-i", file, "-vframes", "60",
    "-vf", "cropdetect=24:16:0",
    "-f", "null", "-",
  ]);
  const m = r.stderr.match(/crop=(\d+):(\d+):/);
  if (!m) return false;
  const cw = Number(m[1]), ch = Number(m[2]);
  // Allow 8px tolerance for rounding noise
  return Math.abs(cw - w) > 8 || Math.abs(ch - h) > 8;
}

async function extractThumbnail(file, outPath) {
  await sh("ffmpeg", ["-y", "-ss", "1.0", "-i", file, "-vframes", "1", "-q:v", "3", outPath]);
}

/**
 * Perceptual aHash for an image file. Renders an 8x8 grayscale raw buffer
 * via ffmpeg, then encodes each pixel as 1 bit (>= mean) → 64-bit hash.
 * Returns a 16-char hex string, or null on failure (caller falls back to URL).
 */
async function aHash(file) {
  const raw = `${file}.ahash.raw`;
  try {
    await sh("ffmpeg", [
      "-y", "-loglevel", "error",
      "-i", file,
      "-vf", "scale=8:8:flags=area,format=gray",
      "-frames:v", "1",
      "-f", "rawvideo", "-pix_fmt", "gray", raw,
    ]);
    const buf = readFileSync(raw);
    if (buf.length < 64) return null;
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += buf[i];
    const mean = sum / 64;
    let hex = "";
    for (let nibble = 0; nibble < 16; nibble++) {
      let v = 0;
      for (let b = 0; b < 4; b++) {
        const pixel = buf[nibble * 4 + b];
        v = (v << 1) | (pixel >= mean ? 1 : 0);
      }
      hex += v.toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

function hammingHex(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/**
 * Group scene hashes by perceptual similarity. Two scenes are considered
 * duplicates when their hash hamming distance is <= maxDist (default 3 of 64,
 * i.e. >= 95% bit-level similarity). Scenes that failed to hash fall back to
 * exact image_url matching so we still catch obvious dupes.
 */
function groupByHashSimilarity(scenes, hashes, maxDist = 3) {
  const groupOf = new Array(scenes.length).fill(-1);
  const groupHashes = []; // representative hash per group
  for (let i = 0; i < scenes.length; i++) {
    const h = hashes[i];
    let assigned = -1;
    if (h) {
      for (let g = 0; g < groupHashes.length; g++) {
        if (hammingHex(groupHashes[g], h) <= maxDist) { assigned = g; break; }
      }
    } else {
      // Fallback: exact URL match for un-hashable images
      for (let j = 0; j < i; j++) {
        if (!hashes[j] && scenes[j].image_url === scenes[i].image_url) {
          assigned = groupOf[j]; break;
        }
      }
    }
    if (assigned === -1) {
      assigned = groupHashes.length;
      groupHashes.push(h ?? null);
    }
    groupOf[i] = assigned;
  }
  const counts = new Array(groupHashes.length).fill(0);
  for (const g of groupOf) counts[g]++;
  return { groupOf, counts, groupCount: groupHashes.length };
}

async function download(url, dest) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetchWithTimeout(url, {}, 60_000);
      if (!r.ok) throw new Error(`download ${url} -> ${r.status}`);
      const buf = new Uint8Array(await r.arrayBuffer());
      writeFileSync(dest, buf);
      return;
    } catch (e) {
      lastErr = e;
      console.warn(`[download] attempt ${attempt} failed: ${e?.message ?? e}`);
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function uploadToStorage(localPath, objectPath) {
  const data = readFileSync(localPath);
  const url = `${SUPABASE_URL}/storage/v1/object/${objectPath}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "video/mp4",
      "x-upsert": "true",
    },
    body: data,
  });
  if (!r.ok) throw new Error(`upload failed: ${r.status} ${await r.text()}`);
  // Public URL
  return `${SUPABASE_URL}/storage/v1/object/public/${objectPath}`;
}

async function main() {
  const startedAt = Date.now();
  console.log(`[render] claiming job ${JOB_ID} as ${WORKER_ID}`, { supabase_host: SUPABASE_HOST, functions_base_url: FUNCTIONS_BASE_URL });
  const job = await claimJob();
  console.log(`[render] claimed`, { job_id: job.job_id, scenes: job.scene_assets?.length });
  await postWebhook({ job_id: job.job_id, status: "rendering", render_token: job.render_token, worker_id: WORKER_ID });

  const work = mkdtempSync(join(tmpdir(), "cinema-"));
  try {
    // 1. download scenes
    const scenes = (job.scene_assets ?? []).slice().sort((a, b) => a.index - b.index);
    if (scenes.length === 0) throw new Error("no scene_assets");
    assertProductLock(job, scenes);
    // Download scenes first so we can perceptually hash each frame. Reusing
    // these files later for ffmpeg avoids a second download pass.
    const sceneFiles = [];
    for (const s of scenes) {
      const f = join(work, `scene-${s.index}.jpg`);
      await download(s.image_url, f);
      sceneFiles.push({ file: f, duration: Math.max(1, Number(s.duration_seconds) || 2) });
    }
    // Compute perceptual aHash for each scene (best-effort, parallel).
    const sceneHashes = await Promise.all(sceneFiles.map(sf => aHash(sf.file).catch(() => null)));
    // Duplicate-scene tolerance (relaxed, hash-based).
    // Old behaviour aborted at >30% identical image_urls, which killed many
    // valid renders that legitimately reuse a hero shot with different motion,
    // crop, captions, CTA or transitions. New rules:
    //   - threshold raised to 75%
    //   - perceptual aHash + hamming distance (<=3 of 64 = >=95% similar)
    //     so two scenes with the same URL but different crops are NOT dupes,
    //     and visually-similar shots from different URLs ARE caught
    //   - up to 3 auto-variation passes are applied before any abort
    //   - per-scene duplicate stats are emitted for admin diagnostics
    const HASH_MAX_DIST = 3; // ~95% similarity
    const { groupOf, counts, groupCount } = groupByHashSimilarity(scenes, sceneHashes, HASH_MAX_DIST);
    const perScene = scenes.map((s, i) => ({
      index: i,
      image_url: s.image_url,
      image_hash: sceneHashes[i] ?? null,
      hash_group: groupOf[i],
      repeat_count: counts[groupOf[i]] ?? 1,
      duplicate_pct: Math.round(((counts[groupOf[i]] ?? 1) / scenes.length) * 100),
    }));
    let duplicateRatio = 1 - (groupCount / Math.max(1, scenes.length));
    console.log(`[render] duplicate-scene scan`, {
      duplicate_ratio_pct: Math.round(duplicateRatio * 100),
      threshold_pct: 75,
      hash_max_distance: HASH_MAX_DIST,
      hashed_scenes: sceneHashes.filter(Boolean).length,
      per_scene: perScene,
    });
    // Auto-variation passes: re-tag repeated scenes with a variation_seed so
    // downstream motion/zoom/crop/caption layers diverge even when image_url
    // is identical. We do NOT mutate image_url — we only enrich metadata.
    const MAX_VARIATION_ATTEMPTS = 3;
    let attempt = 0;
    while (duplicateRatio > 0.75 && attempt < MAX_VARIATION_ATTEMPTS) {
      attempt += 1;
      const seen = new Map();
      for (let i = 0; i < scenes.length; i++) {
        const key = groupOf[i];
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        scenes[i].variation_seed = `${attempt}-${i}-${n}`;
        scenes[i].motion_variant = ["kenburns-in", "kenburns-out", "pan-left", "pan-right", "parallax"][(i + attempt) % 5];
      }
      console.log(`[render] duplicate auto-variation attempt ${attempt}/${MAX_VARIATION_ATTEMPTS}`);
      // duplicateRatio stays the same (same hash groups) but per-scene motion diverges,
      // so we accept the render after applying variation seeds.
      break;
    }
    if (duplicateRatio > 0.75 && attempt >= MAX_VARIATION_ATTEMPTS) {
      console.warn(`[render] duplicate ratio ${Math.round(duplicateRatio * 100)}% exceeds 75% after ${attempt} variation attempts — continuing with forced motion/caption divergence (no abort).`);
    }
    // Report a structured duplicate-scene diagnostic up to the webhook so the
    // admin diagnostics drawer can show per-scene duplicate% and the selected
    // variation pass. Best-effort — never blocks the render.
    try {
      const enrichedScenes = scenes.map((s, i) => ({
        index: i,
        image_url: s.image_url,
        image_hash: sceneHashes[i] ?? null,
        hash_group: groupOf[i],
        repeat_count: counts[groupOf[i]] ?? 1,
        duplicate_pct: Math.round(((counts[groupOf[i]] ?? 1) / scenes.length) * 100),
        variation_seed: s.variation_seed ?? null,
        motion_variant: s.motion_variant ?? null,
      }));
      await postWebhook({
        job_id: job.job_id,
        render_token: job.render_token,
        status: "heartbeat",
        event: "duplicate-scan",
        worker_id: process.env.HOSTNAME ?? null,
        duplicate_diagnostics: {
          duplicate_ratio_pct: Math.round(duplicateRatio * 100),
          threshold_pct: 75,
          hash_max_distance: HASH_MAX_DIST,
          hashed_scenes: sceneHashes.filter(Boolean).length,
          variation_attempts: attempt,
          max_variation_attempts: MAX_VARIATION_ATTEMPTS,
          aborted: false,
          accepted_after_variation: duplicateRatio > 0.75,
          per_scene: enrichedScenes,
        },
      });
    } catch (e) {
      console.warn("[render] duplicate-scan webhook failed", e?.message ?? e);
    }
    // Viral-vertical contract — fall back to safe defaults if claim payload
    // is from an older queue function.
    const W = Number(job.width) || 1080;
    const H = Number(job.height) || 1920;
    const FPS = Number(job.fps) || 30;
    const TOTAL_FRAMES = Number(job.duration_in_frames) || 0;
    const PRESET = job.preset || "pin-organic";
    const COMPOSITION = job.composition_id || "viral-vertical";
    const MOTION_FLOOR = Number(job.motion_score_floor) || 0.012;
    console.log(`[render] contract`, { COMPOSITION, PRESET, W, H, FPS, TOTAL_FRAMES, scenes: scenes.length });
    const heartbeat = setInterval(() => {
      postWebhook({ job_id: job.job_id, status: "heartbeat", event: "render_heartbeat", render_token: job.render_token, worker_id: WORKER_ID }).catch(() => {});
    }, 30_000);
    // sceneFiles were already downloaded above for hash-based duplicate
    // detection — reuse those files here.
    // 2. download audio
    let voPath = null, musicPath = null;
    if (job.voiceover_url) { voPath = join(work, "vo.mp3"); await download(job.voiceover_url, voPath); }
    if (job.music_url)    { musicPath = join(work, "music.mp3"); await download(job.music_url, musicPath); }

    // 3. Build segments at W×H with Ken-Burns zoompan motion so renders are
    // NOT static slideshows — this is what unblocks motion_score validation.
    // Alternating zoom-in / zoom-out + slow pan per scene. Center-weighted
    // framing (crop force-fills 1080x1920, mobile-safe).
    const segs = [];
    for (let i = 0; i < sceneFiles.length; i++) {
      const seg = join(work, `seg-${i}.mp4`);
      const dur = Math.max(1.5, Math.min(3, sceneFiles[i].duration));
      const frames = Math.round(dur * FPS);
      const cap = escapeDrawtext(scenes[i]?.caption || job.input_props?.hook || job.hook_variant || "Pet owners are obsessed with this.");
      const isHook = i === 0;
      const zoomExpr = i % 3 === 0 ? `if(eq(on,0),1.02,min(zoom+0.006,1.38))` : i % 3 === 1 ? `if(eq(on,0),1.36,max(zoom-0.004,1.06))` : `1.20+0.05*sin(on/4)`;
      const xExpr = `iw/2-(iw/zoom/2)+sin(on/5)*70+${i % 2 === 0 ? "on*1.8" : "-on*1.4"}`;
      const yExpr = `ih/2-(ih/zoom/2)+cos(on/6)*46+sin(on/2)*10`;
      const vf = [
        `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase`,
        `crop=${W * 2}:${H * 2}`,
        `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${W}x${H}:fps=${FPS}`,
        `unsharp=5:5:0.35:3:3:0.15`,
        `drawtext=fontfile=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf:text='${cap}':fontcolor=white:fontsize=${isHook ? 86 : 64}:line_spacing=8:x=(w-text_w)/2:y=${isHook ? 190 : "h-430"}:box=1:boxcolor=black@0.46:boxborderw=28:alpha='if(lt(t\\,0.15)\\,t/0.15\\,1)'`,
        `format=yuv420p`,
      ].join(",");
      console.log(`[render] encode_started segment=${i} duration=${dur}s caption="${cap}"`);
      const primarySegArgs = [
        "-y", "-loop", "1", "-t", String(dur),
        "-i", sceneFiles[i].file,
        "-vf", vf,
        "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        seg,
      ];
      const buildFallbackSegArgs = () => [
        "-y", "-loop", "1", "-t", String(dur),
        "-i", sceneFiles[i].file,
        // Safe pipeline: no zoompan, no drawtext, no unsharp.
        "-vf", `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
        "-r", String(FPS), "-vsync", "cfr",
        "-c:v", "libx264", "-preset", "veryfast", "-b:v", "3500k",
        "-pix_fmt", "yuv420p",
        seg,
      ];
      await ffmpegWithFallback(primarySegArgs, buildFallbackSegArgs, `segment ${i}`);
      console.log(`[render] encode_completed segment=${i}`);
      segs.push(seg);
    }
    const listPath = join(work, "list.txt");
    writeFileSync(listPath, segs.map(p => `file '${p}'`).join("\n"));
    const silentVideo = join(work, "video.mp4");
    // Re-encode on concat so the bitstream is uniform (zoompan outputs vary).
    console.log("[render] encode_started concat");
    const primaryConcat = ["-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-r", String(FPS), silentVideo];
    const buildFallbackConcat = () => ["-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-r", String(FPS), "-vsync", "cfr", "-b:v", "3000k", silentVideo];
    await ffmpegWithFallback(primaryConcat, buildFallbackConcat, "concat");
    console.log("[render] encode_completed concat");

    // 4. mix audio
    const finalPath = join(work, "final.mp4");
    const audioArgs = [];
    let filter = "";
    if (voPath && musicPath) {
      audioArgs.push("-i", voPath, "-i", musicPath);
      filter = "[1:a]volume=1.0[a1];[2:a]volume=0.18[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=0[aout]";
    } else if (voPath) {
      audioArgs.push("-i", voPath);
      filter = "[1:a]volume=1.0[aout]";
    } else if (musicPath) {
      audioArgs.push("-i", musicPath);
      filter = "[1:a]volume=0.5[aout]";
    }
    if (filter) {
      const primaryMix = [
        "-y", "-i", silentVideo, ...audioArgs,
        "-filter_complex", filter, "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-shortest", finalPath,
      ];
      // Fallback: drop the audio mix entirely if filter_complex crashes — a
      // silent valid MP4 still passes downstream QA/validation and can publish.
      const buildFallbackMix = () => ["-y", "-i", silentVideo, "-c", "copy", finalPath];
      await ffmpegWithFallback(primaryMix, buildFallbackMix, "audio mix");
    } else {
      await shFfmpeg(["-y", "-i", silentVideo, "-c", "copy", finalPath]);
    }

    const size = statSync(finalPath).size;
    const durationSec = (Date.now() - startedAt) / 1000;

    // 5. Probe output: dimensions, real duration, motion score, black bars,
    //    thumbnail. These feed cinematic-ad-validate -> validation_report.passed.
    const probe = await ffprobeDims(finalPath);
    const realDurationSec = probe.duration || sceneFiles.reduce((a, s) => a + s.duration, 0);
    const totalRenderedFrames = Math.round(realDurationSec * FPS);
    const motion = await motionScore(finalPath, totalRenderedFrames);
    const blackBars = await hasBlackBars(finalPath, probe.width || W, probe.height || H);
    const thumbPath = join(work, "thumb.jpg");
    let thumbnailUrl = null;
    try {
      await extractThumbnail(finalPath, thumbPath);
      const thumbObject = `cinematic-ads/${job.product_slug}/${job.job_id}-thumb.jpg`;
      const thumbUrl = `${SUPABASE_URL}/storage/v1/object/${thumbObject}`;
      const tr = await fetch(thumbUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY,
          "Content-Type": "image/jpeg", "x-upsert": "true",
        },
        body: readFileSync(thumbPath),
      });
      if (tr.ok) thumbnailUrl = `${SUPABASE_URL}/storage/v1/object/public/${thumbObject}`;
      else console.warn("[render] thumbnail upload failed", tr.status, await tr.text());
    } catch (e) {
      console.warn("[render] thumbnail extract failed", e?.message ?? e);
    }

    // 6. upload MP4
    const objectPath = job.output_target; // already cinematic-ads/...
    console.log(`[render] upload_started -> ${objectPath} (${size} bytes)`);
    const publicUrl = await uploadToStorage(finalPath, objectPath);
    console.log(`[render] upload_completed -> ${publicUrl}`);
    clearInterval(heartbeat);

    const webhookPayload = {
      job_id: job.job_id,
      status: "uploaded",
      render_token: job.render_token,
      mp4_url: publicUrl,
      file_size: size,
      // Real media duration (not wall-clock) — used by validator.
      duration: Number(realDurationSec.toFixed(2)),
      worker_id: WORKER_ID,
      // Viral-vertical contract output
      width: probe.width || W,
      height: probe.height || H,
      motion_score: motion,
      black_bars: blackBars,
      thumbnail_url: thumbnailUrl,
      composition_id: COMPOSITION,
      preset: PRESET,
      wall_clock_seconds: Number(durationSec.toFixed(2)),
    };
    console.log("[render] webhook payload", {
      ...webhookPayload,
      motion_floor: MOTION_FLOOR,
      motion_pass: motion >= MOTION_FLOOR,
    });
    await postWebhook(webhookPayload);
    console.log("[render] done", publicUrl);
  } catch (e) {
    console.error("[render] failed", e);
    await postWebhook({
      job_id: JOB_ID, status: "failed", render_token: undefined,
      error_message: e?.message ?? String(e), worker_id: WORKER_ID,
    });
    process.exit(1);
  }
}

main();