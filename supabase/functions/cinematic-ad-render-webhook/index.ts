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
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const MAX_ATTEMPTS = 2;
const MAX_PUBLISH_ATTEMPTS = 3;

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
    if (!["rendering", "rendered", "uploaded", "failed"].includes(status)) {
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

    if (status === "rendering") {
      patch.status = "rendering";
      patch.render_started_at = new Date().toISOString();
      patch.render_worker_id = body.worker_id ?? null;
      patch.render_attempts = (job.render_attempts ?? 0) + 1;
    } else if (status === "rendered" || status === "uploaded") {
      patch.status = "render_complete";
      patch.rendered_at = new Date().toISOString();
      patch.render_complete_at = new Date().toISOString();
      if (body.mp4_url) patch.output_mp4_url = String(body.mp4_url);
      if (body.duration != null) patch.output_duration_seconds = Number(body.duration);
      if (body.file_size != null) patch.output_file_size_bytes = Number(body.file_size);
      patch.error_message = null;
      patch.status_message = "render complete — auto-publishing to Pinterest";
    } else if (status === "failed") {
      const attempts = (job.render_attempts ?? 0);
      const willRetry = attempts < MAX_ATTEMPTS;
      patch.status = willRetry ? "render_queued" : "failed";
      patch.error_message = String(body.error_message ?? "render failed");
      if (!willRetry) patch.status_message = `worker failed after ${attempts} attempts.`;
      else patch.status_message = `attempt ${attempts} failed; re-queued (${attempts}/${MAX_ATTEMPTS}).`;
    }

    const { error: updErr } = await admin.from("cinematic_ad_jobs").update(patch).eq("id", jobId);
    if (updErr) return json({ ok: false, traceId, message: updErr.message }, 500);

    // Fire the auto-publish chain when render reaches a terminal-success state.
    // We don't await it from the HTTP response perspective (worker doesn't need
    // to block) but we DO await it inside the handler so logs stream coherently.
    if (patch.status === "render_complete" && job.output_mp4_url || (status === "rendered" || status === "uploaded")) {
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