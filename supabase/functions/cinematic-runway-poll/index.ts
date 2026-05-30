// Poll Runway tasks for a job, download finished clips into our storage bucket.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY")!;
const RUNWAY_VERSION = "2024-11-06";

async function getTask(id: string) {
  const r = await fetch(`https://api.dev.runwayml.com/v1/tasks/${id}`, {
    headers: {
      Authorization: `Bearer ${RUNWAY_API_KEY}`,
      "X-Runway-Version": RUNWAY_VERSION,
    },
  });
  if (!r.ok) throw new Error(`task ${id} fetch: ${r.status} ${await r.text()}`);
  return r.json();
}

async function downloadToBucket(supabase: any, jobId: string, key: string, url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${key}: ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const path = `jobs/${jobId}/clips/${key}.mp4`;
  const { error } = await supabase.storage
    .from("cinematic-runway")
    .upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from("cinematic-runway").getPublicUrl(path).data.publicUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ures } = await userClient.auth.getUser();
    if (!ures?.user) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleData } = await admin
      .from("user_roles").select("role")
      .eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "job_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error } = await admin
      .from("cinematic_runway_jobs").select("*").eq("id", job_id).maybeSingle();
    if (error || !job) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scenes: any[] = Array.isArray(job.scenes) ? job.scenes : [];
    let allDone = true;
    let anyFailed = false;
    for (const s of scenes) {
      if (s.clip_url || !s.runway_task_id) continue;
      const t = await getTask(s.runway_task_id);
      s.status = t.status;
      if (t.status === "SUCCEEDED") {
        const out = (t.output && t.output[0]) || null;
        if (!out) { allDone = false; continue; }
        s.clip_url = await downloadToBucket(admin, job.id, s.key, out);
      } else if (t.status === "FAILED" || t.status === "CANCELLED") {
        anyFailed = true;
        s.error = t.failure || t.failureCode || "runway failed";
      } else {
        allDone = false;
      }
    }

    let nextStatus = job.status;
    if (anyFailed) nextStatus = "failed";
    else if (allDone && scenes.length === 4 && scenes.every((s) => s.clip_url)) {
      nextStatus = "awaiting_merge";
    }

    await admin
      .from("cinematic_runway_jobs")
      .update({
        scenes,
        status: nextStatus,
        error: anyFailed ? "one or more Runway scenes failed" : null,
      })
      .eq("id", job.id);

    return new Response(
      JSON.stringify({ ok: true, traceId, status: nextStatus, scenes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: String(err?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});