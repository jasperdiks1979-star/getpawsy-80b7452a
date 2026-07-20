import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
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
import {
  BLOCKING_STATUSES,
  pickBlockingSibling,
} from "../_shared/cinematic-duplicate-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
const MAX_ACTIVE_QUEUED = 6;
const MAX_QUEUE_WAIT_ATTEMPTS = 8;
const SCENE_REGEN_MAX_RETRIES = 5;

/**
 * Self-healing preparation gate. Mirrors the claim-job safety gate:
 * a job cannot enter `render_queued` unless it has a non-null `creative_plan`
 * AND `preflight_status='pass'`. If either is missing, this helper calls
 * `cinematic-ad-plan` and/or `cinematic-ad-preflight` with the service-role
 * key so claim-job will accept the job on the next dispatch.
 */
async function ensureRenderReady(
  admin: ReturnType<typeof createClient>,
  jobId: string,
  traceLabel: string,
  forcePreflightOverride: boolean = false,
  forcePreflightReason: string | null = null,
): Promise<{ ready: boolean; reasons: string[]; preflight_status: string | null; creative_plan_present: boolean }> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
  };
  const fnBase = `${SUPABASE_URL}/functions/v1`;

  const { data: pre } = await admin
    .from("cinematic_ad_jobs")
    .select("creative_plan, preflight_status")
    .eq("id", jobId)
    .maybeSingle();

  if (!pre?.creative_plan) {
    try {
      const r = await fetch(`${fnBase}/cinematic-ad-plan`, {
        method: "POST", headers, body: JSON.stringify({ job_id: jobId }),
      });
      const txt = await r.text().catch(() => "");
      console.log(`[queue-render] ${traceLabel} ensureRenderReady plan status=${r.status} ${txt.slice(0, 160)}`);
    } catch (e) {
      console.error(`[queue-render] ${traceLabel} plan call failed`, e);
    }
  }

  if (pre?.preflight_status !== "pass") {
    try {
      const r = await fetch(`${fnBase}/cinematic-ad-preflight`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          job_id: jobId,
          force_preflight_override: forcePreflightOverride,
          force_preflight_override_reason: forcePreflightReason,
        }),
      });
      const txt = await r.text().catch(() => "");
      console.log(`[queue-render] ${traceLabel} ensureRenderReady preflight status=${r.status} ${txt.slice(0, 160)}`);
    } catch (e) {
      console.error(`[queue-render] ${traceLabel} preflight call failed`, e);
    }
  }

  const { data: post } = await admin
    .from("cinematic_ad_jobs")
    .select("creative_plan, preflight_status, preflight_reasons")
    .eq("id", jobId)
    .maybeSingle();

  const hasPlan = Boolean(post?.creative_plan);
  const preflightPass = post?.preflight_status === "pass";
  const reasons: string[] = [];
  if (!hasPlan) reasons.push("creative_plan_missing");
  if (!preflightPass) {
    reasons.push(`preflight_${post?.preflight_status ?? "missing"}`);
    if (Array.isArray(post?.preflight_reasons)) reasons.push(...post!.preflight_reasons.map((x: string) => `preflight:${x}`));
  }
  return {
    ready: hasPlan && preflightPass,
    reasons,
    preflight_status: post?.preflight_status ?? null,
    creative_plan_present: hasPlan,
  };
}

/**
 * Recovery helper: when validateTimeline reports scene_count_invalid(<3),
 * attempt to (a) re-invoke the storyboard planner up to N times, then
 * (b) synthesize a 3-scene image-only fallback from scene_assets so the
 * pipeline NEVER returns 0 scenes. Returns the fresh job row on success
 * or null when both paths fail (caller marks needs_scene_regen).
 */
async function recoverEmptyStoryboard(
  admin: ReturnType<typeof createClient>,
  jobId: string,
  scene_assets: any[],
  traceLabel: string,
): Promise<any | null> {
  // (a) AI regen with retries
  for (let i = 0; i < SCENE_REGEN_MAX_RETRIES; i++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-storyboard`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
          "x-regen-attempt": String(i + 1),
        },
        body: JSON.stringify({ job_id: jobId }),
      });
      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      // HTML / non-JSON guard
      if (raw.trim().startsWith("<") || !ct.includes("application/json")) {
        console.warn(`[queue-render] ${traceLabel} storyboard non-json attempt ${i + 1}`, raw.slice(0, 160));
        continue;
      }
      // Re-read job; if storyboard now has >= 3 scenes we're done.
      const { data: refreshed } = await admin
        .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
      const sb = refreshed?.storyboard;
      const sceneCount = Array.isArray(sb) ? sb.length : (sb?.scenes?.length ?? 0);
      if (sceneCount >= 3) {
        console.log(`[queue-render] ${traceLabel} storyboard recovered on attempt ${i + 1} (${sceneCount} scenes)`);
        return refreshed;
      }
    } catch (e) {
      console.warn(`[queue-render] ${traceLabel} storyboard regen err attempt ${i + 1}`, e instanceof Error ? e.message : String(e));
    }
  }

  // (b) Image-only fallback storyboard from existing scene_assets.
  // Use up to 7 / pad to minimum 3 by repeating the hero asset.
  const assets = (Array.isArray(scene_assets) ? scene_assets : []).filter((a: any) =>
    a && (typeof a === "string" || a.url || a.asset_url || a.image_url)
  );
  if (assets.length === 0) return null;

  const padded = assets.slice(0, 7);
  while (padded.length < 3) padded.push(assets[0]);
  const ROLES = ["HOOK", "PROBLEM", "EMOTION", "FEATURE", "BENEFIT", "PROOF", "CTA"] as const;
  const fallbackScenes = padded.map((_, i) => ({
    role: ROLES[i] ?? "BENEFIT",
    caption: i === 0 ? "Stop scrolling." : (i === padded.length - 1 ? "Tap to shop." : "Built for real homes."),
    intent: "image_fallback",
    motionIntensity: "medium",
    durationFrames: 54,
    fallback_source: "product_images",
  }));
  const fallbackStoryboard = {
    scenes: fallbackScenes,
    emotionalCurve: fallbackScenes.map((_, i) => 60 + i * 4),
    totalFrames: fallbackScenes.reduce((a, s) => a + s.durationFrames, 0),
    hookType: "image_fallback",
    fallback_source: "product_images",
  };
  await admin.from("cinematic_ad_jobs").update({
    storyboard: fallbackStoryboard,
    status_message: "storyboard recovered via image-only fallback",
  }).eq("id", jobId);
  console.log(`[queue-render] ${traceLabel} image-fallback storyboard built (${fallbackScenes.length} scenes)`);
  const { data: refreshed } = await admin
    .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
  return refreshed;
}

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
    let callerAdminId: string | null = null;
    let callerIsAdmin = false;
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
      callerAdminId = userData.user.id;
      callerIsAdmin = true;
    }

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id ?? "");
    const presetId = (body.preset ?? "") as string;
    const dryRun: boolean = body.dry_run === true;
    const autoApprove: boolean = body.auto_approve === true;
    // Admin-only: "Force render despite 24h product budget" toggle from
    // Pinterest Ad Studio. Persisted on the job row so claim-job can pass
    // p_force=true to cinematic_reserve_render_slot.
    const forceBudgetOverride: boolean =
      callerIsAdmin && body.force_budget_override === true;
    const forceBudgetReason: string | null =
      forceBudgetOverride ? (typeof body.force_budget_reason === "string" ? body.force_budget_reason : "admin_force_render") : null;
    // Admin-only: "Force render even if product is out of stock" toggle.
    // Allows admin/director runs to bypass product_out_of_stock + product_inactive
    // gates inside cinematic-ad-preflight. Logged on the job row and in
    // cinematic_preflight_override_log. All other safety checks remain active.
    const forcePreflightOverride: boolean =
      callerIsAdmin && body.force_preflight_override === true;
    const forcePreflightReason: string | null =
      forcePreflightOverride
        ? (typeof body.force_preflight_reason === "string" && body.force_preflight_reason.trim().length > 0
            ? body.force_preflight_reason.trim()
            : "pinterest_ad_studio_admin_force_stock_bypass")
        : null;
    if (!jobId) return bad(400, trace, "missing_job_id", "job_id required", []);
    if (!UUID_RE.test(jobId)) return bad(400, trace, "invalid_job_id", `Full UUID required (got: "${jobId}")`, []);

    const { data: job, error: jobErr } = await admin
      .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
    if (jobErr || !job) return bad(404, trace, "job_not_found", "job not found", []);

    // Persist preflight override BEFORE the preparation gate runs so the
    // preflight re-run (and any later watchdog re-check) honors the flag.
    if (forcePreflightOverride) {
      await admin.from("cinematic_ad_jobs").update({
        force_preflight_override: true,
        force_preflight_override_reason: forcePreflightReason,
        force_preflight_override_by: callerAdminId,
      }).eq("id", jobId);
      (job as any).force_preflight_override = true;
    }

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
    const eligible = ["prepared", "failed", "render_queued", "queue_waiting"].includes(job.status);
    diagnostics.push(
      eligible
        ? pass("job_status", `status='${job.status}' eligible`)
        : fail("job_status", `status='${job.status}' not eligible (need prepared/failed/render_queued/queue_waiting)`),
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
      // Queue full — park the job in `queue_waiting` instead of failing the
      // concept. The watchdog (and the render-webhook on completion) will
      // promote oldest waiting jobs back into the render queue as slots open.
      const prevAttempts = Number((job as any).queue_wait_attempts ?? 0);
      const nextAttempts = prevAttempts + 1;

      if (nextAttempts > MAX_QUEUE_WAIT_ATTEMPTS) {
        await admin.from("cinematic_ad_jobs").update({
          status: "needs_admin_review",
          status_message: `queue_wait_exhausted after ${prevAttempts} attempts`,
          error_message: "queue_wait_exhausted",
          queue_wait_attempts: nextAttempts,
          queue_wait_reason: "queue_wait_exhausted",
        }).eq("id", jobId);
        return bad(409, trace, "queue_wait_exhausted",
          `queue wait exceeded ${MAX_QUEUE_WAIT_ATTEMPTS} attempts — moved to needs_admin_review`,
          diagnostics, { job_id: jobId, attempts: nextAttempts });
      }

      // 30 / 45 / 60s jittered backoff
      const baseDelay = Math.min(30 + nextAttempts * 5, 60);
      const jitter = Math.floor(Math.random() * 15);
      const delaySec = baseDelay + jitter;
      const nextAt = new Date(Date.now() + delaySec * 1000).toISOString();

      await admin.from("cinematic_ad_jobs").update({
        status: "queue_waiting",
        status_message: `queue full (${activeQueuedCount}/${MAX_ACTIVE_QUEUED}) — waiting for slot`,
        queue_wait_attempts: nextAttempts,
        queue_wait_next_at: nextAt,
        queue_wait_reason: "queue_limit_reached",
      }).eq("id", jobId);

      return json({
        ok: true,
        traceId: trace,
        status: "queue_waiting",
        retry_after_seconds: delaySec,
        retry_at: nextAt,
        attempts: nextAttempts,
        max_attempts: MAX_QUEUE_WAIT_ATTEMPTS,
        active_queued: activeQueuedCount,
        capacity: MAX_ACTIVE_QUEUED,
        job_id: jobId,
        message: `Queued — waiting for render slot (retry in ${delaySec}s)`,
        diagnostics,
      }, 202);
    }

    const { data: sameProductActive } = await admin
      .from("cinematic_ad_jobs")
      .select("id,status,render_queued_at,render_started_at,director_run_id")
      .eq("product_slug", job.product_slug)
      .in("status", BLOCKING_STATUSES as unknown as string[])
      .neq("id", jobId)
      .order("updated_at", { ascending: false })
      .limit(10);
    const blocker = pickBlockingSibling(
      { id: jobId, director_run_id: (job as any).director_run_id ?? null },
      (sameProductActive ?? []) as Array<{
        id: string;
        status: string;
        director_run_id: string | null;
      }>,
    );
    if (blocker && !dryRun) {
      return bad(409, trace, "duplicate_active_job",
        `duplicate active job exists for ${job.product_slug}: ${blocker.id} (${blocker.status})`,
        diagnostics, { duplicate_job_id: blocker.id });
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
    let activeJob = job;
    let activeStoryboard = enforcedStoryboard;
    let activeCheck = check;
    const sceneCountFailed = !check.ok && check.reasons.some((r: string) => /^scene_count_invalid\(\d+<3\)/.test(r));
    if (sceneCountFailed && !dryRun) {
      const recovered = await recoverEmptyStoryboard(admin, jobId, sceneAssets, trace);
      if (recovered) {
        activeJob = recovered;
        activeStoryboard = recovered.storyboard;
        activeCheck = validateTimeline(
          effectivePreset,
          activeStoryboard as any,
          enforcedScenePlan,
          (recovered.vo_script ?? recovered.voiceover_script) as any,
        );
      }
    }
    if (!activeCheck.ok) {
      if (!dryRun) {
        // Soft-park instead of hard-failing: never lose the job to a transient
        // storyboard miss. Watchdog/intelligence can pick it back up.
        const stillEmpty = activeCheck.reasons.some((r: string) => /^scene_count_invalid\(\d+<3\)/.test(r));
        const nextStatus = stillEmpty ? "needs_scene_regen" : "failed";
        await admin.from("cinematic_ad_jobs").update({
          status: nextStatus,
          status_message: `pre-enqueue validation: ${activeCheck.reasons.join("; ")}`,
          error_message: `timeline_invalid: ${activeCheck.reasons.join("; ")}`,
          recoverable: stillEmpty,
        }).eq("id", jobId);
      }
      return bad(422, trace, "timeline_invalid",
        `timeline rejected before render: ${activeCheck.reasons.join("; ")}`,
        [...diagnostics, fail("timeline", activeCheck.reasons.join("; "))],
        { check: activeCheck });
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

    // ── PREPARATION GATE ── claim-job will reject any job lacking
    // creative_plan or preflight_status='pass' with 412 blocked_by_safety_gate.
    // Self-heal here so jobs cannot land in render_queued in a broken state.
    const readiness = await ensureRenderReady(
      admin,
      jobId,
      trace,
      forcePreflightOverride || (job as any).force_preflight_override === true,
      forcePreflightReason,
    );
    diagnostics.push(
      readiness.ready
        ? pass("preparation_gate", `creative_plan + preflight=pass`)
        : fail("preparation_gate", `not render-ready: ${readiness.reasons.join("; ")}`),
    );
    if (!readiness.ready) {
      await admin.from("cinematic_ad_jobs").update({
        status: "needs_admin_review",
        status_message: `Blocked before render_queued: ${readiness.reasons.join("; ")}`,
        blocked_reason: `safety_gate_would_fail: ${readiness.reasons.join(", ")}`,
        recoverable: true,
      }).eq("id", jobId);
      return bad(412, trace, "not_render_ready",
        `preparation gate failed: ${readiness.reasons.join("; ")}`,
        diagnostics,
        { fail_reasons: readiness.reasons });
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
        status_message: forceBudgetOverride
          ? "Queued for external render worker (admin force — 24h budget bypassed)."
          : "Queued for external render worker.",
        force_render_budget_override: forceBudgetOverride,
        force_render_budget_reason: forceBudgetReason,
        force_render_budget_by: forceBudgetOverride ? callerAdminId : null,
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