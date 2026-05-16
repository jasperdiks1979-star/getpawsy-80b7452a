/**
 * worker-health (public)
 *
 * Real backend JSON endpoint for /api/health/worker.
 * No auth — safe to expose publicly; reveals only liveness signals.
 *
 * Response shape (live):
 *   { ok, workerLive, lastHeartbeat, lastClaim, currentJobId, queueDepth }
 * Response shape (worker has never claimed):
 *   { ok: false, reason: "worker_not_claiming_jobs", lastHeartbeat: null, lastClaim: null }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LIVE_WINDOW_MS = 2 * 60 * 1000;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
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
      console.error("[worker-health] missing secrets");
      return json({ ok: false, reason: "server_misconfigured" }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: hb } = await admin
      .from("cinematic_worker_heartbeats")
      .select("worker_id,last_poll_at,last_claim_at,last_job_id")
      .order("last_poll_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: current } = await admin
      .from("cinematic_ad_jobs")
      .select("id")
      .eq("status", "rendering")
      .order("render_started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: queueDepth } = await admin
      .from("cinematic_ad_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "render_queued");

    const lastHeartbeat = hb?.last_poll_at ?? null;
    const lastClaim = hb?.last_claim_at ?? null;

    if (!lastClaim && !lastHeartbeat) {
      console.warn("[worker-health] worker has never claimed");
      return json({
        ok: false,
        reason: "worker_not_claiming_jobs",
        lastHeartbeat: null,
        lastClaim: null,
      });
    }

    const now = Date.now();
    const hbAge = lastHeartbeat ? now - new Date(lastHeartbeat).getTime() : Infinity;
    const claimAge = lastClaim ? now - new Date(lastClaim).getTime() : Infinity;
    const workerLive = Math.min(hbAge, claimAge) < LIVE_WINDOW_MS;

    console.log("[worker-health] snapshot", { workerLive, hbAge, claimAge, queueDepth });
    return json({
      ok: true,
      workerLive,
      lastHeartbeat,
      lastClaim,
      currentJobId: current?.id ?? hb?.last_job_id ?? null,
      queueDepth: queueDepth ?? 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[worker-health] crash", msg);
    return json({ ok: false, reason: "crash", error: msg }, 500);
  }
});