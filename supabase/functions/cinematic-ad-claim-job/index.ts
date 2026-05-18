import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getPreset, durationFrames } from "../_shared/cinematic-presets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    const secret = req.headers.get("x-render-secret") ?? "";
    if (!RENDER_WORKER_SECRET || secret !== RENDER_WORKER_SECRET) {
      return json({ ok: false, traceId, message: "unauthorized" }, 401);
    }
    const body = await req.json().catch(() => ({}));
    const workerId = String(body.worker_id ?? "anonymous");
    const explicitJobId = body.job_id ? String(body.job_id) : null;

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

    // Refuse if something already rendering (1 job at a time globally)
    const { count: activeCount } = await admin
      .from("cinematic_ad_jobs").select("id", { count: "exact", head: true }).eq("status", "rendering");
    if ((activeCount ?? 0) > 0 && !explicitJobId) {
      return json({ ok: true, traceId, job: null, reason: "another job is rendering", queued_count: queuedCount, supabase_host: supabaseHost });
    }

    console.log(`[claim-job] ${traceId} claim request explicit=${Boolean(explicitJobId)} requested_job=${explicitJobId ?? "auto"}`);
    const { data: locked, error: lockErr } = await admin.rpc("claim_cinematic_ad_job", {
      p_worker_id: workerId,
      p_job_id: explicitJobId,
    }).maybeSingle();
    if (lockErr) {
      console.error(`[claim-job] ${traceId} atomic lock error`, lockErr);
      return json({ ok: false, traceId, message: lockErr.message, supabase_host: supabaseHost }, 500);
    }
    if (!locked) {
      console.warn(`[claim-job] ${traceId} no atomic claim explicit=${Boolean(explicitJobId)} requested_job=${explicitJobId ?? "auto"}`);
      return json({ ok: true, traceId, job: null, reason: "no claimable job", queued_count: queuedCount, supabase_host: supabaseHost });
    }
    console.log(`[claim-job] ${traceId} selected job=${locked.id} previous_status=${locked.previous_status} lock_acquired=true worker=${workerId}`);
    console.log(`[claim-job] ${traceId} update success job=${locked.id} status=rendering attempts=${locked.render_attempts}`);

    return json({
      ok: true, traceId,
      queued_count: queuedCount,
      supabase_host: supabaseHost,
      job: (() => {
        const preset = getPreset(locked.preset);
        const totalFrames = durationFrames(preset);
        return {
          job_id: locked.id,
          product_slug: locked.product_slug,
          hook_variant: locked.hook_variant,
          scene_assets: locked.scene_assets,
          voiceover_url: locked.vo_url,
          music_url: locked.music_url,
          render_token: locked.render_token,
          output_target: `cinematic-ads/${locked.product_slug}/${locked.id}.mp4`,
          webhook_url: `${SUPABASE_URL}/functions/v1/cinematic-ad-render-webhook`,
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
            ctaUrl: `https://getpawsy.pet/products/${locked.product_slug}?utm_source=pinterest&utm_medium=video_pin&utm_campaign=${preset.id}`,
            product: {
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