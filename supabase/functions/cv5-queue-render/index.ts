// Cinematic V5: GitHub Actions dispatcher. Triggers render-cinematic-v5.yml.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GH_PAT = Deno.env.get("GH_PAT");
const GH_REPO = Deno.env.get("GH_REPO");

async function dispatchOne(storyboard_id: string) {
  if (!GH_PAT || !GH_REPO) return { ok: false, message: "GH_PAT/GH_REPO not configured" } as any;
  const dispatchedAt = Date.now();
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/render-cinematic-v5.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ ref: "main", inputs: { storyboard_id } }),
  });
  if (!r.ok) return { ok: false, status: r.status, message: (await r.text()).slice(0, 300) };
  let run_id: string | undefined, run_url: string | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((res) => setTimeout(res, 1500));
    const lr = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/render-cinematic-v5.yml/runs?per_page=10&event=workflow_dispatch`, {
      headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!lr.ok) continue;
    const j = await lr.json();
    const match = (j.workflow_runs || []).find((run: any) => new Date(run.created_at).getTime() >= dispatchedAt - 2000);
    if (match) { run_id = String(match.id); run_url = match.html_url; break; }
  }
  return { ok: true, status: r.status, run_id, run_url };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    let ids: string[] = Array.isArray(body?.storyboard_ids) ? body.storyboard_ids : [];
    if (body?.storyboard_id) ids = [body.storyboard_id];
    if (ids.length === 0) {
      const { data } = await sb.from("cv5_storyboards").select("id").in("status", ["awaiting_render", "upload_failed", "callback_failed"]).limit(20);
      ids = (data || []).map((r: any) => r.id);
    }
    const results: any[] = [];
    for (const id of ids) {
      const { data: row } = await sb.from("cv5_storyboards").select("id, status, quality_breakdown").eq("id", id).maybeSingle();
      if (!row) { results.push({ id, ok: false, message: "not_found" }); continue; }
      if (row.status === "rejected") { results.push({ id, ok: false, message: "rejected" }); continue; }
      const d = await dispatchOne(id);
      await sb.from("cv5_storyboards").update({
        status: d.ok ? "github_dispatched" : row.status,
        github_run_id: d.run_id ?? null, github_run_url: d.run_url ?? null,
        last_render_dispatched_at: new Date().toISOString(),
        render_error: d.ok ? null : (d.message ?? `dispatch_failed_${d.status ?? "?"}`),
      }).eq("id", id);
      results.push({ id, ...d });
    }
    return new Response(JSON.stringify({ ok: true, traceId: trace_id, dispatched: results.filter((r) => r.ok).length, total: ids.length, results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});