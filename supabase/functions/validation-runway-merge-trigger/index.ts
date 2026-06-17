// One-shot trigger that dispatches the render-cinematic-runway-merge workflow
// for exactly the 3 validation jobs. Hardcoded allowlist — cannot be abused
// to publish or merge any other job. Safe to delete after validation videos
// are produced.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GH_PAT = Deno.env.get("GH_PAT");
const GH_REPO = Deno.env.get("GH_REPO");
const WORKFLOW_FILE = "render-cinematic-runway-merge.yml";

const ALLOWLIST = new Set([
  "90c47651-13a9-4212-b799-505020f4d8cd",
  "b0e1cd9a-543e-48b6-b99f-3f34335fce61",
  "9fd16064-3fb5-49c6-9124-706a72f7af77",
]);

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
    if (!GH_PAT || !GH_REPO) return json({ ok: false, traceId, message: "GH not configured" }, 500);
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "dispatch";

    // Inspect recent workflow runs + per-run jobs/logs for our 3 IDs.
    if (mode === "status") {
      const runsResp = await fetch(
        `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=10`,
        { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${GH_PAT}`, "X-GitHub-Api-Version": "2022-11-28" } },
      );
      const runs = await runsResp.json();
      const summary = (runs.workflow_runs ?? []).slice(0, 10).map((r: any) => ({
        id: r.id, status: r.status, conclusion: r.conclusion, event: r.event, created: r.created_at, html_url: r.html_url, head_sha: r.head_sha,
      }));
      return json({ ok: true, traceId, runs: summary });
    }
    if (mode === "logs") {
      const runId = url.searchParams.get("run_id");
      if (!runId) return json({ ok: false, message: "run_id required" }, 400);
      const logsResp = await fetch(
        `https://api.github.com/repos/${GH_REPO}/actions/runs/${runId}/logs`,
        { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${GH_PAT}`, "X-GitHub-Api-Version": "2022-11-28" }, redirect: "follow" },
      );
      const buf = await logsResp.arrayBuffer();
      return new Response(buf, {
        status: logsResp.status,
        headers: { ...corsHeaders, "Content-Type": logsResp.headers.get("content-type") ?? "application/zip", "Content-Disposition": `attachment; filename="run-${runId}-logs.zip"` },
      });
    }
    if (mode === "jobs") {
      const runId = url.searchParams.get("run_id");
      if (!runId) return json({ ok: false, message: "run_id required" }, 400);
      const jr = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/runs/${runId}/jobs`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${GH_PAT}`, "X-GitHub-Api-Version": "2022-11-28" },
      });
      return json({ ok: true, jobs: await jr.json() });
    }
    if (mode === "file") {
      const path = url.searchParams.get("path") ?? ".github/workflows/render-cinematic-runway-merge.yml";
      const fr = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${path}?ref=main`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${GH_PAT}`, "X-GitHub-Api-Version": "2022-11-28" },
      });
      const j = await fr.json();
      const content = j.content ? atob(j.content.replace(/\n/g, "")) : null;
      return json({ ok: true, sha: j.sha, size: j.size, snippet: content ? content.slice(0, 4000) : null });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const results: any[] = [];
    for (const jobId of ALLOWLIST) {
      await admin
        .from("cinematic_runway_jobs")
        .update({
          status: "merging",
          merge_attempted_at: new Date().toISOString(),
          merge_error: null,
          error: null,
        })
        .eq("id", jobId);

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
      const txt = ghResp.ok ? "" : await ghResp.text();
      results.push({ job_id: jobId, dispatched: ghResp.ok, http: ghResp.status, error: txt.slice(0, 300) });
      if (!ghResp.ok) {
        await admin
          .from("cinematic_runway_jobs")
          .update({ status: "merge_failed", merge_error: `dispatch ${ghResp.status}: ${txt.slice(0, 300)}` })
          .eq("id", jobId);
      }
    }
    return json({ ok: true, traceId, results });
  } catch (err: any) {
    return json({ ok: false, traceId, message: String(err?.message ?? err) }, 500);
  }
});