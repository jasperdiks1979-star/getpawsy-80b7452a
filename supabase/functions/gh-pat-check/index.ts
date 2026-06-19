import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const GH_PAT = Deno.env.get("GH_PAT") ?? "";
  const GH_REPO = Deno.env.get("GH_REPO") ?? "";
  const GH_REF = Deno.env.get("GH_REF") ?? "main";
  const WF = Deno.env.get("TRIM_WORKFLOW_FILE") ?? "trim-cinematic-ad.yml";

  // Optional: inspect a specific run id (?run_id=...) to get job step details.
  const url0 = new URL(req.url);
  const inspectRunId = url0.searchParams.get("run_id");
  if (inspectRunId) {
    const stepLogsUrl = url0.searchParams.get("step");
    if (stepLogsUrl) {
      const logRes = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/jobs/${inspectRunId}/logs`, {
        headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json" },
        redirect: "follow",
      });
      const txt = await logRes.text();
      return new Response(txt.slice(0, 8000), { headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }
    const jobsRes = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/runs/${inspectRunId}/jobs`,
      { headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json" } },
    );
    const jobsJson = await jobsRes.json().catch(() => ({}));
    const runRes = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/runs/${inspectRunId}`,
      { headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json" } },
    );
    const runJson = await runRes.json().catch(() => ({}));
    return new Response(JSON.stringify({ run: { id: runJson.id, status: runJson.status, conclusion: runJson.conclusion, html_url: runJson.html_url }, jobs: (jobsJson.jobs ?? []).map((j: any) => ({ id: j.id, name: j.name, status: j.status, conclusion: j.conclusion, steps: (j.steps ?? []).map((s: any) => ({ name: s.name, status: s.status, conclusion: s.conclusion, number: s.number })) })) }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 1. Identity check — confirms token is valid + lists scopes for classic PATs.
  const who = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json" },
  });
  const whoBody = await who.text();
  const scopes = who.headers.get("x-oauth-scopes");

  // 2. Dispatch check — uses a clearly-fake job_id so the trim job preflight aborts.
  const dispatchUrl = `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WF}/dispatches`;
  const disp = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: GH_REF,
      inputs: {
        job_id: "00000000-0000-0000-0000-000000000000",
        mp4_url: "https://example.com/none.mp4",
        target_seconds: "15",
        render_token: "diagnostic",
      },
    }),
  });
  const dispBody = await disp.text();

  // 3. List latest runs for this workflow to surface the run id we just created.
  const runs = await fetch(
    `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WF}/runs?per_page=3`,
    { headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json" } },
  );
  const runsJson = await runs.json().catch(() => ({}));

  // 4. Repo metadata + file presence on GH_REF
  const repoMeta = await fetch(`https://api.github.com/repos/${GH_REPO}`, {
    headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json" },
  }).then(r => r.json()).catch(() => ({}));
  const fileCheck = await fetch(
    `https://api.github.com/repos/${GH_REPO}/contents/.github/workflows/${WF}?ref=${GH_REF}`,
    { headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json" } },
  );
  const fileBody = await fileCheck.text();

  return new Response(
    JSON.stringify(
      {
        gh_repo: GH_REPO,
        workflow: WF,
        user_check: { status: who.status, scopes, body: whoBody.slice(0, 200) },
        dispatch_check: { status: disp.status, body: dispBody.slice(0, 400) },
        latest_runs: (runsJson.workflow_runs ?? []).slice(0, 3).map((r: any) => ({
          id: r.id, status: r.status, conclusion: r.conclusion, created_at: r.created_at, html_url: r.html_url,
        })),
        ref_used: GH_REF,
        default_branch: repoMeta?.default_branch,
        file_on_ref: { status: fileCheck.status, body: fileBody.slice(0, 300) },
      },
      null,
      2,
    ),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});