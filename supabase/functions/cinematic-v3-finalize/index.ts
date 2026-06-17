// Token-gated endpoint: GitHub Actions writes QA results + final URL.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("RUNWAY_MERGE_TOKEN");
const BUCKET = "cinematic-v3";
const PASS_THRESHOLD = 95;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    if (!TOKEN) return json({ ok: false, traceId, message: "token missing" }, 500);
    if (req.headers.get("Authorization") !== `Bearer ${TOKEN}`) {
      return json({ ok: false, traceId, message: "unauthorized" }, 401);
    }
    const body = await req.json().catch(() => ({} as any));
    const jobId = body?.job_id;
    if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId)) {
      return json({ ok: false, traceId, message: "job_id required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const update: Record<string, unknown> = {};

    if (body?.error) {
      update.status = "failed";
      update.failure_reasons = [String(body.error).slice(0, 500)];
      update.render_log = body?.render_log ? String(body.render_log).slice(0, 50_000) : null;
    } else {
      const scores = (body?.qa_scores ?? {}) as Record<string, number>;
      const reasons = (body?.failure_reasons ?? []) as string[];
      const values = Object.values(scores).map((n) => Number(n) || 0);
      const total = values.length ? Math.min(...values) : 0;
      const passed = total >= PASS_THRESHOLD && reasons.length === 0;

      // Signed URL for the uploaded mp4
      const finalPath = `jobs/${jobId}/final.mp4`;
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(finalPath, 60 * 60 * 24 * 30);

      update.status = passed ? "passed" : "needs_review";
      update.qa_scores = scores;
      update.qa_total = total;
      update.qa_passed = passed;
      update.failure_reasons = reasons;
      update.final_mp4_url = signed?.signedUrl ?? null;
      update.duration_seconds = typeof body?.duration_seconds === "number" ? body.duration_seconds : null;
      update.render_log = body?.render_log ? String(body.render_log).slice(0, 50_000) : null;
    }

    const { error } = await admin.from("cinematic_v3_jobs").update(update).eq("id", jobId);
    if (error) return json({ ok: false, traceId, message: error.message }, 500);
    return json({ ok: true, traceId, job_id: jobId, status: update.status });
  } catch (err: any) {
    return json({ ok: false, traceId, message: String(err?.message ?? err) }, 500);
  }
});
