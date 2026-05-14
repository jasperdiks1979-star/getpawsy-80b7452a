import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const MAX_ATTEMPTS = 2;

function trace() { return crypto.randomUUID().slice(0, 8); }
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
      patch.status = "rendered";
      patch.rendered_at = new Date().toISOString();
      if (body.mp4_url) patch.output_mp4_url = String(body.mp4_url);
      if (body.duration != null) patch.output_duration_seconds = Number(body.duration);
      if (body.file_size != null) patch.output_file_size_bytes = Number(body.file_size);
      patch.error_message = null;
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

    return json({ ok: true, traceId, message: "updated" });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});