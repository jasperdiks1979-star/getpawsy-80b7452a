import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const GH_PAT = Deno.env.get("GH_PAT") ?? "";
  const GH_REPO = Deno.env.get("GH_REPO") ?? "";
  const WF = "render-cinematic-v3.yml";
  const h = { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json" };

  const runsRes = await fetch(
    `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WF}/runs?per_page=10`,
    { headers: h },
  );
  const runsJson = await runsRes.json().catch(() => ({}));
  const runs = (runsJson.workflow_runs ?? []).slice(0, 10);

  const enriched = await Promise.all(
    runs.map(async (r: any) => {
      let failedJobs: any[] = [];
      if (r.conclusion === "failure" || r.status === "in_progress" || r.status === "queued") {
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