/**
 * cinematic-ad-render-webhook
 *
 * Called by the external Render.com worker as the MP4 render progresses.
 * On `rendered`/`uploaded` we drive the full auto-publish chain:
 *   render_complete → pinterest_uploaded → published
 *
 * Stages (each tagged in logs):
 *   [pinterest-upload]          register asset in pinterest_video_assets
 *   [pinterest-media-register]  Pinterest API media registration
 *   [pinterest-pin-create]      Pinterest API pin creation (board + visibility)
 *   [pinterest-publish-success] terminal success transition
 *   [pinterest-publish-error]   terminal failure transition (retryable)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getPreset,
  HARD_MAX_DURATION_SEC,
  DURATION_OVERRUN_SLACK_SEC,
} from "../_shared/cinematic-presets.ts";
import { verifySafariPlayback } from "../_shared/safari-playback-check.ts";
import {
  mergePreserve,
  stripDoubleSlash,
  FIELD_MAP,
} from "../_shared/cinematic-callback-merge.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
const GH_PAT = Deno.env.get("GH_PAT") ?? "";
const GH_REPO = Deno.env.get("GH_REPO") ?? "";
const TRIM_WORKFLOW_FILE = Deno.env.get("TRIM_WORKFLOW_FILE") ?? "trim-cinematic-ad.yml";
const GH_REF = Deno.env.get("GH_REF") ?? "main";

const MAX_ATTEMPTS = 2;
const MAX_PUBLISH_ATTEMPTS = 3;
// Bounded auto-retry for the trim step. The render itself already
// succeeded (output_mp4_url is present) — only the trim GH workflow
// failed (ffmpeg, upload, GH dispatch, or stuck >15min with no callback).
// We re-dispatch the trim workflow up to MAX_TRIM_ATTEMPTS times before
// giving up. If the MP4 is already within the duration cap when the
// trim worker keeps failing, we bypass the trim and promote the job to
// render_complete so the publish chain can continue.
const MAX_TRIM_ATTEMPTS = 3;
// Trim-failure events the worker / watchdog may report.
const TRIM_FAILURE_EVENTS = new Set([
  "auto_trim_failed",
  "auto_trim_dispatch_failed",
  "auto_trim_stuck",
  "auto_trim_timeout",
]);

/**
 * The legacy `trim-cinematic-ad` GitHub workflow was retired with the v2
 * cinematic_ad pipeline. v3+ renders never overshoot the duration cap, so
 * trim is no longer required. This function now signals callers to route
 * the job into the active cinematic recovery worker for regeneration
 * instead of hard-failing with "trim_workflow_deprecated_2026_*".
 */
async function dispatchTrimWorkflow(
  jobId: string,
  _mp4Url: string,
  _targetSec: number,
  _renderToken: string | null,
  traceId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  console.log(`[auto-trim] ${traceId} retired no-op for job=${jobId}; caller will route to recovery worker`);
  return { ok: false, message: "trim_retired_route_to_recovery_worker" };
}

function trace() { return crypto.randomUUID().slice(0, 8); }
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Mirror an MP4-rendered cinematic_ad_jobs row into pinterest_video_assets so
 * the existing video publisher can pick it up. Idempotent on content_hash.
 */
async function upsertPinterestAsset(admin: any, job: any, traceId: string): Promise<{ ok: true; asset_id: string } | { ok: false; message: string }> {
  const filename = `cinematic-${job.product_slug}-${String(job.id).slice(0, 8)}.mp4`;
  const storagePath = `${job.id}/output.mp4`;
  const contentHash = await sha256Hex(job.output_mp4_url);
  console.log(`[pinterest-upload] ${traceId} upserting asset`, { jobId: job.id, contentHash: contentHash.slice(0, 12) });
  const { data, error } = await admin
    .from("pinterest_video_assets")
    .upsert({
      filename,
      storage_bucket: "cinematic-ads",
      storage_path: storagePath,
      public_url: job.output_mp4_url,
      thumbnail_url: job.output_thumbnail_url ?? null,
      duration_seconds: job.output_duration_seconds ?? null,
      aspect_ratio: "9:16",
      mime_type: "video/mp4",
      hook_type: job.hook_variant ?? "default",
      product_slug: job.product_slug,
      content_hash: contentHash,
      country_target: "US",
      language_target: "en-US",
      detected_platform: "cinematic-ads",
      is_active: true,
    }, { onConflict: "content_hash" })
    .select("id")
    .single();
  if (error || !data) {
    console.error(`[pinterest-upload] ${traceId} asset upsert failed`, error);
    return { ok: false, message: error?.message ?? "asset upsert failed" };
  }
  return { ok: true, asset_id: data.id };
}

/**
 * Call the existing pinterest-video-publisher in service mode (gated by
 * x-render-secret) to (a) queue a draft, then (b) publish it to Pinterest.
 */
async function autoPublishToPinterest(admin: any, job: any, assetId: string, traceId: string): Promise<{ ok: true; pin_id: string; pin_url: string } | { ok: false; code: string; message: string }> {
  const headers = {
    "Content-Type": "application/json",
    "x-render-secret": RENDER_WORKER_SECRET,
  };

  // Stage A — queue a fresh draft for this asset
  console.log(`[pinterest-media-register] ${traceId} queue_draft`, { assetId });
  const draftRes = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-video-publisher`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "queue_draft", asset_id: assetId }),
  });
  const draftBody: any = await draftRes.json().catch(() => ({}));
  if (!draftRes.ok || !draftBody?.ok || !Array.isArray(draftBody.queue_ids) || draftBody.queue_ids.length === 0) {
    console.error(`[pinterest-publish-error] ${traceId} queue_draft failed`, { status: draftRes.status, body: draftBody });
    return { ok: false, code: draftBody?.code ?? "QUEUE_DRAFT_FAILED", message: draftBody?.message ?? `queue_draft status ${draftRes.status}` };
  }
  const queueId = draftBody.queue_ids[0] as string;

  // Stage B — publish (publisher handles register_media → upload → poll → create_pin)
  console.log(`[pinterest-pin-create] ${traceId} publish`, { queueId });
  const pubRes = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-video-publisher`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "publish", queue_id: queueId }),
  });
  const pubBody: any = await pubRes.json().catch(() => ({}));
  if (!pubRes.ok || !pubBody?.ok || !pubBody?.pin_id) {
    const code = pubBody?.code ?? "PUBLISH_FAILED";
    const message = pubBody?.message ?? `publish status ${pubRes.status}`;
    console.error(`[pinterest-publish-error] ${traceId} publish failed`, { code, message, queueId });
    return { ok: false, code, message };
  }
  const pin_url = pubBody.pin_url ?? pubBody.external_url ?? `https://www.pinterest.com/pin/${pubBody.pin_id}/`;
  console.log(`[pinterest-publish-success] ${traceId} published`, { pin_id: pubBody.pin_id, pin_url });
  return { ok: true, pin_id: String(pubBody.pin_id), pin_url };
}

/**
 * Drive auto-publish with bounded retries. Status transitions:
 *   render_complete → pinterest_uploaded → published   (success)
 *   render_complete → pinterest_uploaded               (publish error; retryable)
 */
async function runAutoPublishChain(admin: any, jobId: string, traceId: string): Promise<void> {
  const { data: job } = await admin.from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job?.output_mp4_url) {
    console.warn(`[pinterest-publish-error] ${traceId} no mp4 on job, skipping auto-publish`, { jobId });
    return;
  }

  // Step 1 — register asset
  const upsert = await upsertPinterestAsset(admin, job, traceId);
  if (!upsert.ok) {
    await admin.from("cinematic_ad_jobs").update({
      pinterest_publish_error: `[pinterest-upload] ${upsert.message}`,
      status_message: "auto-publish: asset registration failed",
    }).eq("id", jobId);
    return;
  }

  await admin.from("cinematic_ad_jobs").update({
    status: "pinterest_uploaded",
    status_message: "asset registered with Pinterest publisher",
    pinterest_asset_id: upsert.asset_id,
    pinterest_uploaded_at: new Date().toISOString(),
    pushed_to_pinterest_at: new Date().toISOString(),
    pinterest_publish_error: null,
  }).eq("id", jobId);

  // Step 2 — publish with bounded retries on transient failures
  let lastErr: { code: string; message: string } | null = null;
  for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt++) {
    await admin.from("cinematic_ad_jobs").update({
      pinterest_publish_attempts: attempt,
      last_pinterest_attempt_at: new Date().toISOString(),
      status_message: `auto-publish attempt ${attempt}/${MAX_PUBLISH_ATTEMPTS}`,
    }).eq("id", jobId);

    const result = await autoPublishToPinterest(admin, { ...job, id: jobId }, upsert.asset_id, traceId);
    if (result.ok) {
      await admin.from("cinematic_ad_jobs").update({
        status: "published",
        status_message: "published to Pinterest",
        pinterest_pin_id: result.pin_id,
        pinterest_pin_url: result.pin_url,
        published_at: new Date().toISOString(),
        pinterest_publish_error: null,
      }).eq("id", jobId);
      // Mirror result onto the autopilot schedule row, if any.
      try {
        await admin.from("pinterest_autopilot_schedule").update({
          status: "published",
          pinterest_pin_id: result.pin_id,
          pinterest_pin_url: result.pin_url,
          published_at: new Date().toISOString(),
        }).eq("cinematic_ad_job_id", jobId);
      } catch (e) { console.warn(`[autopilot-mirror] ${traceId}`, e); }
      return;
    }

    lastErr = { code: result.code, message: result.message };
    // Retry only on transient error codes; fast-fail on auth / payload errors.
    const transient = /UPLOAD_FAILED|REGISTER_FAILED|MEDIA_TIMEOUT|MEDIA_PROCESS_FAILED|UNEXPECTED_ERROR/i.test(result.code);
    if (!transient || attempt >= MAX_PUBLISH_ATTEMPTS) break;
    const backoff = 1500 * Math.pow(2, attempt - 1);
    console.warn(`[pinterest-publish-error] ${traceId} attempt ${attempt} failed, retrying in ${backoff}ms`, lastErr);
    await new Promise((r) => setTimeout(r, backoff));
  }

  if (lastErr) {
    await admin.from("cinematic_ad_jobs").update({
      pinterest_publish_error: `[${lastErr.code}] ${lastErr.message}`,
      status_message: `auto-publish failed after ${MAX_PUBLISH_ATTEMPTS} attempts — Retry from admin`,
    }).eq("id", jobId);
    try {
      await admin.from("pinterest_autopilot_schedule").update({
        status: "failed",
        skip_reason: `[${lastErr.code}] ${lastErr.message}`,
      }).eq("cinematic_ad_job_id", jobId);
    } catch (e) { console.warn(`[autopilot-mirror] ${traceId}`, e); }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    const secret = req.headers.get("x-render-secret") ?? "";
    if (!RENDER_WORKER_SECRET || secret !== RENDER_WORKER_SECRET) {
      return json({ ok: false, traceId, message: "unauthorized" }, 401);
    }
    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id ?? "");
    const status = String(body.status ?? "");
    const renderToken = String(body.render_token ?? "");
    if (!jobId || !status) return json({ ok: false, traceId, message: "job_id and status required" }, 400);
    if (!["rendering", "heartbeat", "rendered", "uploaded", "failed"].includes(status)) {
      return json({ ok: false, traceId, message: "invalid status" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: job, error: jobErr } = await admin
      .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
    if (jobErr || !job) return json({ ok: false, traceId, message: "job not found" }, 404);
    if (renderToken && job.render_token && job.render_token !== renderToken) {
      return json({ ok: false, traceId, message: "render_token mismatch" }, 403);
    }

    const patch: Record<string, unknown> = { status_message: `worker: ${status}` };
    const event = String(body.event ?? status);
    const logEntry: Record<string, unknown> = {
      event,
      at: new Date().toISOString(),
      worker_id: body.worker_id ?? null,
    };
    if (body.duplicate_diagnostics) logEntry.duplicate_diagnostics = body.duplicate_diagnostics;
    if (body.message) logEntry.message = body.message;
    const logPatch = (job.render_log ?? []).concat([logEntry]).slice(-100);
    patch.render_log = logPatch;

    if (status === "rendering") {
      patch.status = "rendering";
      patch.render_started_at = new Date().toISOString();
      patch.render_heartbeat_at = new Date().toISOString();
      patch.render_worker_id = body.worker_id ?? null;
      patch.render_attempts = (job.render_attempts ?? 0) + 1;
    } else if (status === "heartbeat") {
      patch.render_heartbeat_at = new Date().toISOString();
      patch.render_worker_id = body.worker_id ?? job.render_worker_id ?? null;
      patch.status_message = `worker heartbeat: ${event}`;
    } else if (status === "rendered" || status === "uploaded") {
      // Hard duration gate: refuse mp4s that overshoot preset cap by more
      // than DURATION_OVERRUN_SLACK_SEC. Pinterest/TikTok reject these and
      // we will not pay to publish them.
      const presetForJob = getPreset(job.preset);
      const targetDuration = Math.min(presetForJob.durationSec, HARD_MAX_DURATION_SEC);
      const cap = targetDuration + DURATION_OVERRUN_SLACK_SEC;
      const reportedDuration = Number(body.duration ?? job.output_duration_seconds ?? 0);
      const isTrimmedCallback = Boolean(body.duration_auto_trimmed);
      if (Number.isFinite(reportedDuration) && reportedDuration > cap && !isTrimmedCallback) {
        // ----- Emergency server-side ffmpeg clamp -----
        // Instead of hard-failing, dispatch a GH Actions worker that downloads
        // the oversize MP4, trims to HARD_MAX_DURATION_SEC, re-uploads, and
        // calls this webhook back with duration_auto_trimmed=true.
        const incomingMp4 = String(body.mp4_url ?? job.output_mp4_url ?? "");
        console.warn(`[auto-trim] ${traceId} oversize detected`, {
          jobId,
          original_duration: reportedDuration,
          target_duration: targetDuration,
          trim_applied: false,
          ffmpeg_exit_code: null,
        });
        if (!incomingMp4) {
          patch.status = "failed";
          patch.error_message = `duration_overrun_no_mp4:${reportedDuration.toFixed(1)}s>${cap}s`;
          patch.status_message = "auto-trim impossible: no mp4_url on payload";
          patch.duration_valid = false;
          patch.validation_passed = false;
          await admin.from("cinematic_ad_jobs").update(patch).eq("id", jobId);
          return json({ ok: false, traceId, message: patch.status_message }, 500);
        }
        const dispatch = await dispatchTrimWorkflow(jobId, incomingMp4, targetDuration, job.render_token ?? null, traceId);
        if (!dispatch.ok) {
          // Trim workflow retired — route to the recovery worker instead of
          // burning the job. Recovery regenerates voiceover/captions and
          // requeues via the v4 cinematic pipeline.
          const attempts = (job.render_attempts ?? 0);
          patch.status = "needs_scene_regen";
          patch.error_message = `route_to_recovery:${dispatch.message}`;
          patch.status_message = `trim retired — routed to cinematic-recovery-worker (${dispatch.message})`;
          patch.original_duration_seconds = reportedDuration;
          patch.trim_attempted_at = new Date().toISOString();
          patch.output_mp4_url = incomingMp4;
          patch.output_duration_seconds = reportedDuration;
          patch.duration_valid = false;
          patch.validation_passed = false;
          await admin.from("cinematic_ad_jobs").update(patch).eq("id", jobId);
          console.warn(`[auto-trim] ${traceId} retired path — routed to recovery worker`, { jobId, attempts });
          return json({ ok: true, traceId, message: patch.status_message, rerouted: "cinematic-recovery-worker" });
        }
        // Dispatched OK — park the job in 'trimming' until the callback fires.
        patch.status = "trimming";
        patch.status_message = `auto-trim dispatched (${reportedDuration.toFixed(1)}s → ${targetDuration}s)`;
        patch.original_duration_seconds = reportedDuration;
        patch.trim_attempted_at = new Date().toISOString();
        patch.error_message = null;
        // CRITICAL: persist ALL metadata from the original render callback BEFORE
        // dispatching the trim workflow — the trim callback only carries
        // mp4_url/duration so without this all motion_score / file_size /
        // width / height / black_bars / thumbnail_url / scene_plan are lost.
        mergePreserve(patch, body, FIELD_MAP);
        // Backstops if body omitted these (defaults / pre-trim values)
        if (patch.output_mp4_url == null) patch.output_mp4_url = stripDoubleSlash(incomingMp4);
        if (patch.output_duration_seconds == null) patch.output_duration_seconds = reportedDuration;
        if (patch.output_width == null) patch.output_width = 1080;
        if (patch.output_height == null) patch.output_height = 1920;
        await admin.from("cinematic_ad_jobs").update(patch).eq("id", jobId);
        console.log(`[auto-trim] ${traceId} dispatched; awaiting trimmed callback`, { jobId, original_duration: reportedDuration, target_duration: targetDuration });
        return json({ ok: true, traceId, message: patch.status_message, auto_trim: "dispatched" });
      }

      // Trimmed callback path: store trim metadata and continue normal flow.
      if (isTrimmedCallback) {
        const exit = body.trim_ffmpeg_exit_code != null ? Number(body.trim_ffmpeg_exit_code) : null;
        const origDur = body.original_duration_seconds != null
          ? Number(body.original_duration_seconds)
          : (job.original_duration_seconds ?? null);
        patch.duration_auto_trimmed = true;
        patch.trim_ffmpeg_exit_code = exit;
        if (origDur != null) patch.original_duration_seconds = origDur;
        console.log(`[auto-trim] ${traceId} trimmed callback`, {
          jobId,
          original_duration: origDur,
          trimmed_duration: reportedDuration,
          trim_applied: true,
          ffmpeg_exit_code: exit,
        });
        // Defensive second gate: if even the trimmed file is still over cap,
        // refuse rather than publish.
        if (Number.isFinite(reportedDuration) && reportedDuration > cap) {
          patch.status = "failed";
          patch.error_message = `auto_trim_still_overrun:${reportedDuration.toFixed(1)}s>${cap}s`;
          patch.status_message = "auto-trim ran but output is still over cap";
          patch.duration_valid = false;
          patch.validation_passed = false;
          if (body.mp4_url) patch.output_mp4_url = String(body.mp4_url);
          if (body.duration != null) patch.output_duration_seconds = reportedDuration;
          await admin.from("cinematic_ad_jobs").update(patch).eq("id", jobId);
          return json({ ok: false, traceId, message: patch.status_message, rejected: true });
        }
      }
      patch.status = "render_complete";
      patch.rendered_at = new Date().toISOString();
      patch.render_complete_at = new Date().toISOString();
      patch.render_heartbeat_at = new Date().toISOString();
      // Preserve-merge: only writes non-null fields, never clobbers existing
      // values with NULL. Critical for the trim-callback path which omits
      // motion_score / file_size / width / height / black_bars / thumbnail_url
      // / scene_plan that were already captured on the original render.
      mergePreserve(patch, body, FIELD_MAP);
      // Aspect defaults only when neither the payload NOR the prior row has it.
      if (patch.output_width == null && job.output_width == null) patch.output_width = 1080;
      if (patch.output_height == null && job.output_height == null) patch.output_height = 1920;
      patch.error_message = null;
      patch.status_message = "render complete — validating output";
      // Phase-4 observability: log every motion_quality_score that arrives
      // from the renderer, including the breakdown of how it was computed.
      if (body?.motion_quality_score != null) {
        try {
          const attempt = Number(job.motion_regen_attempts ?? 0);
          const scoreInt = Math.max(0, Math.min(100, Math.round(Number(body.motion_quality_score))));
          console.log(`[motion-quality-log] ${traceId} job=${jobId} attempt=${attempt} score=${scoreInt} source=renderer`,
            body.motion_quality_breakdown ? JSON.stringify(body.motion_quality_breakdown) : "(no breakdown)");
          await admin.from("cinematic_motion_quality_events").insert({
            job_id: jobId,
            product_slug: job.product_slug ?? null,
            source: "renderer",
            attempt_number: attempt,
            score: scoreInt,
            threshold: null,
            passed: null,
            decision: "measured",
            max_regen_attempts: null,
            breakdown: body.motion_quality_breakdown ?? null,
            notes: `renderer reported score=${scoreInt}; status=${status}`,
          });
        } catch (e) {
          console.warn(`[motion-quality-log] ${traceId} insert failed:`, (e as Error)?.message);
        }
      }
    } else if (status === "failed") {
      // ---- Trim-step failure: re-dispatch the trim workflow, do NOT
      // re-render. The render itself produced output_mp4_url; only the
      // post-render trim step failed (ffmpeg / upload / stuck / dispatch).
      const eventName = String(body.event ?? "");
      const isTrimFailure =
        TRIM_FAILURE_EVENTS.has(eventName) ||
        /trim/i.test(eventName) ||
        /auto_trim/i.test(String(body.error_message ?? ""));
      if (isTrimFailure) {
        const mp4 = String(job.output_mp4_url ?? body.mp4_url ?? "");
        const trimAttempts = (job.trim_attempts ?? 0);
        const presetForJob = getPreset(job.preset);
        const targetDuration = Math.min(presetForJob.durationSec, HARD_MAX_DURATION_SEC);
        const cap = targetDuration + DURATION_OVERRUN_SLACK_SEC;
        const currentDuration = Number(job.output_duration_seconds ?? 0);
        const withinCap = Number.isFinite(currentDuration) && currentDuration > 0 && currentDuration <= cap;
        // Fallback when retries are exhausted: if the MP4 is already
        // within the duration cap, no trim is actually required — promote
        // straight to render_complete so the publish chain can continue.
        if (trimAttempts >= MAX_TRIM_ATTEMPTS) {
          if (withinCap && mp4) {
            patch.status = "render_complete";
            patch.duration_auto_trimmed = true;
            patch.error_message = null;
            patch.status_message = `trim retry exhausted (${trimAttempts}/${MAX_TRIM_ATTEMPTS}) — MP4 already within ${cap}s cap, bypassing trim`;
            patch.rendered_at = patch.rendered_at ?? new Date().toISOString();
            patch.render_complete_at = new Date().toISOString();
            console.warn(`[trim-retry] ${traceId} bypass — within cap`, { jobId, currentDuration, trimAttempts });
          } else {
            patch.status = "needs_admin_review";
            patch.error_message = `auto_trim_max_retries:${trimAttempts}`;
            patch.status_message = `auto-trim failed ${trimAttempts}× — manual review required`;
            console.error(`[trim-retry] ${traceId} exhausted; admin review`, { jobId, trimAttempts, currentDuration });
          }
        } else if (!mp4) {
          patch.status = "failed";
          patch.error_message = "auto_trim_failed_no_mp4";
          patch.status_message = "trim failed and no output_mp4_url to re-dispatch";
        } else {
          // Re-dispatch the trim workflow.
          const dispatch = await dispatchTrimWorkflow(jobId, mp4, targetDuration, job.render_token ?? null, traceId);
          if (dispatch.ok) {
            patch.status = "trimming";
            patch.trim_attempts = trimAttempts + 1;
            patch.trim_attempted_at = new Date().toISOString();
            patch.error_message = null;
            patch.status_message = `auto-trim retry ${trimAttempts + 1}/${MAX_TRIM_ATTEMPTS} dispatched`;
            console.log(`[trim-retry] ${traceId} re-dispatched`, { jobId, attempt: trimAttempts + 1 });
          } else {
            // Trim is retired — route to recovery worker rather than retry.
            patch.status = "needs_scene_regen";
            patch.error_message = `route_to_recovery:${dispatch.message}`;
            patch.status_message = `trim retired — routed to cinematic-recovery-worker (${dispatch.message})`;
            console.warn(`[trim-retry] ${traceId} retired path — routed to recovery worker`, { jobId, msg: dispatch.message });
          }
        }
      } else {
        const attempts = (job.render_attempts ?? 0);
        const willRetry = attempts < MAX_ATTEMPTS;
        patch.status = willRetry ? "render_queued" : "failed";
        patch.error_message = String(body.error_message ?? "render failed");
        if (!willRetry) patch.status_message = `worker failed after ${attempts} attempts.`;
        else patch.status_message = `attempt ${attempts} failed; re-queued (${attempts}/${MAX_ATTEMPTS}).`;
      }
    }

    // Phase 5: motion-score publish gate. Any render whose motion_score is
    // below 0.5 (i.e. effectively a static slideshow) is parked in
    // needs_admin_review with an explicit publish_blocked_reason. This stacks
    // on top of the duration / safari-playback gates below.
    if ((status === "rendered" || status === "uploaded") && patch.status === "render_complete") {
      const motionScore = Number(
        (patch as any).motion_score ?? job.motion_score ?? body?.motion_score ?? 0,
      );
      if (Number.isFinite(motionScore) && motionScore < 0.5) {
        patch.status = "needs_admin_review";
        (patch as any).publish_blocked_reason = `motion_score_below_0.5:${motionScore.toFixed(2)}`;
        patch.status_message = `motion_score=${motionScore.toFixed(2)} < 0.5 — render rejected as low-motion; review in admin preview`;
        console.warn(`[motion-gate] ${traceId} job=${jobId} motion_score=${motionScore.toFixed(2)} — blocked from autopublish`);
      }
    }

    const { error: updErr } = await admin.from("cinematic_ad_jobs").update(patch).eq("id", jobId);
    if (updErr) return json({ ok: false, traceId, message: updErr.message }, 500);

    // Best-effort promotion: when this update frees a render slot (terminal
    // success or terminal failure), pop the oldest queue_waiting concept and
    // dispatch it. Errors are swallowed — the watchdog is the safety net.
    if (patch.status === "render_complete" || patch.status === "failed") {
      (async () => {
        try {
          const { data: nextWaiting } = await admin
            .from("cinematic_ad_jobs")
            .select("id, preset")
            .eq("status", "queue_waiting")
            .order("queue_wait_next_at", { ascending: true, nullsFirst: true })
            .limit(1)
            .maybeSingle();
          if (!nextWaiting) return;
          const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
          const SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/cinematic-ad-queue-render`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-token": SECRET,
              "Authorization": `Bearer ${SVC}`,
              "apikey": SVC,
            },
            body: JSON.stringify({ job_id: (nextWaiting as any).id, preset: (nextWaiting as any).preset ?? undefined, auto_approve: true }),
          });
        } catch (e) {
          console.warn(`[webhook->promote] ${traceId} failed:`, (e as Error)?.message);
        }
      })();
    }

    // On render success: run validator, then either auto-publish (if explicitly
    // approved upstream) or hold for admin approval in the preview panel.
    if (status === "heartbeat") return json({ ok: true, traceId, message: "heartbeat recorded" });

    if ((status === "rendered" || status === "uploaded") && (body.mp4_url || job.output_mp4_url)) {
      // iPhone Safari playback gate — fail-fast if the MP4 URL is not
      // streamable inline (CORS / mime / Accept-Ranges / faststart / 206).
      // Runs on every render-complete AND trim-callback path so the trimmed
      // file is re-verified after re-encode + re-upload.
      const checkUrl = stripDoubleSlash(String(body.mp4_url ?? job.output_mp4_url ?? ""));
      try {
        const safari = await verifySafariPlayback(checkUrl);
        await admin.from("cinematic_ad_jobs").update({
          safari_playback_check: safari,
          safari_playback_passed: safari.passed,
          safari_playback_checked_at: safari.checked_at,
        }).eq("id", jobId);
        if (!safari.passed) {
          const failedNames = safari.checks.filter((c) => !c.passed).map((c) => c.name).join(",");
          console.warn(`[safari-check] ${traceId} FAIL job=${jobId} url=${checkUrl} failed=${failedNames}`);
          await admin.from("cinematic_ad_jobs").update({
            status: "awaiting_approval",
            status_message: `safari playback check failed: ${failedNames} — review in admin preview`,
          }).eq("id", jobId);
          return json({
            ok: true,
            traceId,
            message: "safari playback check failed — awaiting admin review",
            safari_playback: safari,
          });
        }
        console.log(`[safari-check] ${traceId} OK job=${jobId} url=${checkUrl}`);
      } catch (e) {
        console.error(`[safari-check] ${traceId} crashed`, e);
      }

      try {
        const valRes = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-render-secret": RENDER_WORKER_SECRET },
          body: JSON.stringify({ job_id: jobId }),
        });
        const valJson: any = await valRes.json().catch(() => ({}));
        console.log(`[validate] ${traceId} job=${jobId} ok=${valJson?.ok} passed=${valJson?.report?.passed}`);
        if (!valJson?.report?.passed) {
          await admin.from("cinematic_ad_jobs").update({
            status: "awaiting_approval",
            status_message: "validation failed — review in admin preview",
          }).eq("id", jobId);
          return json({ ok: true, traceId, message: "validated (failed) — awaiting admin review", validation: valJson?.report });
        }
      } catch (e) {
        console.error(`[validate] ${traceId} validator crashed`, e);
      }

      // Validation passed. Hold for admin approval unless either:
      //   - the worker explicitly signals auto_approve=true (backfill/smoke), or
      //   - the job was queued by the autopilot orchestrator (auto_publish=true).
        const { data: freshJob } = await admin
        .from("cinematic_ad_jobs").select("auto_publish, autopilot, approved_for_render, confidence_scores, autopilot_threshold")
        .eq("id", jobId).maybeSingle();
      const autoApprove =
        Boolean(body.auto_approve) ||
        (Boolean(freshJob?.auto_publish) && Boolean(freshJob?.approved_for_render)) ||
        (Boolean(freshJob?.autopilot) &&
          Boolean(freshJob?.approved_for_render) &&
          Number(freshJob?.confidence_scores?.overall ?? 0) >=
            Number(freshJob?.autopilot_threshold ?? 100));
      if (!autoApprove) {
        await admin.from("cinematic_ad_jobs").update({
          status: "awaiting_approval",
          status_message: "render + validation passed — awaiting admin approval",
        }).eq("id", jobId);
        return json({ ok: true, traceId, message: "awaiting admin approval" });
      }

      try {
        await runAutoPublishChain(admin, jobId, traceId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[pinterest-publish-error] ${traceId} chain crashed`, msg);
        await admin.from("cinematic_ad_jobs").update({
          pinterest_publish_error: `[CHAIN_CRASH] ${msg}`,
        }).eq("id", jobId);
      }
    }

    return json({ ok: true, traceId, message: "updated" });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});