// Dispatches the render-cinematic-runway-merge GitHub Actions workflow.
// Server-side ffmpeg replaces the previous browser ffmpeg.wasm path
// (which failed on Safari with "failed to import ffmpeg-core.js").
//
// Flow:
//   1. admin auth check
//   2. validate job has 6 clips (voiceover optional if no vo_text)
//   3. mark job status=merging, clear merge_error, set merge_attempted_at
//   4. POST workflow_dispatch to GitHub API
//   5. return { ok:true } — the workflow updates the job row directly
//      (status=ready_for_review or merge_failed) via PostgREST.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GH_PAT = Deno.env.get("GH_PAT");
const GH_REPO = Deno.env.get("GH_REPO"); // "owner/repo"
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
const WORKFLOW_FILE = "render-cinematic-runway-merge.yml";

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
    if (!GH_PAT || !GH_REPO) {
      return json({ ok: false, traceId, message: "GH_PAT or GH_REPO not configured" }, 500);
    }

    // Auth: either admin user JWT, or internal-secret server-to-server call.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const internalHeader = req.headers.get("x-internal-secret") ?? "";
    const isInternal = !!INTERNAL_SECRET && internalHeader === INTERNAL_SECRET;
    if (!isInternal) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: ures } = await userClient.auth.getUser();
      if (!ures?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);
      const { data: roleData } = await admin
        .from("user_roles").select("role")
        .eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
      if (!roleData) return json({ ok: false, traceId, message: "admin required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const jobId = body?.job_id;
    if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId)) {
      return json({ ok: false, traceId, message: "job_id required (uuid)" }, 400);
    }

    const { data: job, error: jobErr } = await admin
      .from("cinematic_runway_jobs")
      .select("id, status, scenes, voiceover_url, script")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr || !job) return json({ ok: false, traceId, message: "job not found" }, 404);

    const scenes = Array.isArray(job.scenes) ? (job.scenes as any[]) : [];
    const requiredKeys = ["hook", "problem", "agitate", "demo", "benefit", "cta"];
    const missing = requiredKeys.filter(
      (k) => !scenes.find((s) => s?.key === k && typeof s?.clip_url === "string" && s.clip_url),
    );
    if (missing.length) {
      return json({ ok: false, traceId, message: `missing clips: ${missing.join(",")}` }, 400);
    }
    const voRequired = !!(job.script as any)?.vo_text;
    if (voRequired && !job.voiceover_url) {
      return json({ ok: false, traceId, message: "voiceover_url missing" }, 400);
    }

    // Mark merging
    await admin
      .from("cinematic_runway_jobs")
      .update({
        status: "merging",
        merge_attempted_at: new Date().toISOString(),
        merge_error: null,
        error: null,
      })
      .eq("id", jobId);

    // Dispatch workflow
    const ghUrl = `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
    const ghResp = await fetch(ghUrl, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${GH_PAT}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { job_id: jobId } }),
    });
    if (!ghResp.ok) {
      const txt = await ghResp.text();
      const msg = `workflow_dispatch failed: ${ghResp.status} ${txt.slice(0, 300)}`;
      await admin
        .from("cinematic_runway_jobs")
        .update({ status: "merge_failed", merge_error: msg, error: msg })
        .eq("id", jobId);
      return json({ ok: false, traceId, message: msg }, 502);
    }

    return json({
      ok: true,
      traceId,
      job_id: jobId,
      workflow: WORKFLOW_FILE,
      message: "merge dispatched — workflow updates job to ready_for_review on completion",
    });
  } catch (err: any) {
    return json({ ok: false, traceId, message: String(err?.message ?? err) }, 500);
  }
});