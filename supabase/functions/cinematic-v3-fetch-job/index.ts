// Token-gated endpoint for the GitHub Actions V3 render workflow.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("RUNWAY_MERGE_TOKEN"); // reuse existing GH Action token
const BUCKET = "cinematic-v3";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    if (!TOKEN) return json({ ok: false, traceId, message: "token not configured" }, 500);
    if (req.headers.get("Authorization") !== `Bearer ${TOKEN}`) {
      return json({ ok: false, traceId, message: "unauthorized" }, 401);
    }
    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ ok: false, traceId, message: "job_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: job, error } = await admin
      .from("cinematic_v3_jobs")
      .select("id, status, script, scenes, voiceover_url, voiceover_transcript, voice_id, product_slug, music_bed")
      .eq("id", jobId).maybeSingle();
    if (error || !job) return json({ ok: false, traceId, message: "job not found" }, 404);

    // Signed URL for VO (workflow downloads it)
    const voPath = `jobs/${jobId}/voiceover.mp3`;
    const { data: voSigned } = await admin.storage.from(BUCKET).createSignedUrl(voPath, 60 * 60);

    // Signed upload URL for final mp4
    const finalPath = `jobs/${jobId}/final.mp4`;
    const { data: upload, error: upErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(finalPath, { upsert: true });
    if (upErr || !upload) return json({ ok: false, traceId, message: `sign upload: ${upErr?.message}` }, 500);

    return json({
      ok: true, traceId, job,
      voiceover_download_url: voSigned?.signedUrl ?? null,
      upload: { signed_url: upload.signedUrl, token: upload.token, path: finalPath, bucket: BUCKET },
    });
  } catch (err: any) {
    return json({ ok: false, traceId, message: String(err?.message ?? err) }, 500);
  }
});
