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
    const sceneFiles = [];
    for (const s of scenes) {
      const f = join(work, `scene-${s.index}.jpg`);
      await download(s.image_url, f);
      sceneFiles.push({ file: f, duration: Math.max(1, Number(s.duration_seconds) || 2) });
    }
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
      const dur = sceneFiles[i].duration;
      const frames = Math.round(dur * FPS);
      // Upscale source first so zoompan has pixels to work with, then crop.
      const zoomIn = i % 2 === 0;
      const zoomExpr = zoomIn
        ? `min(zoom+0.0015,1.25)`
        : `if(eq(on,0),1.25,max(zoom-0.0015,1.0))`;
      const xExpr = `iw/2-(iw/zoom/2)+sin(on/${frames}*PI)*30`;
      const yExpr = `ih/2-(ih/zoom/2)+cos(on/${frames}*PI)*30`;
      const vf = [
        `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase`,
        `crop=${W * 2}:${H * 2}`,
        `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${W}x${H}:fps=${FPS}`,
        `format=yuv420p`,
      ].join(",");
      await sh("ffmpeg", [
        "-y", "-loop", "1", "-t", String(dur),
        "-i", sceneFiles[i].file,
        "-vf", vf,
        "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        seg,
      ]);
      segs.push(seg);
    }
    const listPath = join(work, "list.txt");
    writeFileSync(listPath, segs.map(p => `file '${p}'`).join("\n"));
    const silentVideo = join(work, "video.mp4");
    // Re-encode on concat so the bitstream is uniform (zoompan outputs vary).
    await sh("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-r", String(FPS), silentVideo]);

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
      await sh("ffmpeg", [
        "-y", "-i", silentVideo, ...audioArgs,
        "-filter_complex", filter, "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-shortest", finalPath,
      ]);
    } else {
      await sh("ffmpeg", ["-y", "-i", silentVideo, "-c", "copy", finalPath]);
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
    console.log(`[render] uploading -> ${objectPath} (${size} bytes)`);
    const publicUrl = await uploadToStorage(finalPath, objectPath);

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