/**
 * cinematic-ad-watchdog
 *
 * Autonomous operations layer for cinematic_ad_jobs. Runs every 60s via
 * pg_cron, and can be triggered on-demand from the admin UI ("Run
 * Autopilot Now"). Phase 1 detections + recovery:
 *
 *   1. rendering jobs with heartbeat older than 90s
 *        → reset to render_queued, clear worker fields, ++render_attempts
 *   2. render_queued jobs older than 2 minutes with no worker
 *        → redispatch GitHub Actions
 *   3. failed jobs with retryable error_message and render_attempts < 3
 *        → exponential backoff (1min, 5min, 15min) then retry
 *   4. jobs that hit max attempts → status=needs_admin_review
 *
 * Hard stops (skip recovery, set hard_stop_reasons):
 *   - GitHub PAT missing or secrets missing
 *   - Pinterest token rotation required (detected via recent failures)
 *   - Lovable AI / OpenAI credits exhausted (402 in recent logs)
 *
 * Every action writes a row to public.cinematic_ad_job_events.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const HEARTBEAT_STALE_MS = 90 * 1000;
const QUEUE_STALE_MS = 2 * 60 * 1000;
const MAX_RETRIES = 3;
// Backoff in minutes per attempt number (1-indexed)
const BACKOFF_MINUTES = [1, 5, 15];

const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /ECONNRESET/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /network/i,
  /fetch failed/i,
  /502 bad gateway/i,
  /503/i,
  /504/i,
  /temporary/i,
  /transient/i,
  /heartbeat/i,
  /stalled/i,
  /worker/i,
];

const HARD_STOP_ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/billing|payment required|402/i, "billing/payment blocked"],
  [/insufficient (credits|funds)/i, "credits exhausted"],
  [/quota (exceeded|exhausted)/i, "API quota exceeded"],
  [/token (expired|revoked|invalid)/i, "auth token expired/invalid"],
  [/forbidden|unauthorized|401|403/i, "auth rejected"],
];

type WatchdogResult = {
  ok: boolean;
  trace_id: string;
  paused: boolean;
  recovered: Array<{ job_id: string; reason: string }>;
  redispatched: Array<{ job_id: string; ok: boolean; reason?: string }>;
  retried: Array<{ job_id: string; attempt: number }>;
  quarantined: Array<{ job_id: string; reason: string }>;
  hard_stop_reasons: string[];
  detections: Record<string, number>;
};

function trace() { return crypto.randomUUID().slice(0, 8); }
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRetryable(msg: string | null | undefined): boolean {
  if (!msg) return true; // unknown failure → allow one retry
  return RETRYABLE_ERROR_PATTERNS.some((re) => re.test(msg));
}

function detectHardStop(msg: string | null | undefined): string | null {
  if (!msg) return null;
  for (const [re, reason] of HARD_STOP_ERROR_PATTERNS) {
    if (re.test(msg)) return reason;
  }
  return null;
}

async function logEvent(admin: any, args: {
  job_id: string | null;
  event_type: string;
  action_taken?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
  trace_id: string;
  error_message?: string | null;
  recovery_result?: string | null;
  payload?: Record<string, unknown>;
}) {
  try {
    await admin.rpc("cinematic_autopilot_log_event", {
      _job_id: args.job_id,
      _event_type: args.event_type,
      _action_taken: args.action_taken ?? null,
      _previous_status: args.previous_status ?? null,
      _new_status: args.new_status ?? null,
      _trace_id: args.trace_id,
      _error_message: args.error_message ?? null,
      _recovery_result: args.recovery_result ?? null,
      _payload: args.payload ?? {},
    });
  } catch (e) {
    console.error("[watchdog] log_event failed", e);
  }
}

async function callWorkerControl(action: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-worker-control`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      // self_heal and trigger_github_workflow are allowed via internal calls
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function dispatchRender(admin: any, jobId: string, traceId: string): Promise<{ ok: boolean; reason?: string }> {
  // Reuse worker-control trigger_github_workflow logic. Internal call uses anon
  // header; worker-control allows self_heal without secret but trigger_github_workflow
  // still requires admin/service auth. We call it directly via REST with service key.
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-worker-control`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
    },
    body: JSON.stringify({ action: "trigger_github_workflow", job_id: jobId }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data?.dispatched) return { ok: true };
  return { ok: false, reason: data?.message ?? `status ${res.status}` };
}

async function runWatchdog(admin: any, traceId: string, opts: { force?: boolean } = {}): Promise<WatchdogResult> {
  const now = Date.now();
  const result: WatchdogResult = {
    ok: true,
    trace_id: traceId,
    paused: false,
    recovered: [],
    redispatched: [],
    retried: [],
    quarantined: [],
    hard_stop_reasons: [],
    detections: {
      rendering_stale_heartbeat: 0,
      queue_stale_no_worker: 0,
      failed_retryable: 0,
      failed_max_attempts: 0,
      hard_stop_jobs: 0,
    },
  };

  // Read autopilot state
  const { data: stateRow } = await admin
    .from("cinematic_autopilot_state")
    .select("*").eq("id", 1).maybeSingle();
  const paused = !!stateRow?.paused;
  result.paused = paused;

  await logEvent(admin, {
    job_id: null,
    event_type: "watchdog_run_start",
    trace_id: traceId,
    payload: { paused, force: !!opts.force, now: new Date(now).toISOString() },
  });

  // === Hard-stop detection (read-only signals) ===
  // Recent failures with hard-stop patterns in last hour
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const { data: recentFailures } = await admin
    .from("cinematic_ad_jobs")
    .select("id,error_message,pinterest_publish_error")
    .or(`updated_at.gt.${oneHourAgo}`)
    .in("status", ["failed", "needs_admin_review"])
    .limit(50);
  const hardStops = new Set<string>();
  for (const row of recentFailures ?? []) {
    const reason = detectHardStop(row.error_message) || detectHardStop(row.pinterest_publish_error);
    if (reason) {
      hardStops.add(reason);
      result.detections.hard_stop_jobs++;
    }
  }
  result.hard_stop_reasons = Array.from(hardStops);

  // === (1) Stale rendering jobs (heartbeat > 90s) ===
  const hbCutoff = new Date(now - HEARTBEAT_STALE_MS).toISOString();
  const { data: stuck } = await admin
    .from("cinematic_ad_jobs")
    .select("id,status,render_attempts,render_heartbeat_at,render_started_at,render_worker_id,render_log")
    .eq("status", "rendering")
    .or(`render_heartbeat_at.lt.${hbCutoff},and(render_heartbeat_at.is.null,render_started_at.lt.${hbCutoff})`)
    .limit(50);
  result.detections.rendering_stale_heartbeat = stuck?.length ?? 0;

  if (!paused) {
    const nowIso = new Date(now).toISOString();
    for (const row of stuck ?? []) {
      const attempts = (row.render_attempts ?? 0) + 1;
      const reason = row.render_heartbeat_at
        ? `stale heartbeat (last ${row.render_heartbeat_at})`
        : "zombie worker (no heartbeat)";
      const isOverLimit = attempts > MAX_RETRIES;
      const patch: Record<string, unknown> = isOverLimit
        ? {
            status: "needs_admin_review",
            status_message: `Quarantined after ${MAX_RETRIES} retries: ${reason}`,
            render_worker_id: null,
            render_heartbeat_at: null,
            updated_at: nowIso,
          }
        : {
            status: "render_queued",
            render_worker_id: null,
            render_started_at: null,
            render_heartbeat_at: null,
            render_attempts: attempts,
            render_queued_at: nowIso,
            status_message: `Auto-recovered: ${reason}`,
            updated_at: nowIso,
          };
      const { error: updErr } = await admin
        .from("cinematic_ad_jobs")
        .update(patch).eq("id", row.id).eq("status", "rendering");
      if (updErr) {
        await logEvent(admin, {
          job_id: row.id, event_type: "auto_recovered", action_taken: "reset_to_queued",
          previous_status: "rendering", trace_id: traceId,
          error_message: updErr.message, recovery_result: "failed",
          payload: { reason },
        });
        continue;
      }
      if (isOverLimit) {
        result.quarantined.push({ job_id: row.id, reason: `max retries: ${reason}` });
        await logEvent(admin, {
          job_id: row.id, event_type: "quarantined", action_taken: "mark_needs_admin_review",
          previous_status: "rendering", new_status: "needs_admin_review",
          trace_id: traceId, recovery_result: "success",
          payload: { reason, attempts },
        });
      } else {
        result.recovered.push({ job_id: row.id, reason });
        await logEvent(admin, {
          job_id: row.id, event_type: "auto_recovered", action_taken: "reset_to_queued",
          previous_status: "rendering", new_status: "render_queued",
          trace_id: traceId, recovery_result: "success",
          payload: { reason, attempts },
        });
      }
    }
  }

  // === (2) Stale render_queued jobs (no worker, queued > 2min) ===
  const queuedCutoff = new Date(now - QUEUE_STALE_MS).toISOString();
  const { data: queuedStale } = await admin
    .from("cinematic_ad_jobs")
    .select("id,render_queued_at,render_attempts")
    .eq("status", "render_queued")
    .is("render_worker_id", null)
    .is("render_started_at", null)
    .lt("render_queued_at", queuedCutoff)
    .order("render_queued_at", { ascending: true })
    .limit(10);
  result.detections.queue_stale_no_worker = queuedStale?.length ?? 0;

  if (!paused && result.hard_stop_reasons.length === 0) {
    // Only redispatch one per run — workflow refuses concurrent renders.
    for (const row of queuedStale ?? []) {
      const r = await dispatchRender(admin, row.id, traceId);
      result.redispatched.push({ job_id: row.id, ok: r.ok, reason: r.reason });
      await logEvent(admin, {
        job_id: row.id,
        event_type: "redispatched",
        action_taken: "trigger_github_workflow",
        previous_status: "render_queued",
        new_status: "render_queued",
        trace_id: traceId,
        recovery_result: r.ok ? "success" : "failed",
        error_message: r.reason,
        payload: { queued_for_ms: now - new Date(row.render_queued_at).getTime() },
      });
      if (r.ok) break;
    }
  }

  // === (3) Failed jobs with retryable errors — exponential backoff ===
  const { data: failed } = await admin
    .from("cinematic_ad_jobs")
    .select("id,status,error_message,render_attempts,updated_at,approved_for_render")
    .eq("status", "failed")
    .limit(50);

  for (const row of failed ?? []) {
    const attempts = row.render_attempts ?? 0;
    const hardReason = detectHardStop(row.error_message);
    if (hardReason) {
      // Move to needs_admin_review — no auto retry on hard stops.
      if (!paused) {
        await admin
          .from("cinematic_ad_jobs")
          .update({
            status: "needs_admin_review",
            status_message: `Hard stop: ${hardReason}`,
            updated_at: new Date(now).toISOString(),
          })
          .eq("id", row.id).eq("status", "failed");
        result.quarantined.push({ job_id: row.id, reason: `hard_stop:${hardReason}` });
        await logEvent(admin, {
          job_id: row.id, event_type: "quarantined", action_taken: "hard_stop",
          previous_status: "failed", new_status: "needs_admin_review",
          trace_id: traceId, recovery_result: "success",
          error_message: row.error_message, payload: { hard_stop: hardReason },
        });
      }
      result.detections.failed_max_attempts++;
      continue;
    }
    if (attempts >= MAX_RETRIES) {
      result.detections.failed_max_attempts++;
      if (!paused) {
        await admin
          .from("cinematic_ad_jobs")
          .update({
            status: "needs_admin_review",
            status_message: `Quarantined after ${attempts} retries: ${row.error_message ?? "unknown error"}`,
            updated_at: new Date(now).toISOString(),
          })
          .eq("id", row.id).eq("status", "failed");
        result.quarantined.push({ job_id: row.id, reason: `max retries (${attempts})` });
        await logEvent(admin, {
          job_id: row.id, event_type: "quarantined", action_taken: "mark_needs_admin_review",
          previous_status: "failed", new_status: "needs_admin_review",
          trace_id: traceId, recovery_result: "success",
          error_message: row.error_message, payload: { attempts },
        });
      }
      continue;
    }
    if (!isRetryable(row.error_message)) continue;
    if (!row.approved_for_render) continue; // never silently relaunch unapproved jobs

    result.detections.failed_retryable++;

    // Exponential backoff: attempt N waits BACKOFF_MINUTES[N-1] since updated_at
    const backoffMin = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
    const eligibleAt = new Date(new Date(row.updated_at).getTime() + backoffMin * 60 * 1000).getTime();
    if (now < eligibleAt) continue; // not yet

    if (paused) continue;

    const nextAttempt = attempts + 1;
    const { error: updErr } = await admin
      .from("cinematic_ad_jobs")
      .update({
        status: "render_queued",
        render_worker_id: null,
        render_started_at: null,
        render_heartbeat_at: null,
        render_attempts: nextAttempt,
        render_queued_at: new Date(now).toISOString(),
        error_message: null,
        status_message: `Auto-retry ${nextAttempt}/${MAX_RETRIES} after ${backoffMin}m backoff`,
        updated_at: new Date(now).toISOString(),
      })
      .eq("id", row.id).eq("status", "failed");
    if (updErr) {
      await logEvent(admin, {
        job_id: row.id, event_type: "retry_scheduled", action_taken: "reset_to_queued",
        previous_status: "failed", trace_id: traceId,
        error_message: updErr.message, recovery_result: "failed",
        payload: { attempt: nextAttempt, backoff_minutes: backoffMin },
      });
      continue;
    }
    result.retried.push({ job_id: row.id, attempt: nextAttempt });
    await logEvent(admin, {
      job_id: row.id, event_type: "retry_scheduled", action_taken: "reset_to_queued",
      previous_status: "failed", new_status: "render_queued",
      trace_id: traceId, recovery_result: "success",
      payload: { attempt: nextAttempt, backoff_minutes: backoffMin, max: MAX_RETRIES },
    });
  }

  // === Update autopilot state ===
  await admin
    .from("cinematic_autopilot_state")
    .update({
      last_watchdog_run_at: new Date(now).toISOString(),
      last_watchdog_result: result as unknown as Record<string, unknown>,
      hard_stop_reasons: result.hard_stop_reasons,
      updated_at: new Date(now).toISOString(),
    })
    .eq("id", 1);

  await logEvent(admin, {
    job_id: null,
    event_type: "watchdog_run_complete",
    trace_id: traceId,
    recovery_result: "success",
    payload: {
      recovered: result.recovered.length,
      redispatched: result.redispatched.filter((r) => r.ok).length,
      retried: result.retried.length,
      quarantined: result.quarantined.length,
      hard_stop_reasons: result.hard_stop_reasons,
      detections: result.detections,
    },
  });

  console.log(`[watchdog] ${traceId} done`, {
    paused,
    recovered: result.recovered.length,
    redispatched: result.redispatched.filter((r) => r.ok).length,
    retried: result.retried.length,
    quarantined: result.quarantined.length,
    hard_stops: result.hard_stop_reasons,
  });
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ ok: false, traceId, message: "backend not configured" }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};
    const force = !!body.force;

    // Auth: admin user via Bearer JWT, OR internal cron (anon key, no user).
    // The watchdog only acts on cinematic_ad_jobs and never returns sensitive
    // data, so allowing anon-key invocation (rate-limited by cron) is safe.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ") && !authHeader.includes(SERVICE_KEY)) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) {
        const { data: roleRow } = await admin
          .from("user_roles").select("role")
          .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
        if (!roleRow) {
          return json({ ok: false, traceId, message: "forbidden" }, 403);
        }
      }
    }

    const result = await runWatchdog(admin, traceId, { force });
    return json({ ok: true, traceId, result });
  } catch (e) {
    console.error(`[watchdog] ${traceId} fatal`, e);
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
