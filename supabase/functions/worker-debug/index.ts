/**
 * worker-debug (public)
 *
 * Backs worker debug JSON endpoints.
 * Canonical app aliases: /api/debug/worker and /api/debug/queue (when hosting supports API proxying)
 * Direct backend fallback: /functions/v1/worker-debug?view=worker|queue
 * Query string ?view=worker | ?view=queue (default: worker).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ ok: false, route: "/api/debug/worker", reason: "server_misconfigured" });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "worker";
    let supabaseHost = "unknown";
    try { supabaseHost = new URL(SUPABASE_URL).host; } catch { /* noop */ }

    if (view === "queue") {
      const { data: rows } = await admin
        .from("cinematic_ad_jobs")
        .select("id,status,product_slug,render_queued_at,render_started_at,render_complete_at,render_worker_id,updated_at")
        .order("updated_at", { ascending: false })
        .limit(25);
      const { data: allStatus } = await admin.from("cinematic_ad_jobs").select("status");
      const counts: Record<string, number> = {};
      for (const r of allStatus ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
      return json({
        ok: true,
        route: "/api/debug/queue",
        view: "queue",
        supabase_host: supabaseHost,
        table: "cinematic_ad_jobs",
        status_counts: counts,
        latest_rows: rows ?? [],
      });
    }

    // default: worker
    const { data: hb } = await admin
      .from("cinematic_worker_heartbeats")
      .select("*")
      .order("last_poll_at", { ascending: false })
      .limit(5);
    return json({
      ok: true,
      route: "/api/debug/worker",
      view: "worker",
      supabase_host: supabaseHost,
      heartbeats: hb ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, route: "/api/debug/worker", error: msg });
  }
});