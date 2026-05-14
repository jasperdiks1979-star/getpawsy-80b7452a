import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

    // Refuse if something already rendering (1 job at a time globally)
    const { count: activeCount } = await admin
      .from("cinematic_ad_jobs").select("id", { count: "exact", head: true }).eq("status", "rendering");
    if ((activeCount ?? 0) > 0 && !explicitJobId) {
      return json({ ok: true, traceId, job: null, reason: "another job is rendering" });
    }

    let q = admin.from("cinematic_ad_jobs").select("*");
    if (explicitJobId) q = q.eq("id", explicitJobId);
    else q = q.eq("status", "render_queued").order("render_queued_at", { ascending: true }).limit(1);
    const { data: jobs, error: qErr } = await q;
    if (qErr) return json({ ok: false, traceId, message: qErr.message }, 500);
    const job = jobs?.[0];
    if (!job) return json({ ok: true, traceId, job: null, reason: "no jobs" });

    // Lock by setting rendering status only if still queued
    const { data: locked, error: lockErr } = await admin
      .from("cinematic_ad_jobs")
      .update({
        status: "rendering",
        render_worker_id: workerId,
        render_started_at: new Date().toISOString(),
        render_attempts: (job.render_attempts ?? 0) + 1,
        status_message: `worker ${workerId} claimed job`,
      })
      .eq("id", job.id)
      .in("status", ["render_queued", "rendering"])
      .select()
      .maybeSingle();
    if (lockErr) return json({ ok: false, traceId, message: lockErr.message }, 500);
    if (!locked) return json({ ok: true, traceId, job: null, reason: "lock lost" });

    return json({
      ok: true, traceId,
      job: {
        job_id: locked.id,
        product_slug: locked.product_slug,
        hook_variant: locked.hook_variant,
        scene_assets: locked.scene_assets,
        voiceover_url: locked.vo_url,
        music_url: locked.music_url,
        render_token: locked.render_token,
        output_target: `cinematic-ads/${locked.product_slug}/${locked.id}.mp4`,
        webhook_url: `${SUPABASE_URL}/functions/v1/cinematic-ad-render-webhook`,
      },
    });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});