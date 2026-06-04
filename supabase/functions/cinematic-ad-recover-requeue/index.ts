// Admin one-click recovery for cinematic_ad_jobs stuck in
// needs_admin_review / failed / timeout_after_8m / timeout_after_12m.
//
// Resets the row to a re-claimable state and then dispatches the GitHub
// Actions render-cinematic-ad.yml workflow so the next render cycle picks
// it up. The job is NOT live-published; only re-rendered + re-validated.
//
// Auth: requires an authenticated admin (user_roles.role='admin') OR the
// RENDER_WORKER_SECRET header (for back-end invocation).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-render-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
const GH_PAT = Deno.env.get("GH_PAT") ?? "";
const GH_REPO = Deno.env.get("GH_REPO") ?? "";
const WORKFLOW_FILE = "render-cinematic-ad.yml";

const RECOVERABLE_FROM = [
  "needs_admin_review",
  "failed",
  "timeout_after_8m",
  "timeout_after_12m",
  "render_queued", // allow re-dispatch even if already queued
  "rendering",     // allow rescue of a stuck "rendering" with stale worker
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    // Auth: admin via Bearer JWT OR render worker secret.
    let isAdmin = false;
    const secret = req.headers.get("x-render-secret") ?? "";
    if (RENDER_WORKER_SECRET && secret === RENDER_WORKER_SECRET) {
      isAdmin = true;
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader) {
        return json({ ok: false, traceId, message: "missing Authorization header" }, 401);
      }
      const user = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: ures } = await user.auth.getUser();
      if (!ures?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: role } = await admin
        .from("user_roles").select("role")
        .eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
      isAdmin = Boolean(role);
      if (!isAdmin) return json({ ok: false, traceId, message: "admin required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const jobId: string | undefined = body?.job_id;
    const forceBudget: boolean = body?.force_budget !== false; // default true on manual recovery
    if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
      return json({ ok: false, traceId, message: "job_id required (uuid)" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: job, error: jobErr } = await admin
      .from("cinematic_ad_jobs")
      .select("id, status, product_slug, render_attempts")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr || !job) {
      return json({ ok: false, traceId, message: "job_not_found" }, 404);
    }
    if (!RECOVERABLE_FROM.includes(job.status)) {
      return json({
        ok: false, traceId,
        reason: "status_not_recoverable",
        current_status: job.status,
        recoverable_from: RECOVERABLE_FROM,
        message: `Job status '${job.status}' is not recoverable; refusing to overwrite.`,
      }, 409);
    }

    // Reset job → render_queued, clear stale worker / errors / timeouts /
    // budget block. Force the per-product 24h budget override so the claim
    // function doesn't immediately push it back into needs_admin_review.
    const nowIso = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("cinematic_ad_jobs")
      .update({
        status: "render_queued",
        status_message: `Recover+requeue accepted by admin at ${nowIso} — dispatching GitHub Actions`,
        error_message: null,
        blocked_reason: null,
        render_worker_id: null,
        render_started_at: null,
        render_heartbeat_at: null,
        render_queued_at: nowIso,
        render_dispatched_at: null,
        render_token: null,
        recoverable: true,
        force_render_budget_override: forceBudget,
        force_render_budget_by: null,
        updated_at: nowIso,
      })
      .eq("id", jobId);
    if (updateErr) {
      return json({ ok: false, traceId, message: `reset failed: ${updateErr.message}` }, 500);
    }

    // Dispatch GitHub Actions render-cinematic-ad.yml.
    let ghDispatched = false;
    let ghMessage = "GH_PAT or GH_REPO not configured — DB reset only";
    if (GH_PAT && GH_REPO) {
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
      if (ghResp.ok) {
        ghDispatched = true;
        ghMessage = "workflow_dispatch accepted";
        await admin.from("cinematic_ad_jobs").update({
          render_dispatched_at: new Date().toISOString(),
          status_message: "Recover+requeue: render workflow dispatched, awaiting worker claim",
        }).eq("id", jobId);
      } else {
        const txt = await ghResp.text();
        ghMessage = `workflow_dispatch failed: ${ghResp.status} ${txt.slice(0, 300)}`;
        await admin.from("cinematic_ad_jobs").update({
          status_message: `Recover+requeue: DB reset OK but ${ghMessage}`,
        }).eq("id", jobId);
      }
    }

    return json({
      ok: true,
      traceId,
      job_id: jobId,
      previous_status: job.status,
      new_status: "render_queued",
      force_budget_override: forceBudget,
      gh_dispatched: ghDispatched,
      gh_message: ghMessage,
      message: ghDispatched
        ? "Recover+requeue accepted, render workflow dispatched"
        : `Recover+requeue accepted (DB reset). ${ghMessage}`,
    });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});