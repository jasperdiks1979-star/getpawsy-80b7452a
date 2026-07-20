import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const GH_PAT = Deno.env.get("GH_PAT") ?? "";
  const GH_REPO = Deno.env.get("GH_REPO") ?? "";
  const WF = "render-cinematic-v3.yml";
  const h = { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json" };
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const url = new URL(req.url);

  // POST /gh-v3-runs?action=dispatch  body:{ job_id }
  if (req.method === "POST" && url.searchParams.get("action") === "dispatch") {
    const { job_id } = await req.json().catch(() => ({}));
    if (!job_id) return new Response(JSON.stringify({ ok: false, message: "job_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WF}/dispatches`,
      { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ ref: "main", inputs: { job_id } }) },
    );
    if (!res.ok) {
      const txt = await res.text();
      return new Response(JSON.stringify({ ok: false, status: res.status, body: txt }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    await sb.from("cinematic_v3_jobs").update({ status: "rendering", updated_at: new Date().toISOString() }).eq("id", job_id);
    // GitHub doesn't return run_id on dispatch; client must poll list.
    return new Response(JSON.stringify({ ok: true, job_id, dispatched_at: new Date().toISOString() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // POST /gh-v3-runs?action=reap  → reset stuck rendering rows whose GH run terminated without finalize
  if (req.method === "POST" && url.searchParams.get("action") === "reap") {
    const cutoff = new Date(Date.now() - 65 * 60 * 1000).toISOString();
    const { data: stuck } = await sb
      .from("cinematic_v3_jobs")
      .select("id, updated_at, final_mp4_url")
      .eq("status", "rendering")
      .lt("updated_at", cutoff);
    const reaped: any[] = [];
    for (const row of stuck ?? []) {
      if (row.final_mp4_url) continue;
      // Find the run whose display_title contains this job_id
      const rr = await fetch(
        `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WF}/runs?per_page=30`,
        { headers: h },
      );
      const rj = await rr.json().catch(() => ({}));
      const match = (rj.workflow_runs ?? []).find((r: any) =>
        (r.display_title ?? "").includes(row.id) || (r.name ?? "").includes(row.id)
      );
      const conclusion = match?.conclusion ?? null;
      const status = match?.status ?? null;
      if (status === "completed" && conclusion !== "success") {
        await sb.from("cinematic_v3_jobs").update({
          status: "failed",
          failure_reasons: [`workflow_${conclusion ?? "unknown"}_no_finalize_callback`, `run_id:${match?.id ?? "none"}`],
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        reaped.push({ id: row.id, reason: conclusion, run_id: match?.id });
      }
    }
    return new Response(JSON.stringify({ ok: true, scanned: stuck?.length ?? 0, reaped }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // GET /gh-v3-runs?action=steps&run_id=X → full per-step timings + conclusions for every job in the run
  if (url.searchParams.get("action") === "steps") {
    const runId = url.searchParams.get("run_id");
    if (!runId) return new Response(JSON.stringify({ ok: false, message: "run_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const jr = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/runs/${runId}/jobs`, { headers: h });
    const jj = await jr.json().catch(() => ({}));
    const out = (jj.jobs ?? []).map((j: any) => ({
      job_name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      started_at: j.started_at,
      completed_at: j.completed_at,
      runner_name: j.runner_name,
      steps: (j.steps ?? []).map((s: any) => {
        const start = s.started_at ? Date.parse(s.started_at) : null;
        const end = s.completed_at ? Date.parse(s.completed_at) : null;
        return {
          number: s.number,
          name: s.name,
          status: s.status,
          conclusion: s.conclusion,
          started_at: s.started_at,
          completed_at: s.completed_at,
          duration_s: start && end ? Math.round((end - start) / 1000) : null,
        };
      }),
    }));
    return new Response(JSON.stringify({ ok: true, run_id: runId, jobs: out }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // GET /gh-v3-runs?action=logs&run_id=X[&step=NAME_SUBSTR] → text logs from the run's zip
  if (url.searchParams.get("action") === "logs") {
    const runId = url.searchParams.get("run_id");
    const stepFilter = (url.searchParams.get("step") ?? "").toLowerCase();
    if (!runId) return new Response(JSON.stringify({ ok: false, message: "run_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const lr = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/runs/${runId}/logs`, { headers: h, redirect: "follow" });
    if (!lr.ok) return new Response(JSON.stringify({ ok: false, status: lr.status, body: await lr.text() }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const buf = new Uint8Array(await lr.arrayBuffer());
    // unzip via deno std
    const { ZipReader, Uint8ArrayReader, TextWriter } = await import("https://deno.land/x/zipjs@v2.7.45/index.js");
    const reader = new ZipReader(new Uint8ArrayReader(buf));
    const entries = await reader.getEntries();
    const out: Record<string, { size: number; tail: string }> = {};
    for (const e of entries) {
      if (e.directory) continue;
      if (stepFilter && !e.filename.toLowerCase().includes(stepFilter)) continue;
      const txt = await e.getData!(new TextWriter());
      const lines = txt.split("\n");
      out[e.filename] = { size: txt.length, tail: lines.slice(-80).join("\n") };
    }
    await reader.close();
    return new Response(JSON.stringify({ ok: true, run_id: runId, files: out }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // GET /gh-v3-runs?action=workflow_on_main → verify the timeout-minutes value actually live on main
  if (url.searchParams.get("action") === "workflow_on_main") {
    const cr = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/.github/workflows/${WF}?ref=main`, { headers: h });
    const cj = await cr.json().catch(() => ({}));
    const content = cj?.content ? atob(cj.content.replace(/\n/g, "")) : "";
    const m = content.match(/timeout-minutes:\s*(\d+)/);
    const cm = await fetch(`https://api.github.com/repos/${GH_REPO}/commits?path=.github/workflows/${WF}&sha=main&per_page=5`, { headers: h });
    const commits = (await cm.json().catch(() => [])).map((c: any) => ({ sha: c.sha, date: c.commit?.author?.date, msg: c.commit?.message }));
    return new Response(JSON.stringify({ ok: true, sha: cj.sha, timeout_minutes_on_main: m ? Number(m[1]) : null, size: content.length, recent_commits: commits }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // POST /gh-v3-runs?action=put_workflow  body:{ content_b64, message? }
  // Fallback when Lovable→GitHub sync hasn't pushed the local workflow file.
  // Uses the GitHub Contents API to PUT the new file directly on main.
  if (req.method === "POST" && url.searchParams.get("action") === "put_workflow") {
    const { content_b64, message } = await req.json().catch(() => ({}));
    if (!content_b64) return new Response(JSON.stringify({ ok: false, message: "content_b64 required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const path = `.github/workflows/${WF}`;
    const cr = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${path}?ref=main`, { headers: h });
    const cj = await cr.json().catch(() => ({}));
    const currentSha = cj?.sha ?? null;
    const putRes = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${path}`, {
      method: "PUT",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message ?? "chore(ci): force-push render-cinematic-v3 workflow (single-pass ffmpeg, 60min)",
        content: content_b64,
        sha: currentSha ?? undefined,
        branch: "main",
      }),
    });
    const putJson = await putRes.json().catch(() => ({}));
    if (!putRes.ok) {
      return new Response(JSON.stringify({ ok: false, status: putRes.status, body: putJson }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      ok: true,
      previous_sha: currentSha,
      new_sha: putJson?.content?.sha ?? null,
      commit_sha: putJson?.commit?.sha ?? null,
      commit_url: putJson?.commit?.html_url ?? null,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // GET /gh-v3-runs?action=poll_job&job_id=X[&timeout_s=120&interval_s=5]
  // Polls cinematic_v3_jobs until the row leaves `rendering`, then returns a
  // structured report: status, duration, QA, final mp4 URL, file size, preview.
  if (url.searchParams.get("action") === "poll_job") {
    const jobId = url.searchParams.get("job_id");
    if (!jobId) return new Response(JSON.stringify({ ok: false, message: "job_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const timeoutS = Math.min(Number(url.searchParams.get("timeout_s") ?? "120"), 140);
    const intervalS = Math.max(Number(url.searchParams.get("interval_s") ?? "5"), 2);
    const deadline = Date.now() + timeoutS * 1000;
    const startedAt = new Date().toISOString();

    let row: any = null;
    let polls = 0;
    while (Date.now() < deadline) {
      polls++;
      const { data } = await sb
        .from("cinematic_v3_jobs")
        .select("id, product_slug, status, qa_total, qa_passed, qa_scores, duration_seconds, final_mp4_url, failure_reasons, updated_at, created_at")
        .eq("id", jobId)
        .maybeSingle();
      row = data;
      if (!row) break;
      if (row.status !== "rendering" && row.status !== "queued") break;
      await new Promise((r) => setTimeout(r, intervalS * 1000));
    }

    if (!row) {
      return new Response(JSON.stringify({ ok: false, message: "job not found", job_id: jobId }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const stillRendering = row.status === "rendering" || row.status === "queued";

    // File size via HEAD on final mp4
    let fileSize: number | null = null;
    let contentType: string | null = null;
    if (row.final_mp4_url) {
      try {
        const head = await fetch(row.final_mp4_url, { method: "HEAD" });
        const len = head.headers.get("content-length");
        fileSize = len ? Number(len) : null;
        contentType = head.headers.get("content-type");
      } catch (_) { /* ignore */ }
    }

    // Signed preview image (try common paths in the cinematic-v3 bucket)
    let previewImageUrl: string | null = null;
    for (const p of [`jobs/${jobId}/preview.jpg`, `jobs/${jobId}/thumbnail.jpg`, `jobs/${jobId}/preview.png`]) {
      const { data: signed } = await sb.storage.from("cinematic-v3").createSignedUrl(p, 60 * 60);
      if (signed?.signedUrl) {
        const ok = await fetch(signed.signedUrl, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
        if (ok) { previewImageUrl = signed.signedUrl; break; }
      }
    }

    // Locate the GitHub run for this job to surface runtime context.
    let activeRun: any = null;
    try {
      const rr = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/${WF}/runs?per_page=20`, { headers: h });
      const rj = await rr.json().catch(() => ({}));
      const match = (rj.workflow_runs ?? []).find((r: any) =>
        (r.display_title ?? "").includes(jobId) || (r.name ?? "").includes(jobId)
      );
      if (match) {
        const jr = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/runs/${match.id}/jobs`, { headers: h });
        const jj = await jr.json().catch(() => ({}));
        const ghJob = (jj.jobs ?? [])[0] ?? null;
        const activeStep = ghJob?.steps?.find((s: any) => s.status === "in_progress")?.name
          ?? ghJob?.steps?.filter((s: any) => s.conclusion === "success").pop()?.name
          ?? null;
        activeRun = {
          run_id: match.id,
          run_number: match.run_number,
          status: match.status,
          conclusion: match.conclusion,
          html_url: match.html_url,
          run_started_at: match.run_started_at,
          updated_at: match.updated_at,
          active_or_last_step: activeStep,
        };
      }
    } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({
      ok: true,
      job_id: jobId,
      product_slug: row.product_slug,
      polled: { started_at: startedAt, polls, timeout_s: timeoutS, interval_s: intervalS, still_rendering: stillRendering },
      status: row.status,
      qa_total: row.qa_total,
      qa_passed: row.qa_passed,
      qa_scores: row.qa_scores,
      render_duration_seconds: row.duration_seconds,
      final_mp4_url: row.final_mp4_url,
      file_size_bytes: fileSize,
      content_type: contentType,
      preview_image_url: previewImageUrl,
      failure_reasons: row.failure_reasons,
      updated_at: row.updated_at,
      github_run: activeRun,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const runsRes = await fetch(
    `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WF}/runs?per_page=10`,
    { headers: h },
  );
  const runsJson = await runsRes.json().catch(() => ({}));
  const runs = (runsJson.workflow_runs ?? []).slice(0, 10);

  const enriched = await Promise.all(
    runs.map(async (r: any) => {
      let failedJobs: any[] = [];
      {
        const jr = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/runs/${r.id}/jobs`, { headers: h });
        const jj = await jr.json().catch(() => ({}));
        failedJobs = (jj.jobs ?? []).map((j: any) => ({
          name: j.name,
          status: j.status,
          conclusion: j.conclusion,
          started_at: j.started_at,
          completed_at: j.completed_at,
          failed_step: (j.steps ?? []).find((s: any) => s.conclusion === "failure")?.name ?? null,
        }));
      }
      return {
        id: r.id,
        run_number: r.run_number,
        status: r.status,
        conclusion: r.conclusion,
        created_at: r.created_at,
        updated_at: r.updated_at,
        run_started_at: r.run_started_at,
        event: r.event,
        display_title: r.display_title,
        html_url: r.html_url,
        jobs: failedJobs,
      };
    }),
  );

  return new Response(
    JSON.stringify({ gh_repo: GH_REPO, workflow: WF, count: enriched.length, runs: enriched }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});