/**
 * deploy-verify
 *
 * Post-deploy gate for the Pinterest publishing pipeline.
 *
 * Runs two non-destructive checks:
 *   1. GET worker-health  -> verifies the render worker is alive (heartbeat
 *      within LIVE_WINDOW_MS) and the DB is reachable.
 *   2. POST cinematic-ad-claim-job with a sentinel job_id  -> exercises the
 *      RENDER_WORKER_SECRET auth path, the CLAIMABLE_STATUSES read path, and
 *      the diagnostic 404 branch. No job is actually claimed.
 *
 * On success: stamps pinterest_runtime_settings.deploy_verified_at = now(),
 * which the pinterest-cron-worker guard checks before allowing pin publishes.
 *
 * On failure: leaves deploy_verified_at untouched (so publishing stays blocked)
 * and records the failure in last_deploy_verification for the admin UI.
 *
 * Auth: public (verify_jwt = false). Safe — only writes a verified timestamp
 * to a single row, and only when both probes succeed.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const SENTINEL_JOB_ID = "00000000-0000-0000-0000-000000000000";
// claim-job restricts non-destructive probes to gh-actions-* worker_ids
// (see CLAIM_JOB_ALLOW_NON_GH). Use a gh-actions-prefixed sentinel id.
const PROBE_WORKER_ID = "gh-actions-deploy-verify-probe";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Probe 1: worker health ──────────────────────────────────────────
    let workerHealth: Record<string, unknown> = {};
    let workerLive = false;
    let healthError: string | null = null;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/worker-health`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      workerHealth = await res.json().catch(() => ({}));
      workerLive = Boolean((workerHealth as { workerLive?: boolean }).workerLive);
      if (!res.ok) healthError = `worker-health HTTP ${res.status}`;
    } catch (err) {
      healthError = `worker-health fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    // ── Probe 2: queue-claim path (non-destructive sentinel) ────────────
    let claimOk = false;
    let claimError: string | null = null;
    let claimBody: unknown = null;
    if (!RENDER_WORKER_SECRET) {
      claimError = "RENDER_WORKER_SECRET not configured";
    } else {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-claim-job`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-render-secret": RENDER_WORKER_SECRET,
          },
          body: JSON.stringify({
            worker_id: PROBE_WORKER_ID,
            job_id: SENTINEL_JOB_ID,
          }),
        });
        claimBody = await res.json().catch(() => null);
        // We expect a 404 with reason="job_not_found" — that proves the
        // function authenticated, read the DB, and ran the diagnostic path.
        const body = claimBody as { reason?: string; message?: string } | null;
        if (res.status === 404 && body?.reason === "job_not_found") {
          claimOk = true;
        } else if (res.status === 401) {
          claimError = "claim-job rejected RENDER_WORKER_SECRET (rotate or mismatch)";
        } else {
          claimError = `unexpected claim-job response: HTTP ${res.status} reason=${body?.reason ?? "n/a"} message=${body?.message ?? "n/a"}`;
        }
      } catch (err) {
        claimError = `claim-job fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const verified = workerLive && claimOk;
    const finishedAt = new Date().toISOString();
    const summary = {
      traceId,
      startedAt,
      finishedAt,
      workerLive,
      healthError,
      workerHealth,
      claimOk,
      claimError,
      claimBody,
    };

    // Persist result. Only advance deploy_verified_at on full success.
    const update: Record<string, unknown> = { last_deploy_verification: summary };
    if (verified) update.deploy_verified_at = finishedAt;

    const { error: updErr } = await admin
      .from("pinterest_runtime_settings")
      .update(update)
      .eq("id", 1);
    if (updErr) {
      console.error(`[deploy-verify] ${traceId} settings update failed`, updErr);
    }

    return json({
      ok: verified,
      traceId,
      message: verified
        ? "Deploy verified — Pinterest publishing gate is open."
        : "Deploy verification failed — Pinterest publishing remains blocked.",
      verified,
      workerLive,
      claimOk,
      healthError,
      claimError,
      workerHealth,
    }, verified ? 200 : 503);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[deploy-verify] ${traceId} fatal`, err);
    return json({ ok: false, traceId, message }, 500);
  }
});