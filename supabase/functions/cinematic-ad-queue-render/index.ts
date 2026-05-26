import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PRESETS, getPreset, durationFrames, type CinematicPresetId } from "../_shared/cinematic-presets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
const MAX_ACTIVE_QUEUED = 5;

function traceId() { return crypto.randomUUID().slice(0, 8); }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = traceId();
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const internalToken = req.headers.get("x-internal-token") ?? "";
    const workerSecret = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
    if (!(workerSecret && internalToken && internalToken === workerSecret)) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData.user) {
        return json({ ok: false, traceId: trace, message: "unauthenticated" }, 401);
      }
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ ok: false, traceId: trace, message: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id ?? "");
    const presetId = (body.preset ?? "") as string;
    if (!jobId) return json({ ok: false, traceId: trace, message: "job_id required" }, 400);
    if (!UUID_RE.test(jobId)) return json({ ok: false, traceId: trace, message: `Full UUID required. Do not use shortened display id. (got: "${jobId}")` }, 400);

    const { data: job, error: jobErr } = await admin
      .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
    if (jobErr || !job) return json({ ok: false, traceId: trace, message: "job not found" }, 404);
    if (!["prepared", "failed", "render_queued"].includes(job.status)) {
      return json({ ok: false, traceId: trace, message: `job status '${job.status}' not eligible (need prepared/failed)` }, 400);
    }
    if (!job.approved_for_render) {
      return json({ ok: false, traceId: trace, message: "job not approved for render — call cinematic-ad-approve first" }, 412);
    }

    // Hard gate: voice-over must exist before we burn render minutes.
    const voUrl = job.vo_url ?? job.voiceover_url ?? null;
    if (!voUrl) {
      await admin.from("cinematic_ad_jobs").update({
        status: "failed",
        status_message: "voice-over missing — cinematic-voiceover-generate did not produce a file",
        error_message: "missing voiceover_url",
      }).eq("id", jobId);
      return json({ ok: false, traceId: trace, message: "voice-over missing — run cinematic-voiceover-generate before queueing render" }, 412);
    }

    const { count: activeQueuedCount } = await admin
      .from("cinematic_ad_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "render_queued");
    if ((activeQueuedCount ?? 0) >= MAX_ACTIVE_QUEUED && job.status !== "render_queued") {
      return json({ ok: false, traceId: trace, message: `render queue limit reached (${MAX_ACTIVE_QUEUED}); wait for current jobs to complete` }, 429);
    }

    const { data: sameProductActive } = await admin
      .from("cinematic_ad_jobs")
      .select("id,status,render_queued_at,render_started_at")
      .eq("product_slug", job.product_slug)
      .in("status", ["preparing", "prepared", "render_queued", "rendering"])
      .neq("id", jobId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sameProductActive) {
      return json({
        ok: false,
        traceId: trace,
        message: `duplicate active job exists for ${job.product_slug}: ${sameProductActive.id} (${sameProductActive.status})`,
        duplicate_job_id: sameProductActive.id,
      }, 409);
    }

    // Resolve preset: explicit body > job row > default.
    const effectivePreset = getPreset(presetId || job.preset);
    const totalFrames = durationFrames(effectivePreset);

    const renderToken = crypto.randomUUID();
    const { error: updErr } = await admin
      .from("cinematic_ad_jobs")
      .update({
        status: "render_queued",
        render_token: renderToken,
        render_queued_at: new Date().toISOString(),
        render_started_at: null,
        render_heartbeat_at: null,
        render_dispatched_at: null,
        preset: effectivePreset.id,
        error_message: null,
        validation_report: null,
        motion_score: null,
        approved_at: null,
        approved_by: null,
        status_message: "Queued for external render worker.",
      })
      .eq("id", jobId);
    if (updErr) return json({ ok: false, traceId: trace, message: updErr.message }, 500);

    const webhookUrl = `${SUPABASE_URL}/functions/v1/cinematic-ad-render-webhook`;
    const productLock = job.product_lock && typeof job.product_lock === "object" && Object.keys(job.product_lock).length > 0
      ? job.product_lock
      : {
          product_id: job.product_id ?? null,
          product_slug: job.product_slug,
          product_name: job.product_name ?? job.product_slug,
          destination_url: job.pin_destination_url ?? `https://getpawsy.pet/products/${job.product_slug}?utm_source=pinterest&utm_medium=video_pin&utm_campaign=${effectivePreset.id}`,
        };
    const payload = {
      job_id: jobId,
      product_id: job.product_id ?? null,
      product_slug: job.product_slug,
      hook_variant: job.hook_variant,
      scene_assets: job.scene_assets,
      voiceover_url: job.vo_url,
      music_url: job.music_url,
      pin_title: job.pin_title,
      pin_description: job.pin_description,
      pin_destination_url: job.pin_destination_url,
      hashtags: job.hashtags,
      vo_script: job.vo_script,
      product_lock: productLock,
      output_target: `cinematic-ads/${job.product_slug}/${jobId}.mp4`,
      render_token: renderToken,
      webhook_url: webhookUrl,
      // NEW: viral-vertical contract — render worker must honor these
      composition_id: "viral-vertical",
      width: effectivePreset.width,
      height: effectivePreset.height,
      fps: effectivePreset.fps,
      duration_in_frames: totalFrames,
      preset: effectivePreset.id,
      input_props: {
        preset: effectivePreset.id,
        hook: job.hook_text ?? job.hook_variant ?? "Stop scrolling. Look at this.",
        subhook: job.subhook_text ?? undefined,
        cta: job.cta_text ?? "Tap to Shop →",
        ctaUrl: job.pin_destination_url ?? `https://getpawsy.pet/products/${job.product_slug}?utm_source=pinterest&utm_medium=video_pin&utm_campaign=${effectivePreset.id}`,
        product: {
          id: job.product_id ?? undefined,
          name: job.product_name ?? job.product_slug,
          price: job.product_price ?? "",
          slug: job.product_slug,
        },
        media: Array.isArray(job.scene_assets) ? job.scene_assets : [],
        music: job.music_url ?? undefined,
        disclosure: effectivePreset.disclosure,
        hookByFrame: effectivePreset.hookByFrame,
        ctaHoldFrames: effectivePreset.ctaHoldFrames,
      },
    };

    const command = `JOB_ID=${jobId} RENDER_TOKEN=${renderToken} WEBHOOK_URL=${webhookUrl} bun remotion/scripts/render-cinematic-ad.mjs`;

    return json({
      ok: true,
      traceId: trace,
      message: "Queued for render worker.",
      payload,
      preset: effectivePreset,
      command,
      webhook_url: webhookUrl,
      worker_secret_configured: RENDER_WORKER_SECRET.length > 0,
    });
  } catch (e) {
    return json({ ok: false, traceId: trace, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}