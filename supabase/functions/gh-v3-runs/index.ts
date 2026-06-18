import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
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