// pinterest-recovery-worker — SERVER-SIDE executor.
//
// Runs completely detached from any browser / preview session. Uses the
// service role to invoke the existing pinterest-reality-recovery function,
// which already accepts SUPABASE_SERVICE_ROLE_KEY as a valid caller.
//
// Trigger sources (all server-side):
//   1. pg_cron (every minute) via pg_net.http_post
//   2. Best-effort kick from pinterest-recovery-enqueue after INSERT
//   3. Manual admin trigger from the admin dashboard (still service-role auth
//      on the recovery function itself)
//
// One job per invocation. Uses SELECT ... FOR UPDATE SKIP LOCKED semantics
// through a dedicated claim step so parallel workers cannot double-execute.
//
// NOTE: this function does not require an incoming JWT — it is protected by
// its own logic (it only acts on rows in pinterest_recovery_jobs and only
// calls the recovery function using SERVICE_ROLE). It never trusts the
// caller's identity for authorization.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// A single-phase invocation cannot exceed the edge gateway wall clock.
// The recovery function itself has 150s. We add a small safety window
// and let the phase complete or timeout server-side.
const RECOVERY_TIMEOUT_MS = 150_000;

async function claimNextJob(admin: any): Promise<any | null> {
  // Fetch oldest pending job, then compare-and-swap to 'running'.
  // updated_at check ensures we don't clobber a competing worker.
  const { data: candidate } = await admin
    .from("pinterest_recovery_jobs")
    .select("id, updated_at")
    .eq("status", "pending")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!candidate) return null;

  const { data: claimed, error } = await admin
    .from("pinterest_recovery_jobs")
    .update({
      status: "running",
      locked_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      attempts: 1,
    })
    .eq("id", candidate.id)
    .eq("status", "pending")             // guard against races
    .eq("updated_at", candidate.updated_at)
    .select("id, phase, params, attempts, max_attempts, requested_by")
    .maybeSingle();
  if (error || !claimed) return null;
  return claimed;
}

async function invokeRecovery(
  supabaseUrl: string,
  serviceRole: string,
  phase: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RECOVERY_TIMEOUT_MS);
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/pinterest-reality-recovery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRole}`,
      },
      body: JSON.stringify({ phase, ...params }),
      signal: controller.signal,
    });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok && body?.ok !== false, status: r.status, body };
  } catch (e) {
    return {
      ok: false, status: 0,
      body: { message: (e as Error).message, aborted: (e as Error).name === "AbortError" },
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const started = Date.now();
  const trace = crypto.randomUUID().slice(0, 8);

  // Recover any 'running' jobs abandoned by a previous invocation
  // (edge timeout / cold-start crash). Anything running > 3 min is stale.
  await admin.from("pinterest_recovery_jobs")
    .update({
      status: "failed",
      error: "worker_timeout_before_completion",
      completed_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("locked_at", new Date(Date.now() - 3 * 60_000).toISOString());

  const job = await claimNextJob(admin);
  if (!job) {
    return json({ ok: true, trace, idle: true, elapsed_ms: Date.now() - started });
  }

  const phase = String(job.phase);
  const params = (job.params || {}) as Record<string, unknown>;
  console.log(`[recovery-worker ${trace}] executing job=${job.id} phase=${phase}`);

  const res = await invokeRecovery(SUPABASE_URL, SERVICE_ROLE, phase, params);
  const durationMs = Date.now() - started;

  const runId: string | null =
    (res.body && typeof res.body === "object" && (res.body as any).run_id) || null;

  if (res.ok) {
    await admin.from("pinterest_recovery_jobs")
      .update({
        status: "completed",
        result: { http_status: res.status, body: res.body, duration_ms: durationMs },
        run_id: runId,
        error: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return json({ ok: true, trace, job_id: job.id, phase, run_id: runId, duration_ms: durationMs });
  }

  await admin.from("pinterest_recovery_jobs")
    .update({
      status: "failed",
      result: { http_status: res.status, body: res.body, duration_ms: durationMs },
      run_id: runId,
      error: (res.body && ((res.body as any).message || JSON.stringify(res.body).slice(0, 500))) || `http ${res.status}`,
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  return json({ ok: false, trace, job_id: job.id, phase, run_id: runId, http_status: res.status, body: res.body }, 200);
});