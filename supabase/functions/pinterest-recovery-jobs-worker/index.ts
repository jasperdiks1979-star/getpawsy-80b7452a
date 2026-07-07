// pinterest-recovery-jobs-worker
//
// Consumer for the `public.pinterest_recovery_jobs` queue populated by the
// admin-gated `pinterest-recovery-enqueue` function.
//
// This worker is intentionally separate from the legacy
// `pinterest-recovery-worker` which drains `pinterest_recovery_queue`
// (text-only pin-repair rows). We do NOT read or write that legacy queue.
//
// Contract:
//   • Leases exactly one eligible job with an atomic UPDATE ... RETURNING.
//   • Only phase `republish_deleted_remote` is dispatched here today.
//   • Dispatches to the existing `pinterest-reality-recovery` function
//     using SUPABASE_SERVICE_ROLE_KEY (server-side identity, no preview
//     cookies, no browser session).
//   • Writes back status / result / error / run_id / completed_at.
//
// Auth: this function is invoked by pg_cron with the anon key OR by an
// admin calling it directly. No caller can influence which job is leased.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

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

// Phases this worker knows how to dispatch. Each phase describes the
// full multi-step contract with `pinterest-reality-recovery`.
const ALLOWED_PHASES = new Set<string>(["republish_deleted_remote"]);
function isAllowedPhase(phase: string): boolean {
  return ALLOWED_PHASES.has(phase);
}

const RECOVERY_FN = "pinterest-reality-recovery";

async function callRecovery(
  SUPABASE_URL: string,
  SERVICE_ROLE: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: any; error: string | null }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${RECOVERY_FN}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
    const err = r.ok && parsed?.ok !== false ? null : `dispatch_http_${r.status}`;
    return { status: r.status, json: parsed, error: err };
  } catch (e) {
    return { status: 0, json: null, error: `dispatch_exception:${(e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ ok: false, error: "missing_service_env" }, 500);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Optional body: { dry_run: true } short-circuits before any dispatch.
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const dryRun = body?.dry_run === true;

  // ── Atomic lease: pick the oldest pending job and flip it to running in
  // a single statement. FOR UPDATE SKIP LOCKED prevents two concurrent
  // workers from grabbing the same row.
  const { data: leased, error: leaseErr } = await admin.rpc("pinterest_recovery_jobs_lease_one");

  if (leaseErr) {
    // Fallback path: RPC not present. Use a select+update guarded by status.
    const nowIso = new Date().toISOString();
    const { data: candidate } = await admin
      .from("pinterest_recovery_jobs")
      .select("id, phase, params, attempts, max_attempts")
      .eq("status", "pending")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!candidate) return json({ ok: true, idle: true, leased: null });

    const { data: claimed, error: claimErr } = await admin
      .from("pinterest_recovery_jobs")
      .update({
        status: "running",
        locked_at: nowIso,
        started_at: nowIso,
        attempts: (candidate.attempts ?? 0) + 1,
        updated_at: nowIso,
      })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .select("id, phase, params, attempts, max_attempts")
      .maybeSingle();
    if (claimErr || !claimed) {
      return json({ ok: true, idle: true, leased: null, note: "lost_race" });
    }
    return await runJob(admin, SUPABASE_URL, SERVICE_ROLE, claimed, dryRun);
  }

  const job = Array.isArray(leased) ? leased[0] : leased;
  if (!job) return json({ ok: true, idle: true, leased: null });
  return await runJob(admin, SUPABASE_URL, SERVICE_ROLE, job, dryRun);
});

async function runJob(
  admin: any,
  SUPABASE_URL: string,
  SERVICE_ROLE: string,
  job: { id: string; phase: string; params: any; attempts?: number; max_attempts?: number },
  dryRun: boolean,
) {
  const finish = async (patch: Record<string, unknown>) => {
    const nowIso = new Date().toISOString();
    await admin
      .from("pinterest_recovery_jobs")
      .update({ ...patch, updated_at: nowIso })
      .eq("id", job.id);
  };

  if (!isAllowedPhase(job.phase)) {
    await finish({
      status: "failed",
      error: `phase_not_allowed:${job.phase}`,
      completed_at: new Date().toISOString(),
    });
    return json({ ok: false, job_id: job.id, error: "phase_not_allowed", phase: job.phase }, 200);
  }

  if (dryRun) {
    // Release the lease without dispatching. Used for verification only.
    await finish({
      status: "pending",
      locked_at: null,
      started_at: null,
      error: null,
      result: { dry_run: true, note: "released_without_dispatch" },
    });
    return json({ ok: true, job_id: job.id, phase: job.phase, dry_run: true, dispatched: false });
  }

  // Only phase supported today: republish_deleted_remote.
  //
  // Contract with pinterest-reality-recovery:
  //   1) POST { phase:"audit" }                → returns { ok, run_id, ... }
  //   2) POST { phase:"republish", confirm:true, limit, run_id }
  //
  // Any failure at step 1 or step 2 marks the job as failed and stops.
  // The worker never dispatches verify/certify by itself and never uses run_all.
  const params = job.params ?? {};
  const limit = Number.isFinite(params?.limit) ? Math.max(0, Math.floor(Number(params.limit))) : 30;
  const steps: Array<Record<string, unknown>> = [];

  // ── Step 1: audit ───────────────────────────────────────────────────────
  const auditBody = { phase: "audit" as const };
  const audit = await callRecovery(SUPABASE_URL, SERVICE_ROLE, auditBody);
  steps.push({ step: "audit", request: auditBody, http_status: audit.status, body: audit.json, error: audit.error });
  const runId: string | null = audit.json?.run_id ?? audit.json?.runId ?? null;

  if (audit.error || !runId) {
    await finish({
      status: "failed",
      result: { dispatched_to: RECOVERY_FN, steps },
      dispatch_steps: steps,
      audit_run_id: runId,
      audit_http_status: audit.status,
      audit_response: audit.json,
      dispatched_at: new Date().toISOString(),
      last_error_stage: "audit",
      error: audit.error ?? "audit_missing_run_id",
      run_id: runId,
      completed_at: new Date().toISOString(),
    });
    return json({
      ok: false, job_id: job.id, phase: job.phase,
      dispatched_to: RECOVERY_FN, stage: "audit",
      http_status: audit.status, run_id: runId,
      error: audit.error ?? "audit_missing_run_id",
    });
  }

  // ── Step 2: republish with captured run_id ──────────────────────────────
  const republishBody = {
    phase: "republish" as const,
    confirm: true,
    limit,
    run_id: runId,
    ...(params?.dry_run === true ? { dry_run: true } : {}),
  };
  const republish = await callRecovery(SUPABASE_URL, SERVICE_ROLE, republishBody);
  steps.push({ step: "republish", request: republishBody, http_status: republish.status, body: republish.json, error: republish.error });

  const success = !republish.error;
  await finish({
    status: success ? "completed" : "failed",
    result: { dispatched_to: RECOVERY_FN, run_id: runId, limit, steps },
    dispatch_steps: steps,
    audit_run_id: runId,
    audit_http_status: audit.status,
    audit_response: audit.json,
    republish_http_status: republish.status,
    republish_response: republish.json,
    dispatched_at: new Date().toISOString(),
    last_error_stage: success ? null : "republish",
    error: success ? null : republish.error ?? "republish_reported_failure",
    run_id: runId,
    completed_at: new Date().toISOString(),
  });

  return json({
    ok: success,
    job_id: job.id,
    phase: job.phase,
    dispatched_to: RECOVERY_FN,
    run_id: runId,
    audit_http_status: audit.status,
    republish_http_status: republish.status,
    limit,
  });
}