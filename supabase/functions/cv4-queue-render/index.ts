// Cinematic V4: GitHub Actions dispatcher.
// Triggers render-cinematic-v4.yml for one or more storyboard IDs.
// Refuses to dispatch a storyboard that is not in 'validated' status (pre-gate
// must have passed) or whose unique_image_count < 3.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GH_PAT = Deno.env.get("GH_PAT");
const GH_REPO = Deno.env.get("GH_REPO"); // "owner/repo"

async function dispatchOne(storyboard_id: string): Promise<{ ok: boolean; status?: number; message?: string }> {
  if (!GH_PAT || !GH_REPO) return { ok: false, message: "GH_PAT/GH_REPO not configured" };
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
  return { ok: true, status: r.status };
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
      const { data: row } = await sb.from("cinematic_v4_storyboards").select("id, status, unique_image_count, cv4_reject_reasons").eq("id", id).maybeSingle();
      if (!row) { results.push({ id, ok: false, message: "not_found" }); continue; }
      if (row.status === "rejected" || (row.cv4_reject_reasons || []).length > 0) {
        results.push({ id, ok: false, message: `pre_gate_failed:${(row.cv4_reject_reasons || []).join("|")}` });
        continue;
      }
      if ((row.unique_image_count ?? 0) < 3) {
        results.push({ id, ok: false, message: "unique_images_lt_3" });
        continue;
      }
      const d = await dispatchOne(id);
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