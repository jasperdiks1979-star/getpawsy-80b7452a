#!/usr/bin/env node
/**
 * Render a cinematic_ad_jobs row as a true Remotion MP4 (motion, captions,
 * voice-over, ducked music) instead of an ffmpeg slideshow.
 *
 * Routes by job.content_type:
 *   cinematic_product_demo -> composition "cinematic-product-demo"
 *   compilation            -> composition "cinematic-compilation"
 *   ugc_pov                -> composition "cinematic-ugc-pov"
 *   lifestyle_scene        -> composition "cinematic-lifestyle"
 *
 * Env: SUPABASE_URL, RENDER_WORKER_SECRET, JOB_ID
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const WORKER_SECRET = process.env.RENDER_WORKER_SECRET;
const JOB_ID = process.env.JOB_ID || process.argv.find((a) => a.startsWith("--job="))?.slice(6);
const WORKER_ID = process.env.RENDER_WORKER_ID || `render-worker-remotion-${Math.random().toString(36).slice(2, 8)}`;
const FUNCTIONS_BASE_URL = (process.env.FUNCTIONS_BASE_URL || `${SUPABASE_URL}/functions/v1`).replace(/\/+$/, "");

if (!SUPABASE_URL || !WORKER_SECRET || !JOB_ID) {
  console.error("[cinematic-remotion] missing env (SUPABASE_URL, RENDER_WORKER_SECRET, JOB_ID)");
  process.exit(2);
}

const HEADERS = { "Content-Type": "application/json", "x-render-secret": WORKER_SECRET };

const COMPOSITION_BY_TYPE = {
  cinematic_product_demo: "cinematic-product-demo",
  compilation: "cinematic-compilation",
  ugc_pov: "cinematic-ugc-pov",
  lifestyle_scene: "cinematic-lifestyle",
};

function log(...a) { console.log("[cinematic-remotion]", ...a); }

async function postWebhook(payload) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${FUNCTIONS_BASE_URL}/cinematic-ad-render-webhook`, {
        method: "POST", headers: HEADERS, body: JSON.stringify(payload),
      });
      const t = await r.text();
      log("webhook", r.status, t.slice(0, 200));
      if (r.ok) return;
    } catch (e) { log("webhook err", e?.message); }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
}

async function claimJob() {
  // If the caller (render-cinematic-ad.mjs) already claimed the job,
  // it forwards the payload here via env to avoid a double-claim race.
  const inline = process.env.JOB_PAYLOAD_JSON;
  if (inline) {
    try {
      const parsed = JSON.parse(inline);
      if (parsed?.job_id) return parsed;
    } catch (e) {
      log("inline JOB_PAYLOAD_JSON parse failed, falling back to claim", e?.message);
    }
  }
  const r = await fetch(`${FUNCTIONS_BASE_URL}/cinematic-ad-claim-job`, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({ worker_id: WORKER_ID, job_id: JOB_ID }),
  });
  const data = await r.json();
  if (!data?.ok || !data.job) throw new Error(`claim failed: ${JSON.stringify(data).slice(0, 300)}`);
  return data.job;
}

async function uploadMp4(localPath, uploadInfo) {
  if (!uploadInfo?.signed_url) throw new Error("signed upload URL missing from claim payload");
  const data = readFileSync(localPath);
  const r = await fetch(uploadInfo.signed_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
    },
    body: data,
  });
  if (!r.ok) throw new Error(`upload failed ${r.status} ${await r.text()}`);
  return uploadInfo.public_url;
}

/**
 * Build per-composition props from a normalized job payload.
 * Falls back gracefully when storyboard data is partial.
 */
function buildProps(job, compositionId) {
  const scenes = (job.scene_assets || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const product = {
    name: job.product_name || job.product_lock?.product_name || "Premium Pet Product",
    price: job.price_display || job.product_lock?.price_display || undefined,
    slug: job.product_slug || job.product_lock?.product_slug || "premium-pet-product",
  };
  const fps = 30;
  const toFrames = (sec, fallback) => Math.max(30, Math.round((Number(sec) || fallback) * fps));
  const voiceoverUrl = job.voiceover_url || undefined;
  const musicUrl = job.music_url || job.background_music_url || undefined;
  const cta = job.input_props?.cta || job.cta_text || "Tap to Shop →";

  if (compositionId === "cinematic-compilation") {
    const products = (job.compilation_products || []).map((p) => ({
      name: p.name,
      price: p.price ?? p.price_display ?? undefined,
      slug: p.slug,
      image: p.image_url || p.image,
      category: p.category ?? undefined,
      blurb: p.blurb || p.tagline || undefined,
    })).filter((p) => p.image && p.name);
    return {
      title: job.input_props?.title || job.hook_text || product.name,
      subtitle: job.input_props?.subtitle || "GetPawsy Picks",
      products: products.length ? products : scenes.slice(0, 5).map((s, i) => ({
        name: s.product_name || `Pick #${i + 1}`,
        price: s.price ?? undefined,
        slug: s.product_slug || `pick-${i + 1}`,
        image: s.image_url,
        blurb: s.caption ?? undefined,
      })),
      cta, voiceoverUrl, musicUrl,
    };
  }

  if (compositionId === "cinematic-ugc-pov") {
    const beatOrder = ["HOOK", "REACTION", "DEMO", "PROOF", "CTA"];
    return {
      product,
      beats: scenes.map((s, i) => ({
        beat: (s.beat || beatOrder[i] || "DEMO"),
        image: s.image_url,
        caption: s.caption || s.vo || undefined,
        voText: s.vo || undefined,
        durationFrames: toFrames(s.duration_seconds, 2.5),
      })),
      cta, voiceoverUrl, musicUrl,
    };
  }

  if (compositionId === "cinematic-lifestyle") {
    return {
      product,
      scenes: scenes.map((s) => ({
        image: s.image_url,
        caption: s.caption || undefined,
        voText: s.vo || undefined,
        durationFrames: toFrames(s.duration_seconds, 4),
        motion: (s.motion || undefined),
      })),
      closingLine: job.input_props?.closingLine || "Made for the way they really live.",
      cta, voiceoverUrl, musicUrl,
    };
  }

  // default: cinematic-product-demo (7-beat)
  const beatOrder = ["HOOK", "PROBLEM", "SOLUTION", "PROOF", "FEATURE", "LIFESTYLE", "CTA"];
  return {
    product,
    scenes: scenes.map((s, i) => ({
      beat: (s.beat || beatOrder[i] || "FEATURE"),
      image: s.image_url,
      caption: s.caption || s.vo || undefined,
      voText: s.vo || undefined,
      productName: s.product_name || product.name,
      durationFrames: toFrames(s.duration_seconds, 2.5),
      motion: s.motion || undefined,
      crop: s.crop || undefined,
      badge: s.badge || undefined,
    })),
    cta, voiceoverUrl, musicUrl,
  };
}

async function main() {
  log("claim", JOB_ID);
  const job = await claimJob();
  const contentType = job.content_type || "cinematic_product_demo";
  const compositionId = COMPOSITION_BY_TYPE[contentType];
  if (!compositionId) {
    log("unknown content_type, falling back to ffmpeg renderer", contentType);
    process.exit(86); // signal to caller: not handled here
  }

  await postWebhook({ job_id: job.job_id, status: "rendering", render_token: job.render_token, worker_id: WORKER_ID });

  const work = mkdtempSync(path.join(tmpdir(), "cinema-rem-"));
  const out = path.join(work, "out.mp4");

  const entry = path.resolve(__dirname, "..", "src", "index.ts");
  const bundled = await bundle({ entryPoint: entry, webpackOverride: (c) => c });
  const browser = await openBrowser("chrome", {
    browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined,
    chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
    chromeMode: "chrome-for-testing",
  });

  const inputProps = buildProps(job, compositionId);
  log("composition", compositionId, "scenes/products",
    inputProps.scenes?.length ?? inputProps.beats?.length ?? inputProps.products?.length);

  try {
    const comp = await selectComposition({
      serveUrl: bundled, id: compositionId, puppeteerInstance: browser, inputProps,
    });
    log("render", { duration: comp.durationInFrames, fps: comp.fps });
    await renderMedia({
      composition: comp,
      serveUrl: bundled,
      codec: "h264",
      outputLocation: out,
      puppeteerInstance: browser,
      inputProps,
      muted: false,
      concurrency: 1,
      crf: 20,
      pixelFormat: "yuv420p",
    });
  } finally {
    try { await browser.close({ silent: false }); } catch {}
  }

  const size = statSync(out).size;
  log("rendered", { bytes: size });
  const publicUrl = await uploadMp4(out, job.upload);
  // Phase 5: stamp motion-engine diagnostics so the admin UI can show
  // render_mode / motion_engine_used / motion_diversity / transition_count
  // per concept and the webhook gate can reject low-motion outputs.
  const sb = Array.isArray(job.motion_storyboard) ? job.motion_storyboard : [];
  const transitionCount = sb.filter((s) => s?.transition_in || s?.transition_out).length;
  const cameraMoves = new Set(sb.map((s) => s?.camera_move).filter(Boolean));
  const distances = new Set(sb.map((s) => s?.shot_distance).filter(Boolean));
  // Diversity = blended fraction of unique camera moves + shot distances over
  // scene count. Capped at 1.0.
  const motionDiversity = sb.length === 0
    ? 0
    : Math.min(1, (cameraMoves.size + distances.size) / (sb.length * 2) + 0.2);
  await postWebhook({
    job_id: job.job_id,
    status: "rendered",
    render_token: job.render_token,
    worker_id: WORKER_ID,
    mp4_url: publicUrl,
    output_mp4_url: publicUrl,
    file_size: size,
    file_size_bytes: size,
    renderer: "remotion-cinematic-v4",
    composition_id: compositionId,
    render_mode: "remotion_cinematic",
    motion_engine_used: "v2",
    motion_diversity: Number(motionDiversity.toFixed(3)),
    transition_count: transitionCount,
  });
  log("done", publicUrl);
}

main().catch(async (e) => {
  console.error("[cinematic-remotion] fatal", e?.stack || e?.message || e);
  try {
    await postWebhook({
      job_id: JOB_ID, status: "failed", worker_id: WORKER_ID,
      error_message: String(e?.message ?? e).slice(0, 800),
      renderer: "remotion-cinematic-v4",
    });
  } catch {}
  process.exit(1);
});