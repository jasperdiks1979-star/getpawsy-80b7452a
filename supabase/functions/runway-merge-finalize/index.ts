// Gated endpoint for the GitHub Actions render workflow.
// Marks a cinematic_runway_jobs row ready_for_review (or merge_failed).
// Auth: Authorization: Bearer ${RUNWAY_MERGE_TOKEN}

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("RUNWAY_MERGE_TOKEN");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    if (!TOKEN) return json({ ok: false, traceId, message: "RUNWAY_MERGE_TOKEN not configured" }, 500);
    if (req.headers.get("Authorization") !== `Bearer ${TOKEN}`) {
      return json({ ok: false, traceId, message: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({} as any));
    const jobId = body?.job_id;
    const status = body?.status;
    if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId)) {
      return json({ ok: false, traceId, message: "job_id required (uuid)" }, 400);
    }
    if (status !== "ready_for_review" && status !== "merge_failed") {
      return json({ ok: false, traceId, message: "status must be ready_for_review or merge_failed" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const update: Record<string, unknown> = { status };

    if (status === "ready_for_review") {
      if (typeof body?.final_video_url !== "string") {
        return json({ ok: false, traceId, message: "final_video_url required" }, 400);
      }
      update.final_video_url = body.final_video_url;
      update.captions = body?.captions ?? null;
      update.qa_report = body?.qa_report ?? null;
      update.qa_score = typeof body?.qa_score === "number" ? body.qa_score : null;
      update.merge_error = null;
      update.error = null;
    } else {
      const msg = String(body?.merge_error ?? body?.error ?? "merge failed");
      update.merge_error = msg;
      update.error = msg;
    }

    const { error } = await admin
      .from("cinematic_runway_jobs")
      .update(update)
      .eq("id", jobId);
    if (error) return json({ ok: false, traceId, message: error.message }, 500);

    return json({ ok: true, traceId, job_id: jobId, status });
  } catch (err: any) {
    return json({ ok: false, traceId, message: String(err?.message ?? err) }, 500);
  }
});