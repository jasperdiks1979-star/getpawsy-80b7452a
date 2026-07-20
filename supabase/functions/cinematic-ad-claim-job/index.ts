import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getPreset, durationFrames } from "../_shared/cinematic-presets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
// Only the GitHub Actions render-cinematic-ad.yml workflow may claim render_queued
// jobs. Any other worker (e.g. an external Node.js render-worker that is failing
// to actually render and just burns the per-product 24h budget) is locked out
// unless the operator explicitly flips CLAIM_JOB_ALLOW_NON_GH=1.
const ALLOW_NON_GH_WORKERS = (Deno.env.get("CLAIM_JOB_ALLOW_NON_GH") ?? "") === "1";
const GH_WORKER_PREFIXES = ["gh-actions-", "gh-trim-", "render-worker-"];
function isGhWorker(workerId: string): boolean {
  return GH_WORKER_PREFIXES.some((p) => workerId.startsWith(p));
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function secretFingerprint(secret: string) {
  if (!secret) {
    return {
      length: 0,
      sha256_prefix: null,
      has_leading_ws: false,
      has_trailing_ws: false,
      has_quotes: false,
    };
  }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return {
    length: secret.length,
    sha256_prefix: hex.slice(0, 12),
    has_leading_ws: /^\s/.test(secret),
    has_trailing_ws: /\s$/.test(secret),
    has_quotes: /^["'].*["']$/.test(secret),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    const secret = req.headers.get("x-render-secret") ?? "";
    console.log("[claim-job] secret fingerprint", {
      traceId,
      env_var: "RENDER_WORKER_SECRET",
      configured: await secretFingerprint(RENDER_WORKER_SECRET),
      incoming: await secretFingerprint(secret),
    });
    if (!RENDER_WORKER_SECRET || secret !== RENDER_WORKER_SECRET) {
      return json({ ok: false, traceId, message: "unauthorized" }, 401);
    }
    const body = await req.json().catch(() => ({}));
    const workerId = String(body.worker_id ?? "anonymous");
    const explicitJobId = body.job_id ? String(body.job_id) : null;

    // Gate: only the GitHub Actions render workflow may claim. Blocks rogue
    // external Node workers from intercepting jobs and burning render budgets.
    if (!ALLOW_NON_GH_WORKERS && !isGhWorker(workerId)) {
      console.warn(`[claim-job] ${traceId} blocked non-gh worker=${workerId} job=${explicitJobId ?? "<auto>"}`);
      return json({
        ok: false,
        traceId,
        reason: "non_gh_worker_blocked",
        message: "Only gh-actions-*, gh-trim-*, or render-worker-* workers may claim render_queued jobs. Set CLAIM_JOB_ALLOW_NON_GH=1 to override.",
        worker_id: workerId,
      }, 403);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let supabaseHost = "unknown";
    try { supabaseHost = new URL(SUPABASE_URL).host; } catch { /* noop */ }

    // Diagnostic: count queued jobs and surface select errors.
    const queuedCountRes = await admin
      .from("cinematic_ad_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "render_queued");
    const queuedCount = queuedCountRes.count ?? 0;
    if (queuedCountRes.error) {
      console.error(`[claim-job] ${traceId} queued count error`, queuedCountRes.error);
    }
    console.log(`[claim-job] ${traceId} host=${supabaseHost} queued_count=${queuedCount} worker=${workerId}`);

    const CLAIMABLE_STATUSES = ["render_queued", "rendering", "awaiting_render", "approved", "queued"];

    // When a specific job_id is requested, do a detailed pre-flight diagnostic
    // so callers (GitHub Actions) know exactly why a claim is refused.
    if (explicitJobId) {
      const { data: row, error: rowErr } = await admin
        .from("cinematic_ad_jobs")
        .select("id,status,approved_at,render_worker_id,render_started_at,updated_at,approved_for_render,error_message")
        .eq("id", explicitJobId)
        .maybeSingle();
      if (rowErr) {
        console.error(`[claim-job] ${traceId} lookup error`, rowErr);
        return json({ ok: false, traceId, message: rowErr.message, supabase_host: supabaseHost }, 500);
      }
      if (!row) {
        return json({
          ok: false, traceId,
          reason: "job_not_found",
          found: false,
          job_id: explicitJobId,
          expected_statuses: CLAIMABLE_STATUSES,
          supabase_host: supabaseHost,
        }, 404);
      }
      if (!CLAIMABLE_STATUSES.includes(row.status)) {
        return json({
          ok: false, traceId,
          reason: "job_not_claimable_status",
          found: true,
          job_id: row.id,
          current_status: row.status,
          approved_at: row.approved_at,
          approved_for_render: row.approved_for_render,
          render_worker_id: row.render_worker_id,
          started_at: row.render_started_at,
          updated_at: row.updated_at,
          error_message: row.error_message,
          expected_statuses: CLAIMABLE_STATUSES,
          supabase_host: supabaseHost,
        }, 409);
      }
    }

    // Refuse if something already rendering (1 job at a time globally)
    const { count: activeCount } = await admin
      .from("cinematic_ad_jobs").select("id", { count: "exact", head: true }).eq("status", "rendering");
    if ((activeCount ?? 0) > 0 && !explicitJobId) {
      return json({ ok: true, traceId, job: null, reason: "another job is rendering", queued_count: queuedCount, supabase_host: supabaseHost });
    }

    console.log(`[claim-job] ${traceId} claim request explicit=${Boolean(explicitJobId)} requested_job=${explicitJobId ?? "auto"}`);

    // ── SAFETY GATE: refuse to render anything that hasn't passed preflight
    //    and doesn't have a creative_plan. Stops credit-burning legacy renders. ──
    if (explicitJobId) {
      const { data: gateRow } = await admin
        .from("cinematic_ad_jobs")
        .select("preflight_status, creative_plan, legacy_unverified, product_slug, blocked_reason")
        .eq("id", explicitJobId)
        .maybeSingle();
      const failReasons: string[] = [];
      if (!gateRow) failReasons.push("job_missing");
      if (gateRow?.legacy_unverified) failReasons.push("legacy_unverified");
      if (gateRow && gateRow.preflight_status !== "pass") failReasons.push(`preflight_${gateRow.preflight_status ?? "missing"}`);
      if (gateRow && !gateRow.creative_plan) failReasons.push("creative_plan_missing");
      if (failReasons.length > 0) {
        return json({
          ok: false, traceId,
          reason: "blocked_by_safety_gate",
          fail_reasons: failReasons,
          blocked_reason: gateRow?.blocked_reason ?? null,
          supabase_host: supabaseHost,
        }, 412);
      }
      // Render budget: 1 expensive render / product / 24h, with admin force override.
      // Reads the per-job force_render_budget_override flag (set by queue-render when
      // an admin explicitly checks "Force render despite 24h product budget").
      const { data: forceRow } = await admin
        .from("cinematic_ad_jobs")
        .select("force_render_budget_override, force_render_budget_by")
        .eq("id", explicitJobId)
        .maybeSingle();
      const forceOverride = Boolean(forceRow?.force_render_budget_override);
      const { data: budget } = await admin.rpc("cinematic_reserve_render_slot", {
        p_product_slug: gateRow!.product_slug,
        p_force: forceOverride,
        p_admin_user_id: (forceRow?.force_render_budget_by as string | null) ?? null,
        p_force_reason: forceOverride ? "pinterest_ad_studio_admin_force" : null,
      }).maybeSingle();
      if (budget && budget.allowed === false) {
        // Don't leave the job frozen in render_queued — move it to
        // needs_admin_review with a clear status_message + reset_at so the UI
        // can surface "Product render budget resets at <timestamp>" and the
        // worker stops re-claiming it on every poll.
        const resetAt = (budget as any).reset_at ?? (budget as any).last_at ?? null;
        const resetIso = resetAt ? new Date(resetAt as string).toISOString() : null;
        const msg = resetIso
          ? `Render budget exhausted for ${gateRow!.product_slug} — resets at ${resetIso}. Use "Force render despite 24h product budget" to override.`
          : `Render budget exhausted for ${gateRow!.product_slug}.`;
        await admin.from("cinematic_ad_jobs").update({
          status: "needs_admin_review",
          status_message: msg,
          blocked_reason: "render_budget_24h_exhausted",
          render_queued_at: null,
          render_dispatched_at: null,
          render_token: null,
          recoverable: true,
        }).eq("id", explicitJobId);
        console.warn(`[claim-job] ${traceId} budget block job=${explicitJobId} product=${gateRow!.product_slug} reset_at=${resetIso}`);
        return json({
          ok: false, traceId,
          reason: "render_budget_24h_exhausted",
          product_slug: gateRow!.product_slug,
          last_render_at: (budget as any).last_at,
          reset_at: resetIso,
          job_status: "needs_admin_review",
          supabase_host: supabaseHost,
        }, 429);
      }
    }

    const { data: locked, error: lockErr } = await admin.rpc("claim_cinematic_ad_job", {
      p_worker_id: workerId,
      p_job_id: explicitJobId,
    }).maybeSingle();
    if (lockErr) {
      console.error(`[claim-job] ${traceId} atomic lock error`, lockErr);
      return json({ ok: false, traceId, message: lockErr.message, supabase_host: supabaseHost }, 500);
    }
    if (!locked) {
      // For explicit jobs, re-read current row to give actionable diagnostics
      // (e.g., another worker grabbed it between pre-flight and RPC).
      if (explicitJobId) {
        const { data: row2 } = await admin
          .from("cinematic_ad_jobs")
          .select("id,status,approved_at,render_worker_id,render_started_at,updated_at,error_message")
          .eq("id", explicitJobId)
          .maybeSingle();
        return json({
          ok: false, traceId,
          reason: "job_not_claimable_status",
          found: Boolean(row2),
          job_id: explicitJobId,
          current_status: row2?.status ?? null,
          approved_at: row2?.approved_at ?? null,
          render_worker_id: row2?.render_worker_id ?? null,
          started_at: row2?.render_started_at ?? null,
          updated_at: row2?.updated_at ?? null,
          error_message: row2?.error_message ?? null,
          expected_statuses: CLAIMABLE_STATUSES,
          supabase_host: supabaseHost,
        }, 409);
      }
      console.warn(`[claim-job] ${traceId} no atomic claim explicit=${Boolean(explicitJobId)} requested_job=${explicitJobId ?? "auto"}`);
      return json({ ok: true, traceId, job: null, reason: "no claimable job", queued_count: queuedCount, supabase_host: supabaseHost });
    }
    console.log(`[claim-job] ${traceId} selected job=${locked.id} previous_status=${locked.previous_status} lock_acquired=true worker=${workerId}`);
    console.log(`[claim-job] ${traceId} update success job=${locked.id} status=rendering attempts=${locked.render_attempts}`);

    // Phase 5: the claim RPC return shape does not include motion_storyboard /
    // engine_version / content_type — fetch them so the worker can route into
    // the Remotion cinematic compositor instead of the ffmpeg ken-burns path.
    let motionExtras: {
      motion_storyboard: unknown;
      motion_engine_version: string | null;
      motion_engine_used: string | null;
      engine_version: string | null;
      content_type: string | null;
    } = {
      motion_storyboard: null,
      motion_engine_version: null,
      motion_engine_used: null,
      engine_version: null,
      content_type: null,
    };
    try {
      const { data: extras } = await admin
        .from("cinematic_ad_jobs")
        .select("motion_storyboard, motion_engine_version, motion_engine_used, engine_version, content_type")
        .eq("id", locked.id)
        .maybeSingle();
      if (extras) motionExtras = extras as any;
    } catch (e) {
      console.warn(`[claim-job] ${traceId} motion extras fetch failed:`, (e as Error)?.message);
    }

    const outputTarget = `cinematic-ads/${locked.product_slug}/${locked.id}.mp4`;
    const outputStoragePath = outputTarget.replace(/^cinematic-ads\//, "");
    const thumbTarget = `cinematic-ads/${locked.product_slug}/${locked.id}-thumb.jpg`;
    const thumbStoragePath = thumbTarget.replace(/^cinematic-ads\//, "");
    const [mp4Upload, thumbUpload] = await Promise.all([
      admin.storage.from("cinematic-ads").createSignedUploadUrl(outputStoragePath, { upsert: true }),
      admin.storage.from("cinematic-ads").createSignedUploadUrl(thumbStoragePath, { upsert: true }),
    ]);
    if (mp4Upload.error || !mp4Upload.data) {
      console.error(`[claim-job] ${traceId} signed upload error`, mp4Upload.error);
      return json({ ok: false, traceId, message: mp4Upload.error?.message ?? "signed upload failed", supabase_host: supabaseHost }, 500);
    }

    return json({
      ok: true, traceId,
      queued_count: queuedCount,
      supabase_host: supabaseHost,
      job: (() => {
        const preset = getPreset(locked.preset);
        const totalFrames = durationFrames(preset);
        return {
          job_id: locked.id,
          product_id: locked.product_id ?? null,
          product_slug: locked.product_slug,
          hook_variant: locked.hook_variant,
          scene_assets: locked.scene_assets,
          voiceover_url: locked.vo_url,
          music_url: locked.music_url,
          pin_title: locked.pin_title ?? null,
          pin_description: locked.pin_description ?? null,
          pin_destination_url: locked.pin_destination_url ?? null,
          hashtags: locked.hashtags ?? [],
          vo_script: locked.vo_script ?? null,
          product_lock: locked.product_lock ?? {},
          render_token: locked.render_token,
          output_target: outputTarget,
          upload: {
            signed_url: mp4Upload.data.signedUrl,
            token: mp4Upload.data.token,
            bucket: "cinematic-ads",
            path: outputStoragePath,
            public_url: `${SUPABASE_URL}/storage/v1/object/public/${outputTarget}`,
          },
          thumbnail_upload: thumbUpload.data ? {
            signed_url: thumbUpload.data.signedUrl,
            token: thumbUpload.data.token,
            bucket: "cinematic-ads",
            path: thumbStoragePath,
            public_url: `${SUPABASE_URL}/storage/v1/object/public/${thumbTarget}`,
          } : null,
          webhook_url: `${SUPABASE_URL}/functions/v1/cinematic-ad-render-webhook`,
          // Phase 5: motion-engine enforcement payload — when motion_storyboard
          // is present + engine_version >= v3, the worker MUST dispatch to the
          // Remotion compositor; ffmpeg fallback is disabled in code.
          motion_storyboard: motionExtras.motion_storyboard,
          motion_engine_version: motionExtras.motion_engine_version,
          motion_engine_used: motionExtras.motion_engine_used,
          engine_version: motionExtras.engine_version,
          content_type: motionExtras.content_type,
          // Viral-vertical worker contract
          composition_id: "viral-vertical",
          preset: preset.id,
          width: preset.width,
          height: preset.height,
          fps: preset.fps,
          duration_in_frames: totalFrames,
          duration_seconds: preset.durationSec,
          motion_score_floor: preset.motionScoreFloor,
          input_props: {
            preset: preset.id,
            hook: locked.hook_text ?? locked.hook_variant ?? "Stop scrolling. Look at this.",
            subhook: locked.subhook_text ?? undefined,
            cta: locked.cta_text ?? "Tap to Shop →",
            ctaUrl: locked.pin_destination_url ?? `https://getpawsy.pet/products/${locked.product_slug}?utm_source=pinterest&utm_medium=video_pin&utm_campaign=${preset.id}`,
            product: {
              id: locked.product_id ?? undefined,
              name: locked.product_name ?? locked.product_slug,
              price: locked.product_price ?? "",
              slug: locked.product_slug,
            },
            media: Array.isArray(locked.scene_assets) ? locked.scene_assets : [],
            music: locked.music_url ?? undefined,
            disclosure: preset.disclosure,
            hookByFrame: preset.hookByFrame,
            ctaHoldFrames: preset.ctaHoldFrames,
          },
        };
      })(),
    });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});