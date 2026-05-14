import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

function traceId() { return crypto.randomUUID().slice(0, 8); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = traceId();
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ ok: false, traceId: trace, message: "unauthenticated" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ ok: false, traceId: trace, message: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id ?? "");
    if (!jobId) return json({ ok: false, traceId: trace, message: "job_id required" }, 400);

    const { data: job, error: jobErr } = await admin
      .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
    if (jobErr || !job) return json({ ok: false, traceId: trace, message: "job not found" }, 404);
    if (!["prepared", "failed", "render_queued"].includes(job.status)) {
      return json({ ok: false, traceId: trace, message: `job status '${job.status}' not eligible (need prepared/failed)` }, 400);
    }

    const renderToken = crypto.randomUUID();
    const { error: updErr } = await admin
      .from("cinematic_ad_jobs")
      .update({
        status: "render_queued",
        render_token: renderToken,
        render_queued_at: new Date().toISOString(),
        error_message: null,
        status_message: "Queued for external render worker.",
      })
      .eq("id", jobId);
    if (updErr) return json({ ok: false, traceId: trace, message: updErr.message }, 500);

    const webhookUrl = `${SUPABASE_URL}/functions/v1/cinematic-ad-render-webhook`;
    const payload = {
      job_id: jobId,
      product_slug: job.product_slug,
      hook_variant: job.hook_variant,
      scene_assets: job.scene_assets,
      voiceover_url: job.vo_url,
      music_url: job.music_url,
      output_target: `cinematic-ads/${job.product_slug}/${jobId}.mp4`,
      render_token: renderToken,
      webhook_url: webhookUrl,
    };

    const command = `JOB_ID=${jobId} RENDER_TOKEN=${renderToken} WEBHOOK_URL=${webhookUrl} bun remotion/scripts/render-cinematic-ad.mjs`;

    return json({
      ok: true,
      traceId: trace,
      message: "Queued for render worker.",
      payload,
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