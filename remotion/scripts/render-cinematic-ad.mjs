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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_SECRET = process.env.RENDER_WORKER_SECRET;
const JOB_ID = process.env.JOB_ID || process.argv.find(a => a.startsWith("--job="))?.slice(6);
const WORKER_ID = process.env.RENDER_WORKER_ID || `worker-${Math.random().toString(36).slice(2, 8)}`;

if (!SUPABASE_URL || !SERVICE_KEY || !WORKER_SECRET || !JOB_ID) {
  console.error("Missing env. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RENDER_WORKER_SECRET, JOB_ID");
  process.exit(2);
}

const HEADERS = { "Content-Type": "application/json", "x-render-secret": WORKER_SECRET };

async function postWebhook(payload) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-render-webhook`, {
      method: "POST", headers: HEADERS, body: JSON.stringify(payload),
    });
    const t = await r.text();
    console.log("[webhook]", r.status, t);
  } catch (e) { console.error("[webhook] failed", e); }
}

async function claimJob() {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-claim-job`, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({ worker_id: WORKER_ID, job_id: JOB_ID }),
  });
  const data = await r.json();
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

async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${url} -> ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  writeFileSync(dest, buf);
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
  console.log(`[render] claiming job ${JOB_ID} as ${WORKER_ID}`);
  const job = await claimJob();
  console.log(`[render] claimed`, { job_id: job.job_id, scenes: job.scene_assets?.length });
  await postWebhook({ job_id: job.job_id, status: "rendering", render_token: job.render_token, worker_id: WORKER_ID });

  const work = mkdtempSync(join(tmpdir(), "cinema-"));
  try {
    // 1. download scenes
    const scenes = (job.scene_assets ?? []).slice().sort((a, b) => a.index - b.index);
    if (scenes.length === 0) throw new Error("no scene_assets");
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

    // 3. build concat list (9:16, 1080x1920, ken-burns-lite via fps)
    // Use individual segment renders -> concat, simpler reliability.
    const segs = [];
    for (let i = 0; i < sceneFiles.length; i++) {
      const seg = join(work, `seg-${i}.mp4`);
      await sh("ffmpeg", [
        "-y", "-loop", "1", "-t", String(sceneFiles[i].duration),
        "-i", sceneFiles[i].file,
        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p",
        "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        seg,
      ]);
      segs.push(seg);
    }
    const listPath = join(work, "list.txt");
    writeFileSync(listPath, segs.map(p => `file '${p}'`).join("\n"));
    const silentVideo = join(work, "video.mp4");
    await sh("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", silentVideo]);

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

    // 5. upload
    const objectPath = job.output_target; // already cinematic-ads/...
    console.log(`[render] uploading -> ${objectPath} (${size} bytes)`);
    const publicUrl = await uploadToStorage(finalPath, objectPath);

    await postWebhook({
      job_id: job.job_id, status: "uploaded", render_token: job.render_token,
      mp4_url: publicUrl, file_size: size, duration: durationSec, worker_id: WORKER_ID,
    });
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