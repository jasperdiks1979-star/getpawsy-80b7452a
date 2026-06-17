// Gated endpoint for the GitHub Actions render workflow.
// Returns the cinematic_runway_jobs row + a signed upload URL for final.mp4.
// Auth: Authorization: Bearer ${RUNWAY_MERGE_TOKEN}

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("RUNWAY_MERGE_TOKEN");
const BUCKET = "cinematic-runway";

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
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader !== `Bearer ${TOKEN}`) {
      return json({ ok: false, traceId, message: "unauthorized" }, 401);
    }

    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      return json({ ok: false, traceId, message: "job_id required (uuid)" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: job, error } = await admin
      .from("cinematic_runway_jobs")
      .select("id, status, script, scenes, voiceover_url")
      .eq("id", jobId)
      .maybeSingle();
    if (error || !job) return json({ ok: false, traceId, message: "job not found" }, 404);

    const path = `jobs/${jobId}/final.mp4`;
    const { data: signed, error: signErr } = await admin
      .storage.from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (signErr || !signed) {
      return json({ ok: false, traceId, message: `sign error: ${signErr?.message}` }, 500);
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

    return json({
      ok: true,
      traceId,
      job,
      upload: {
        // Pre-signed POST endpoint — workflow PUTs the mp4 with this token.
        signed_url: signed.signedUrl,
        token: signed.token,
        path,
        bucket: BUCKET,
      },
      public_url: pub.publicUrl,
    });
  } catch (err: any) {
    return json({ ok: false, traceId, message: String(err?.message ?? err) }, 500);
  }
});