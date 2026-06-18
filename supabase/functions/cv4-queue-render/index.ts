// Cinematic V4: GitHub Actions dispatcher.
// Triggers render-cinematic-v4.yml for one or more storyboard IDs.
// Refuses to dispatch a storyboard that is not in 'validated' status (pre-gate
// must have passed) or whose unique_image_count < 5.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GH_PAT = Deno.env.get("GH_PAT");
const GH_REPO = Deno.env.get("GH_REPO"); // "owner/repo"

async function dispatchOne(storyboard_id: string): Promise<{ ok: boolean; status?: number; message?: string; run_id?: string; run_url?: string }> {
  if (!GH_PAT || !GH_REPO) return { ok: false, message: "GH_PAT/GH_REPO not configured" };
  const dispatchedAt = Date.now();
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/render-cinematic-v4.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main", inputs: { storyboard_id } }),
  });
  if (!r.ok) return { ok: false, status: r.status, message: (await r.text()).slice(0, 300) };

  // Best-effort: capture the just-created workflow run id so the UI can link out.
  // The /dispatches endpoint returns 204 with no body, so we poll the runs list.
  let run_id: string | undefined;
  let run_url: string | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((res) => setTimeout(res, 1500));
    try {
      const lr = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/render-cinematic-v4.yml/runs?per_page=10&event=workflow_dispatch`, {
        headers: { Authorization: `Bearer ${GH_PAT}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      });
      if (!lr.ok) continue;
      const j = await lr.json();
      const runs = Array.isArray(j?.workflow_runs) ? j.workflow_runs : [];
      const match = runs.find((run: any) => new Date(run.created_at).getTime() >= dispatchedAt - 2000);
      if (match) { run_id = String(match.id); run_url = match.html_url; break; }
    } catch (_) { /* retry */ }
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
      // Default: all validated, awaiting_render storyboards.
      const { data } = await sb.from("cinematic_v4_storyboards")
        .select("id").in("status", ["validated", "awaiting_render"]).limit(20);
      ids = (data || []).map((r: any) => r.id);
    }

    const results: any[] = [];
    for (const id of ids) {
      const { data: row } = await sb.from("cinematic_v4_storyboards").select("id, status, unique_image_count, cv4_reject_reasons, scene_assets").eq("id", id).maybeSingle();
      if (!row) { results.push({ id, ok: false, message: "not_found" }); continue; }
      if (row.status !== "validated") {
        results.push({ id, ok: false, message: `not_validated:${row.status}` });
        continue;
      }
      if (row.status === "rejected" || (row.cv4_reject_reasons || []).length > 0) {
        results.push({ id, ok: false, message: `pre_gate_failed:${(row.cv4_reject_reasons || []).join("|")}` });
        continue;
      }
      if ((row.unique_image_count ?? 0) < 5) {
        results.push({ id, ok: false, message: "needs_better_assets:unique_images_lt_5" });
        continue;
      }
      const sources = Array.isArray(row.scene_assets) ? row.scene_assets.map((a: any) => a?.source) : [];
      if (sources.some((source: string) => source && source !== "gallery")) {
        results.push({ id, ok: false, message: "non_gallery_scene_assets_blocked" });
        continue;
      }
      const d = await dispatchOne(id);
      // Stamp the storyboard with dispatch metadata so the review UI can show status.
      await sb.from("cinematic_v4_storyboards").update({
        status: d.ok ? "github_dispatched" : (row.status === "rendering" ? "rendering" : row.status),
        github_run_id: d.run_id ?? null,
        github_run_url: d.run_url ?? null,
        last_render_dispatched_at: new Date().toISOString(),
        render_error: d.ok ? null : (d.message ?? `dispatch_failed_${d.status ?? "?"}`),
      }).eq("id", id);
      results.push({ id, ...d });
    }
    const dispatched = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({ ok: true, traceId: trace_id, dispatched, total: ids.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cv4-queue-render]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});