/**
 * cinematic-ad-worker-control
 *
 * Admin-only control surface for the cinematic-ad pipeline.
 * Actions:
 *   - health         → returns secret presence, DB-derived worker health,
 *                      stale-candidate jobs, and proxies /health/worker
 *                      (when RENDER_WORKER_HEALTH_URL is set).
 *   - mark_stale     → flips render_queued > 10min jobs without
 *                      render_started_at to status='worker_stale'.
 *   - retry_render   → resets a job back to render_queued.
 *   - retry_publish  → re-runs the Pinterest publish chain for a job
 *                      that already has output_mp4_url.
 *
 * Logging tags: [worker-health] [worker-claim] [worker-stale]
 *               [retry-render] [retry-pinterest]
 *               [pinterest-publish-success] [pinterest-publish-error]
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
const RENDER_WORKER_HEALTH_URL = Deno.env.get("RENDER_WORKER_HEALTH_URL") ?? "";

const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes
const WORKER_LIVE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

function trace() { return crypto.randomUUID().slice(0, 8); }
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredSecretsReport() {
  return {
    SUPABASE_URL: !!SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
    RENDER_WORKER_SECRET: !!RENDER_WORKER_SECRET,
    RENDER_WORKER_HEALTH_URL: !!RENDER_WORKER_HEALTH_URL,
  };
}

function missingRequired(): string[] {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!RENDER_WORKER_SECRET) missing.push("RENDER_WORKER_SECRET");
  return missing;
}

async function fetchWorkerHealth(traceId: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (!RENDER_WORKER_HEALTH_URL) return { ok: false, error: "RENDER_WORKER_HEALTH_URL not set" };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(RENDER_WORKER_HEALTH_URL, { signal: ctrl.signal });
    clearTimeout(t);
    const body = await res.json().catch(() => ({}));
    console.log(`[worker-health] ${traceId} fetched`, { status: res.status, busy: body?.busy });
    return { ok: res.ok, data: body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[worker-health] ${traceId} fetch failed`, msg);
    return { ok: false, error: msg };
  }
}

async function buildHealthSnapshot(admin: any, traceId: string) {
  const now = Date.now();

  // last claim = most recent render_started_at across all jobs
  const { data: lastClaimRow } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,render_started_at,render_worker_id,status")
    .not("render_started_at", "is", null)
    .order("render_started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastCompleteRow } = await admin
    .from("cinematic_ad_jobs")
    .select("id,render_complete_at")
    .not("render_complete_at", "is", null)
    .order("render_complete_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // currently rendering job (if any)
  const { data: currentRow } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,render_worker_id,render_started_at")
    .eq("status", "rendering")
    .order("render_started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // queued jobs that look stale (queued > 10min, never started)
  const cutoffIso = new Date(now - STALE_AFTER_MS).toISOString();
  const { data: staleCandidates } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,render_queued_at,status")
    .eq("status", "render_queued")
    .is("render_started_at", null)
    .lt("render_queued_at", cutoffIso);

  // already-flagged stale jobs
  const { data: flaggedStale } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,render_queued_at,status_message")
    .eq("status", "worker_stale");

  // Heartbeat row written by the Render background worker on every poll —
  // this is the primary liveness signal because Background Workers expose
  // no public HTTP routes.
  const { data: heartbeatRow } = await admin
    .from("cinematic_worker_heartbeats")
    .select("worker_id,last_poll_at,last_claim_at,last_job_id,updated_at")
    .order("last_poll_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Most recent activity timestamp from cinematic_ad_jobs (any of the worker-touched fields)
  const { data: lastTouchedRow } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,updated_at,render_started_at,render_complete_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const heartbeatAt = heartbeatRow?.last_poll_at ?? null;
  const heartbeatAgeMs = heartbeatAt ? now - new Date(heartbeatAt).getTime() : null;
  const lastClaimAt =
    heartbeatRow?.last_claim_at ?? lastClaimRow?.render_started_at ?? null;
  const lastCompleteAt = lastCompleteRow?.render_complete_at ?? null;
  const lastTouchedAt = lastTouchedRow?.updated_at ?? null;
  const lastClaimAgeMs = lastClaimAt ? now - new Date(lastClaimAt).getTime() : null;
  const lastTouchedAgeMs = lastTouchedAt ? now - new Date(lastTouchedAt).getTime() : null;

  // Worker is "live" if ANY of these signals fired within the live window
  // (heartbeat is preferred, but job activity is enough — Background Workers
  // have no HTTP endpoint we can rely on).
  const liveSignals = [heartbeatAgeMs, lastClaimAgeMs, lastTouchedAgeMs]
    .filter((v): v is number => typeof v === "number");
  const workerLive =
    liveSignals.length > 0 && Math.min(...liveSignals) < STALE_AFTER_MS;

  // Only mark "stale" when there are jobs sitting in render_queued AND no
  // liveness signal in the last 10 minutes. A backlog with a live worker
  // is just a backlog, not a stuck worker.
  const hasStaleQueue =
    (staleCandidates?.length ?? 0) > 0 || (flaggedStale?.length ?? 0) > 0;
  const workerStale = hasStaleQueue && !workerLive;

  console.log(`[worker-health] ${traceId} snapshot`, {
    workerLive, workerStale,
    heartbeatAgeMs, lastClaimAgeMs, lastTouchedAgeMs,
    staleCandidates: staleCandidates?.length ?? 0,
    flaggedStale: flaggedStale?.length ?? 0,
  });

  return {
    workerLive,
    workerStale,
    lastClaimAt,
    lastClaimAgeMs,
    lastClaimWorkerId: lastClaimRow?.render_worker_id ?? null,
    lastClaimJobId: lastClaimRow?.id ?? null,
    lastCompleteAt,
    heartbeat: heartbeatRow ?? null,
    heartbeatAgeMs,
    lastTouchedAt,
    lastTouchedAgeMs,
    currentJob: currentRow ?? null,
    staleCandidates: staleCandidates ?? [],
    flaggedStale: flaggedStale ?? [],
    staleThresholdMs: STALE_AFTER_MS,
    workerLiveWindowMs: STALE_AFTER_MS,
  };
}

async function markStale(admin: any, traceId: string) {
  // Safety: never auto-mark queued jobs as stale if the worker has any
  // liveness signal in the last 10 minutes (heartbeat, claim, or job touch).
  const now = Date.now();
  const cutoffIso10 = new Date(now - STALE_AFTER_MS).toISOString();
  const { data: hb } = await admin
    .from("cinematic_worker_heartbeats")
    .select("last_poll_at,last_claim_at")
    .gt("last_poll_at", cutoffIso10)
    .limit(1)
    .maybeSingle();
  const { data: recentTouch } = await admin
    .from("cinematic_ad_jobs")
    .select("id")
    .gt("updated_at", cutoffIso10)
    .limit(1)
    .maybeSingle();
  if (hb || recentTouch) {
    console.log(`[worker-stale] ${traceId} skip auto-mark — worker has recent activity`);
    return { marked: 0, ids: [] as string[], skipped: true as const };
  }
  const cutoffIso = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data: targets, error } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,render_queued_at")
    .eq("status", "render_queued")
    .is("render_started_at", null)
    .lt("render_queued_at", cutoffIso);
  if (error) throw error;
  if (!targets || targets.length === 0) {
    console.log(`[worker-stale] ${traceId} no stale jobs`);
    return { marked: 0, ids: [] as string[] };
  }
  const ids = targets.map((t: any) => t.id);
  const { error: updErr } = await admin
    .from("cinematic_ad_jobs")
    .update({
      status: "worker_stale",
      status_message: "Render worker is not claiming jobs",
    })
    .in("id", ids);
  if (updErr) throw updErr;
  console.warn(`[worker-stale] ${traceId} marked ${ids.length} jobs`, { ids });
  return { marked: ids.length, ids };
}

async function retryRender(admin: any, jobId: string, traceId: string) {
  let supabaseHost = "unknown";
  try { supabaseHost = new URL(SUPABASE_URL).host; } catch { /* noop */ }
  const { data: job, error: jobErr } = await admin
    .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobErr || !job) throw new Error("job not found");
  const prevStatus = job.status;
  const renderToken = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const patch = {
    status: "render_queued",
    render_token: renderToken,
    render_queued_at: nowIso,
    render_started_at: null,
    render_complete_at: null,
    render_worker_id: null,
    error_message: null,
    pinterest_publish_error: null,
    rendered_at: null,
    status_message: "Re-queued via admin retry.",
    updated_at: nowIso,
  };
  const { error: updErr, count: updCount } = await admin
    .from("cinematic_ad_jobs")
    .update(patch, { count: "exact" })
    .eq("id", jobId);
  if (updErr) throw updErr;
  // Re-fetch to confirm DB-side state.
  const { data: fresh } = await admin
    .from("cinematic_ad_jobs")
    .select("id,status,render_queued_at,render_started_at,render_complete_at,render_worker_id,render_attempts,error_message,updated_at")
    .eq("id", jobId)
    .maybeSingle();
  console.log(`[retry-render] ${traceId} re-queued`, {
    jobId,
    prevStatus,
    newStatus: fresh?.status,
    supabase_host: supabaseHost,
    update_count: updCount ?? null,
    fresh,
  });
  return { ok: true, jobId, prevStatus, newStatus: fresh?.status ?? "render_queued", supabase_host: supabaseHost, fresh };
}

async function retryPublish(admin: any, jobId: string, traceId: string) {
  const { data: job, error: jobErr } = await admin
    .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobErr || !job) throw new Error("job not found");
  if (!job.output_mp4_url) throw new Error("job has no output_mp4_url; render first");

  // Re-invoke the webhook with status="uploaded" so the auto-publish chain
  // runs end-to-end (asset upsert → queue_draft → publish) with its own
  // bounded retries — no duplication of logic here.
  console.log(`[retry-pinterest] ${traceId} triggering publish chain`, { jobId });
  await admin.from("cinematic_ad_jobs").update({
    pinterest_publish_error: null,
    status_message: "Manual retry: re-running publish chain.",
  }).eq("id", jobId);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-render-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-render-secret": RENDER_WORKER_SECRET,
    },
    body: JSON.stringify({
      job_id: jobId,
      status: "uploaded",
      render_token: job.render_token ?? "",
      mp4_url: job.output_mp4_url,
    }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body?.ok) {
    console.error(`[pinterest-publish-error] ${traceId} retry failed`, { status: res.status, body });
    throw new Error(body?.message ?? `webhook status ${res.status}`);
  }
  console.log(`[pinterest-publish-success] ${traceId} retry chain dispatched`, { jobId });
  return { ok: true, jobId, webhookTrace: body.traceId ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    const missing = missingRequired();
    if (missing.length > 0) {
      return json({
        ok: false,
        traceId,
        code: "MISSING_SECRETS",
        message: `Missing required secrets: ${missing.join(", ")}. Configure them in Lovable Cloud → Functions → Secrets.`,
        secrets: requiredSecretsReport(),
      }, 500);
    }

    // Auth: admin only
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, traceId, message: "unauthenticated" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ ok: false, traceId, message: "unauthenticated" }, 401);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ ok: false, traceId, message: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "health");

    if (action === "health") {
      // Auto-mark stale on every health poll so UI never lies.
      let autoMarked = { marked: 0, ids: [] as string[] };
      try { autoMarked = await markStale(admin, traceId); } catch (e) {
        console.error(`[worker-stale] ${traceId} auto-mark failed`, e);
      }
      const snapshot = await buildHealthSnapshot(admin, traceId);
      const workerHealth = await fetchWorkerHealth(traceId);
      console.log(`[worker-claim] ${traceId} lastClaimAt=${snapshot.lastClaimAt} live=${snapshot.workerLive}`);
      return json({
        ok: true,
        traceId,
        secrets: requiredSecretsReport(),
        snapshot,
        autoMarked,
        workerHealth,
      });
    }

    if (action === "mark_stale") {
      const result = await markStale(admin, traceId);
      return json({ ok: true, traceId, ...result });
    }

    if (action === "retry_render") {
      const jobId = String(body.job_id ?? "");
      if (!jobId) return json({ ok: false, traceId, message: "job_id required" }, 400);
      const result = await retryRender(admin, jobId, traceId);
      return json({ ok: true, traceId, ...result });
    }

    if (action === "retry_publish") {
      const jobId = String(body.job_id ?? "");
      if (!jobId) return json({ ok: false, traceId, message: "job_id required" }, 400);
      const result = await retryPublish(admin, jobId, traceId);
      return json({ ok: true, traceId, ...result });
    }

    if (action === "debug_panel") {
      let supabaseHost = "unknown";
      try { supabaseHost = new URL(SUPABASE_URL).host; } catch { /* noop */ }
      const { data: rows, error: rowsErr } = await admin
        .from("cinematic_ad_jobs")
        .select("id,status,render_queued_at,render_started_at,render_complete_at,render_worker_id,updated_at")
        .order("updated_at", { ascending: false })
        .limit(10);
      const { data: allStatus, error: statErr } = await admin
        .from("cinematic_ad_jobs")
        .select("status");
      const counts: Record<string, number> = {};
      for (const r of allStatus ?? []) {
        counts[r.status] = (counts[r.status] ?? 0) + 1;
      }
      return json({
        ok: true,
        traceId,
        supabase_host: supabaseHost,
        table: "cinematic_ad_jobs",
        status_counts: counts,
        latest_rows: rows ?? [],
        errors: { rowsErr: rowsErr?.message ?? null, statErr: statErr?.message ?? null },
      });
    }

    return json({ ok: false, traceId, message: `unknown action: ${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[worker-health] ${traceId} crash`, msg);
    return json({ ok: false, traceId, message: msg }, 500);
  }
});