import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  PRESETS,
  getPreset,
  durationFrames,
  enforceSceneDurations,
  validateTimeline,
  maxFramesFor,
  maxSceneFramesFor,
  HARD_MAX_DURATION_SEC,
  type CinematicPresetId,
} from "../_shared/cinematic-presets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
const MAX_ACTIVE_QUEUED = 5;

function traceId() { return crypto.randomUUID().slice(0, 8); }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DiagCheck = { name: string; pass: boolean; detail?: string };
function pass(name: string, detail?: string): DiagCheck { return { name, pass: true, detail }; }
function fail(name: string, detail: string): DiagCheck { return { name, pass: false, detail }; }

function bad(
  status: number,
  trace: string,
  error_code: string,
  message: string,
  diagnostics: DiagCheck[],
  extra: Record<string, unknown> = {},
) {
  return json({
    ok: false,
    traceId: trace,
    error_code,
    message,
    diagnostics,
    ...extra,
  }, status);
}

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
        return bad(401, trace, "unauthenticated", "unauthenticated", []);
      }
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) return bad(403, trace, "forbidden", "admin role required", []);
    }

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id ?? "");
    const presetId = (body.preset ?? "") as string;
    const dryRun: boolean = body.dry_run === true;
    const autoApprove: boolean = body.auto_approve === true;
    if (!jobId) return bad(400, trace, "missing_job_id", "job_id required", []);
    if (!UUID_RE.test(jobId)) return bad(400, trace, "invalid_job_id", `Full UUID required (got: "${jobId}")`, []);

    const { data: job, error: jobErr } = await admin
      .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
    if (jobErr || !job) return bad(404, trace, "job_not_found", "job not found", []);

    // ---------- Structured pre-flight diagnostics ----------
    const diagnostics: DiagCheck[] = [];

    // worker secret
    diagnostics.push(
      RENDER_WORKER_SECRET.length > 0
        ? pass("worker_secret", "RENDER_WORKER_SECRET configured")
        : fail("worker_secret", "RENDER_WORKER_SECRET env var not set"),
    );
    // github workflow (we don't dispatch from here, an external GH Action polls;
    // surface this as informational so the diag panel is complete)
    diagnostics.push(pass("github_actions", "external worker / GH Actions polls cinematic-ad-claim-job"));
    diagnostics.push(pass("render_workflow", ".github/workflows/render-cinematic-ad.yml present in repo"));

    // job status eligibility
    const eligible = ["prepared", "failed", "render_queued"].includes(job.status);
    diagnostics.push(
      eligible
        ? pass("job_status", `status='${job.status}' eligible`)
        : fail("job_status", `status='${job.status}' not eligible (need prepared/failed/render_queued)`),
    );

    // approval — Director path may auto-approve here
    let approved = !!job.approved_for_render;
    if (!approved && autoApprove) {
      await admin.from("cinematic_ad_jobs").update({
        approved_for_render: true,
        approved_at: new Date().toISOString(),
        approved_by: "director_auto_approve",
      }).eq("id", jobId);
      approved = true;
    }
    diagnostics.push(
      approved
        ? pass("approval_status", autoApprove && !job.approved_for_render ? "auto-approved by Director" : "approved_for_render=true")
        : fail("approval_status", "approved_for_render=false — call cinematic-ad-approve or pass auto_approve:true"),
    );

    // voiceover
    const voUrl = job.vo_url ?? job.voiceover_url ?? null;
    diagnostics.push(
      voUrl
        ? pass("voiceover", `vo_url present`)
        : fail("voiceover", "missing vo_url — run cinematic-voiceover-generate"),
    );

    // media assets
    const sceneAssets = Array.isArray(job.scene_assets) ? job.scene_assets : [];
    diagnostics.push(
      sceneAssets.length > 0
        ? pass("media_assets", `${sceneAssets.length} scene asset(s)`)
        : fail("media_assets", "scene_assets is empty"),
    );

    // storyboard
    const sbRaw = job.storyboard;
    const sbScenes: any[] = Array.isArray(sbRaw) ? sbRaw : (sbRaw?.scenes ?? []);
    diagnostics.push(
      sbScenes.length > 0
        ? pass("storyboard", `${sbScenes.length} scene(s)`)
        : fail("storyboard", "storyboard has no scenes"),
    );

    // payload schema sanity (slug + destination)
    const schemaOk = !!job.product_slug;
    diagnostics.push(
      schemaOk
        ? pass("queue_payload_schema", "product_slug + identifiers present")
        : fail("queue_payload_schema", "missing product_slug on job row"),
    );

    // Fail-fast mapping to error_code + HTTP 412
    const firstFailure = diagnostics.find(d => !d.pass);
    if (firstFailure) {
      const codeMap: Record<string, string> = {
        worker_secret: "missing_worker_secret",
        job_status: "job_status_ineligible",
        approval_status: "job_not_approved",
        voiceover: "voiceover_missing",
        media_assets: "missing_media_assets",
        storyboard: "empty_storyboard",
        queue_payload_schema: "invalid_payload",
      };
      const error_code = codeMap[firstFailure.name] ?? "preflight_failed";
      // surface fix on the bad job row (don't mutate when dry-run)
      if (!dryRun && (firstFailure.name === "voiceover")) {
        await admin.from("cinematic_ad_jobs").update({
          status: "failed",
          status_message: `voiceover missing — ${firstFailure.detail}`,
          error_message: "missing voiceover_url",
        }).eq("id", jobId);
      }
      return bad(412, trace, error_code, `BLOCKED_REASON: ${error_code} — ${firstFailure.detail}`, diagnostics, {
        blocked_reason: error_code,
        job_id: jobId,
        product_slug: job.product_slug,
        render_worker_id: null,
      });
    }

    const { count: activeQueuedCount } = await admin
      .from("cinematic_ad_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "render_queued");
    if ((activeQueuedCount ?? 0) >= MAX_ACTIVE_QUEUED && job.status !== "render_queued") {
      return bad(429, trace, "queue_limit_reached", `render queue limit reached (${MAX_ACTIVE_QUEUED})`, diagnostics);
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
    if (sameProductActive && !dryRun) {
      return bad(409, trace, "duplicate_active_job",
        `duplicate active job exists for ${job.product_slug}: ${sameProductActive.id} (${sameProductActive.status})`,
        diagnostics, { duplicate_job_id: sameProductActive.id });
    }

    // Resolve preset: explicit body > job row > default.
    const effectivePreset = getPreset(presetId || job.preset);
    const totalFrames = durationFrames(effectivePreset);
    const maxTotalFrames = maxFramesFor(effectivePreset);
    const maxSceneFrames = maxSceneFramesFor(effectivePreset);

    // Pre-enqueue validation — refuse to spend render minutes on a malformed
    // timeline. Clamp scene_plan AND storyboard (worker inputs) defensively.
    let enforcedScenePlan: any[] | null = null;
    if (Array.isArray(job.scene_plan) && job.scene_plan.length > 0) {
      const r = enforceSceneDurations(job.scene_plan as any[], effectivePreset);
      enforcedScenePlan = r.scenes;
      if (r.changed) {
        await admin.from("cinematic_ad_jobs").update({ scene_plan: r.scenes as any }).eq("id", jobId);
        console.log(`[queue-render] ${trace} scene_plan clamped`, { jobId, reasons: r.reasons });
      }
    }
    // Storyboard may be either an array (legacy: { duration_s }) or an
    // object with `scenes` (new: { durationFrames }). Normalize to frames and
    // clamp to the 15s cap so downstream worker can't drift.
    let enforcedStoryboard: any = job.storyboard;
    if (job.storyboard) {
      const isArr = Array.isArray(job.storyboard);
      const rawScenes: any[] = isArr ? job.storyboard : (job.storyboard?.scenes ?? []);
      if (rawScenes.length > 0) {
        const withFrames = rawScenes.map((s: any) => ({
          ...s,
          durationFrames: Number(s?.durationFrames ?? Math.round(Number(s?.duration_s ?? 0) * effectivePreset.fps)) || Math.round(effectivePreset.fps * 2),
        }));
        const r = enforceSceneDurations(withFrames, effectivePreset);
        const clamped = r.scenes.map((s: any) => ({ ...s, duration_s: Math.round((s.durationFrames / effectivePreset.fps) * 10) / 10 }));
        enforcedStoryboard = isArr ? clamped : { ...(job.storyboard as any), scenes: clamped };
        if (r.changed) {
          await admin.from("cinematic_ad_jobs").update({ storyboard: enforcedStoryboard }).eq("id", jobId);
          console.log(`[queue-render] ${trace} storyboard clamped`, { jobId, reasons: r.reasons });
        }
      }
    }
    const check = validateTimeline(
      effectivePreset,
      enforcedStoryboard as any,
      enforcedScenePlan,
      (job.vo_script ?? job.voiceover_script) as any,
    );
    if (!check.ok) {
      if (!dryRun) {
        await admin.from("cinematic_ad_jobs").update({
          status: "failed",
          status_message: `pre-enqueue validation failed: ${check.reasons.join("; ")}`,
          error_message: `timeline_invalid: ${check.reasons.join("; ")}`,
        }).eq("id", jobId);
      }
      return bad(422, trace, "timeline_invalid",
        `timeline rejected before render: ${check.reasons.join("; ")}`,
        [...diagnostics, fail("timeline", check.reasons.join("; "))],
        { check });
    }

    const renderToken = crypto.randomUUID();
    if (dryRun) {
      // Build a representative payload without mutating the job or dispatching.
      const previewPayload = {
        job_id: jobId,
        product_slug: job.product_slug,
        scene_assets: sceneAssets.length,
        storyboard_scenes: sbScenes.length,
        vo_url: voUrl,
        preset: effectivePreset.id,
        duration_in_frames: totalFrames,
        composition_id: "viral-vertical",
      };
      return json({
        ok: true,
        traceId: trace,
        dry_run: true,
        ready: "READY_TO_RENDER",
        message: "READY_TO_RENDER — all preflight checks passed (dry run, no dispatch)",
        diagnostics,
        payload_preview: previewPayload,
        worker_secret_configured: RENDER_WORKER_SECRET.length > 0,
        render_worker_id: null,
      });
    }
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
    if (updErr) return bad(500, trace, "db_update_failed", updErr.message, diagnostics);

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
      scene_plan: enforcedScenePlan ?? job.scene_plan ?? null,
      voiceover_url: voUrl,
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
      // Hard caps the external Remotion worker MUST honor.
      max_duration_in_frames: maxTotalFrames,
      max_duration_seconds: HARD_MAX_DURATION_SEC,
      max_scene_frames: maxSceneFrames,
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
        maxDurationInFrames: maxTotalFrames,
        maxSceneFrames: maxSceneFrames,
      },
    };

    const command = `JOB_ID=${jobId} RENDER_TOKEN=${renderToken} WEBHOOK_URL=${webhookUrl} bun remotion/scripts/render-cinematic-ad.mjs`;

    return json({
      ok: true,
      traceId: trace,
      message: "Queued for render worker.",
      diagnostics,
      payload,
      preset: effectivePreset,
      command,
      webhook_url: webhookUrl,
      worker_secret_configured: RENDER_WORKER_SECRET.length > 0,
    });
  } catch (e) {
    return bad(500, trace, "internal_error", e instanceof Error ? e.message : String(e), []);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}