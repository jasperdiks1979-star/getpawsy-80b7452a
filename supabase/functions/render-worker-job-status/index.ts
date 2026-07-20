import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    const secret = req.headers.get("x-render-secret") ?? "";
    if (!RENDER_WORKER_SECRET || secret !== RENDER_WORKER_SECRET) {
      return json(401, { ok: false, traceId, message: "unauthorized" });
    }
    const body = await req.json().catch(() => ({}));
    const jobId = typeof body.job_id === "string" ? body.job_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      return json(400, { ok: false, traceId, message: "valid job_id required" });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from("cinematic_ad_jobs")
      .select("id,status,output_mp4_url,output_thumbnail_url,error_message,status_message,validation_passed")
      .eq("id", jobId)
      .maybeSingle();
    if (error) return json(500, { ok: false, traceId, message: error.message });
    if (!data) return json(404, { ok: false, traceId, message: "job not found" });
    return json(200, { ok: true, traceId, job: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { ok: false, traceId, message });
  }
});