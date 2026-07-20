/**
 * worker-health (public)
 *
 * Real backend JSON endpoint for worker health.
 * No auth — safe to expose publicly; reveals only liveness signals.
 *
 * Canonical app alias: /api/health/worker (when hosting supports API proxying)
 * Direct backend fallback: /functions/v1/worker-health
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LIVE_WINDOW_MS = 10 * 60 * 1000;

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
      return json({ ok: false, route: "/api/health/worker", workerLive: false, lastHeartbeat: null, lastClaim: null, queueDepth: 0, message: "API route active but backend is misconfigured" });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: hb, error: hbError } = await admin
      .from("cinematic_worker_heartbeats")
      .select("worker_id,last_poll_at,last_claim_at,last_job_id")
      .order("last_poll_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: current, error: currentError } = await admin
      .from("cinematic_ad_jobs")
      .select("id")
      .eq("status", "rendering")
      .order("render_started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastClaimRow, error: claimError } = await admin
      .from("cinematic_ad_jobs")
      .select("id,render_started_at,updated_at")
      .not("render_started_at", "is", null)
      .order("render_started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastTouchedRow, error: touchError } = await admin
      .from("cinematic_ad_jobs")
      .select("id,updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: queueDepth, error: queueError } = await admin
      .from("cinematic_ad_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "render_queued");

    const lastHeartbeat = hb?.last_poll_at ?? null;
    const lastClaim = hb?.last_claim_at ?? lastClaimRow?.render_started_at ?? null;
    const lastTouched = lastTouchedRow?.updated_at ?? lastClaimRow?.updated_at ?? null;

    const now = Date.now();
    const hbAge = lastHeartbeat ? now - new Date(lastHeartbeat).getTime() : Infinity;
    const claimAge = lastClaim ? now - new Date(lastClaim).getTime() : Infinity;
    const touchAge = lastTouched ? now - new Date(lastTouched).getTime() : Infinity;
    const actualWorkerLive = Math.min(hbAge, claimAge, touchAge) < LIVE_WINDOW_MS;
    const routeActive = !hbError && !currentError && !claimError && !touchError && !queueError;

    console.log("[worker-health] snapshot", { workerLive: actualWorkerLive, routeActive, hbAge, claimAge, queueDepth });
    return json({
      ok: true,
      route: "/api/health/worker",
      // workerLive must reflect a REAL heartbeat / claim / job-touch within the live window.
      // Route-availability is reported separately so the UI can distinguish "endpoint up"
      // from "worker actually polling".
      workerLive: actualWorkerLive,
      routeActive,
      lastHeartbeat,
      lastClaim,
      currentJobId: current?.id ?? hb?.last_job_id ?? null,
      queueDepth: queueDepth ?? 0,
      message: actualWorkerLive ? "Worker live" : "API route active — no recent worker activity",
      errors: {
        heartbeat: hbError?.message ?? null,
        current: currentError?.message ?? null,
        claim: claimError?.message ?? null,
        touch: touchError?.message ?? null,
        queue: queueError?.message ?? null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[worker-health] crash", msg);
    return json({ ok: false, route: "/api/health/worker", workerLive: false, lastHeartbeat: null, lastClaim: null, queueDepth: 0, message: "API route active but health lookup failed", error: msg });
  }
});