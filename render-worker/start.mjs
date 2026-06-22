#!/usr/bin/env node
/**
 * GetPawsy cinematic render worker — production-hardened.
 *
 * Required env:  SUPABASE_URL, RENDER_WORKER_SECRET
 * Optional env:  POLL_INTERVAL_MS (default 120000), RENDER_WORKER_ID,
 *                PORT (if set, exposes /health, /health/worker,
 *                      /health/supabase, /debug/runtime),
 *                MAX_CONSECUTIVE_FAILURES (default 5),
 *                CLAIM_TIMEOUT_MS (default 15000),
 *                RENDER_TIMEOUT_MS (default 20*60*1000)
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import { createHash } from "node:crypto";

// ---------- structured logger ----------
const log = (level, msg, extra = {}) => {
  try {
    process.stdout.write(JSON.stringify({
      ts: new Date().toISOString(), level, msg, ...extra,
    }) + "\n");
  } catch {
    console.log(`[${level}] ${msg}`);
  }
};

// ---------- env validation ----------
// Plain-text boot banner — printed BEFORE any JSON logs so Render's log
// viewer shows an unmistakable marker even if structured logging is filtered
// or the process crashes during env validation. If this line is missing from
// Render logs, the service is running the wrong image (e.g. the root nginx
// Dockerfile) — see render.yaml for the correct dockerfilePath.
console.log(`[RENDER WORKER] booting service=getpawsy-render-worker node=${process.version} pid=${process.pid} safeMode=${process.env.WORKER_SAFE_MODE !== "0"}`);
const REQUIRED = ["SUPABASE_URL", "RENDER_WORKER_SECRET"];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[RENDER WORKER] FATAL missing env: ${missing.join(", ")}`);
  log("fatal", "missing required env", { missing });
  // Crash-loop guard: write fatal log, sleep so Render doesn't fast-restart.
  try {
    const fs = await import("node:fs/promises");
    await fs.writeFile("/tmp/worker-fatal.json", JSON.stringify({
      ts: new Date().toISOString(), reason: "missing_env", missing,
    }, null, 2));
  } catch {}
  await new Promise(r => setTimeout(r, 30_000));
  process.exit(1);
}
console.log(`[RENDER WORKER] env ok (${REQUIRED.join(", ")} present)`);

// Top-level safety nets — print stack traces so Render logs surface the real
// cause instead of the generic "exited with status 128".
process.on("uncaughtException", (err) => {
  console.error("[RENDER WORKER] uncaughtException:", err?.stack || err);
  try { log("fatal", "uncaughtException", { err: String(err?.message ?? err) }); } catch {}
});
process.on("unhandledRejection", (reason) => {
  console.error("[RENDER WORKER] unhandledRejection:", reason?.stack || reason);
  try { log("fatal", "unhandledRejection", { err: String(reason?.message ?? reason) }); } catch {}
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "remotion", "scripts", "render-cinematic-ad.mjs");

const SUPABASE_URL = process.env.SUPABASE_URL;
let SUPABASE_HOST = "unknown";
try { SUPABASE_HOST = new URL(SUPABASE_URL).host; } catch { /* noop */ }
const EXPECTED_SUPABASE_HOST = process.env.EXPECTED_SUPABASE_HOST || "nojvgfbcjgipjxpfatmm.supabase.co";
const HOST_MISMATCH = SUPABASE_HOST !== EXPECTED_SUPABASE_HOST;
if (HOST_MISMATCH) {
  log("fatal", "SUPABASE_URL points to the wrong backend — keeping health server up so admin UI can see the mismatch", {
    supabaseHost: SUPABASE_HOST,
    expected: EXPECTED_SUPABASE_HOST,
  });
}
const SECRET = process.env.RENDER_WORKER_SECRET;
const URL_REF = SUPABASE_HOST.split(".")[0] || null;
// Safe fingerprint: never logs the secret itself. Lets ops compare worker vs
// edge-function side without exposing the value.
const SECRET_FINGERPRINT = SECRET
  ? {
      length: SECRET.length,
      sha256_prefix: createHash("sha256").update(SECRET).digest("hex").slice(0, 12),
      has_leading_ws: /^\s/.test(SECRET),
      has_trailing_ws: /\s$/.test(SECRET),
      has_quotes: /^["'].*["']$/.test(SECRET),
    }
  : null;

const POLL = Number(process.env.POLL_INTERVAL_MS || 5_000);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 30_000);
const WORKER_ID = process.env.RENDER_WORKER_ID || `render-worker-${Math.random().toString(36).slice(2, 8)}`;
const ONCE = process.argv.includes("--once");
const PORT = Number(process.env.PORT || 10000);
const MAX_CONSECUTIVE_FAILURES = Number(process.env.MAX_CONSECUTIVE_FAILURES || 5);
const CLAIM_TIMEOUT_MS = Number(process.env.CLAIM_TIMEOUT_MS || 15_000);
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS || 20 * 60 * 1000);
// Emergency stabilization: SAFE MODE (default ON).
// In safe mode the worker only does: claim → render → upload. No cleanup,
// no audit, no Pinterest publish, no autopilot recursion.
const SAFE_MODE = process.env.WORKER_SAFE_MODE !== "0";
const STARTUP_TIMEOUT_MS = Number(process.env.STARTUP_TIMEOUT_MS || 20_000);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 1);

// ---------- runtime state ----------
const STARTED_AT = Date.now();
const state = {
  busy: false,
  currentJobId: null,
  lastPollAt: null,
  lastPollOk: null,
  lastPollReason: null,
  lastRenderAt: null,
  lastRenderExit: null,
  consecutiveFailures: 0,
  totalClaimed: 0,
  totalSucceeded: 0,
  totalFailed: 0,
  bootPhase: "init",
  bootCompleted: false,
  crashReason: null,
  subsystems: {
    render: { enabled: true, healthy: true, lastError: null },
    pinterest: { enabled: !SAFE_MODE, healthy: true, disabledReason: SAFE_MODE ? "safe_mode" : null, lastError: null },
    cleanup: { enabled: !SAFE_MODE, healthy: true, disabledReason: SAFE_MODE ? "safe_mode" : null, lastError: null },
    audit: { enabled: !SAFE_MODE, healthy: true, disabledReason: SAFE_MODE ? "safe_mode" : null, lastError: null },
  },
  errors: [],
  lastHeartbeatAt: null,
  queueDepth: null,
};

if (HOST_MISMATCH) {
  state.crashReason = "fatal_wrong_supabase_host";
  state.subsystems.render.enabled = false;
  state.subsystems.render.healthy = false;
  state.subsystems.render.lastError = `wrong_host:${SUPABASE_HOST}`;
  state.errors.push({ ts: new Date().toISOString(), code: "wrong_supabase_host", host: SUPABASE_HOST, expected: EXPECTED_SUPABASE_HOST });
}

function setBootPhase(phase, extra = {}) {
  state.bootPhase = phase;
  log("info", "boot_phase", { phase, safeMode: SAFE_MODE, ...extra });
}

function disableSubsystem(name, err) {
  if (!state.subsystems[name]) return;
  state.subsystems[name].enabled = false;
  state.subsystems[name].healthy = false;
  state.subsystems[name].lastError = String(err?.message ?? err);
  state.subsystems[name].disabledReason = "runtime_error";
  log("warn", "subsystem disabled", { name, err: state.subsystems[name].lastError });
}

// ---------- fetch with timeout + retry ----------
async function fetchWithRetry(url, opts = {}, { timeoutMs = 15_000, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...opts, signal: ac.signal });
      clearTimeout(t);
      return r;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (attempt < retries) {
        const backoff = 500 * Math.pow(2, attempt);
        log("warn", "fetch retry", { url, attempt, backoff, err: String(e?.message ?? e) });
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

// ---------- supabase calls ----------
async function claimJob() {
  const r = await fetchWithRetry(
    `${SUPABASE_URL}/functions/v1/cinematic-ad-claim-job`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-render-secret": SECRET },
      body: JSON.stringify({ worker_id: WORKER_ID }),
    },
    { timeoutMs: CLAIM_TIMEOUT_MS, retries: 2 },
  );
  return r.json();
}

// Upserts a heartbeat row so the admin dashboard can determine worker liveness
// without depending on a public HTTP route (Render Background Workers have none).
async function writeHeartbeat({ claimed = false, jobId = null } = {}) {
  try {
    const nowIso = new Date().toISOString();
    const body = {
      worker_id: WORKER_ID,
      claimed,
      job_id: jobId,
      last_poll_at: nowIso,
      queue_depth: state.queueDepth,
      supabase_host: SUPABASE_HOST,
      safe_mode: SAFE_MODE,
      payload: {
        bootPhase: state.bootPhase,
        busy: state.busy,
        currentJobId: state.currentJobId,
        consecutiveFailures: state.consecutiveFailures,
      },
    };
    const r = await fetchWithRetry(
      `${SUPABASE_URL}/functions/v1/render-worker-heartbeat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-render-secret": SECRET,
        },
        body: JSON.stringify(body),
      },
      { timeoutMs: 5_000, retries: 1 },
    );
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      log("warn", "heartbeat function non-2xx", { status: r.status, body: txt.slice(0, 200) });
      return;
    }
    state.lastHeartbeatAt = nowIso;
  } catch (e) {
    log("warn", "heartbeat function failed", { err: String(e?.message ?? e) });
  }
}

async function pingSupabase() {
  try {
    const r = await fetchWithRetry(
      `${SUPABASE_URL}/functions/v1/render-worker-heartbeat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-render-secret": SECRET },
        body: JSON.stringify({ worker_id: WORKER_ID, supabase_host: SUPABASE_HOST, safe_mode: SAFE_MODE, payload: { bootPhase: "ping" } }),
      },
      { timeoutMs: 5_000, retries: 1 },
    );
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

// ---------- render subprocess ----------
function runRender(jobId) {
  return new Promise((res) => {
    const env = { ...process.env, JOB_ID: jobId, RENDER_WORKER_ID: WORKER_ID };
    // Use the same Node binary that's running the worker — Render images may not have `bun`,
    // and the previous `spawn("bun", ...)` caused immediate ENOENT (exit 128) on deploy.
    const p = spawn(process.execPath, [SCRIPT, `--job=${jobId}`], { env, stdio: "inherit" });
    let done = false;
    const finish = (code) => { if (done) return; done = true; res(code); };
    const killTimer = setTimeout(() => {
      log("error", "render timeout, killing", { jobId, ms: RENDER_TIMEOUT_MS });
      try { p.kill("SIGKILL"); } catch {}
      finish(124);
    }, RENDER_TIMEOUT_MS);
    p.on("exit", code => { clearTimeout(killTimer); finish(code ?? 1); });
    p.on("error", err => { clearTimeout(killTimer); log("error", "render spawn error", { err: String(err) }); finish(1); });
  });
}

// ---------- poll loop ----------
async function tick() {
  if (state.busy) return;
  if (HOST_MISMATCH) {
    log("warn", "tick skipped — supabase host mismatch", { supabaseHost: SUPABASE_HOST, expected: EXPECTED_SUPABASE_HOST });
    return;
  }
  state.busy = true;
  state.lastPollAt = new Date().toISOString();
  console.log(`[CINEMATIC WORKER] polling queue table=cinematic_ad_jobs filter=status='render_queued' host=${SUPABASE_HOST} workerId=${WORKER_ID} at=${state.lastPollAt}`);
  await writeHeartbeat({ claimed: false });
  try {
    const data = await claimJob();
    state.lastPollOk = !!data?.ok;
    state.lastPollReason = data?.reason ?? null;
    if (typeof data?.queued_count === "number") state.queueDepth = data.queued_count;
    console.log(`[CINEMATIC WORKER] claim response ok=${data?.ok} reason=${data?.reason ?? "-"} queued_count=${data?.queued_count ?? "?"} server_host=${data?.supabase_host ?? "?"} message=${data?.message ?? "-"}`);
    if (data?.supabase_host && data.supabase_host !== SUPABASE_HOST) {
      throw new Error(`backend mismatch: worker=${SUPABASE_HOST} claim_function=${data.supabase_host}`);
    }
    if (!data?.ok || !data.job) {
      console.log(`[CINEMATIC WORKER] found ${data?.queued_count ?? 0} queued jobs (claim returned no job) reason=${data?.reason ?? data?.message ?? "no jobs"}`);
      log("info", "poll idle", { reason: data?.reason ?? "no jobs" });
      state.consecutiveFailures = 0;
      return;
    }
    const jobId = data.job.job_id;
    state.currentJobId = jobId;
    state.totalClaimed++;
    console.log(`[CINEMATIC WORKER] found >=1 queued jobs`);
    console.log(`[CINEMATIC WORKER] claiming job ${jobId}`);
    console.log(`[CINEMATIC WORKER] claimed job ${jobId} status->rendering`);
    await writeHeartbeat({ claimed: true, jobId });
    log("info", "job claimed", { jobId, workerId: WORKER_ID });
    console.log(`[CINEMATIC WORKER] render started job=${jobId}`);
    const code = await runRender(jobId);
    state.lastRenderAt = new Date().toISOString();
    state.lastRenderExit = code;
    if (code === 0) {
      state.totalSucceeded++;
      state.consecutiveFailures = 0;
      console.log(`[CINEMATIC WORKER] render completed job=${jobId}`);
      console.log(`[CINEMATIC WORKER] upload completed job=${jobId}`);
      log("info", "job rendered ok", { jobId });
    } else {
      state.totalFailed++;
      state.consecutiveFailures++;
      log("error", "job render failed", { jobId, code, consecutiveFailures: state.consecutiveFailures });
    }
  } catch (e) {
    state.consecutiveFailures++;
    log("error", "poll error", { err: String(e?.message ?? e), consecutiveFailures: state.consecutiveFailures });
  } finally {
    state.currentJobId = null;
    state.busy = false;
    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      log("error", "too many consecutive failures — backing off, keeping process alive", { count: state.consecutiveFailures });
      // Do NOT exit; Render Web Service must keep serving /health.
      // Reset counter so polling resumes after a cool-down tick.
      state.consecutiveFailures = 0;
    }
  }
}

// ---------- optional health http server ----------
function startHealthServer() {
  const server = createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.url === "/health" || req.url === "/api/health") {
        return send(200, { ok: true, worker: true, timestamp: Date.now(), workerId: WORKER_ID, uptimeSec: Math.round((Date.now()-STARTED_AT)/1000) });
      }
      if (req.url === "/health/worker" || req.url === "/api/health/worker") {
        const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
        return send(200, {
          ok: !HOST_MISMATCH && state.consecutiveFailures < MAX_CONSECUTIVE_FAILURES,
          ready: state.bootCompleted && !HOST_MISMATCH,
          worker: true,
          timestamp: Date.now(),
          workerId: WORKER_ID,
          busy: state.busy,
          safeMode: SAFE_MODE,
          bootPhase: state.bootPhase,
          bootCompleted: state.bootCompleted,
          crashReason: state.crashReason,
          supabaseHost: SUPABASE_HOST,
          expectedSupabaseHost: EXPECTED_SUPABASE_HOST,
          lastHeartbeatAt: state.lastHeartbeatAt,
          queueDepth: state.queueDepth,
          activeJobs: state.busy ? 1 : 0,
          renderAvailable: state.subsystems.render.enabled && state.subsystems.render.healthy,
          pinterestPublishAvailable: state.subsystems.pinterest.enabled && state.subsystems.pinterest.healthy,
          errors: state.errors.slice(-10),
          subsystems: state.subsystems,
          memMb,
          uptimeSec: Math.round((Date.now()-STARTED_AT)/1000),
          currentJobId: state.currentJobId,
          lastPollAt: state.lastPollAt,
          lastPollOk: state.lastPollOk,
          lastPollReason: state.lastPollReason,
          lastRenderAt: state.lastRenderAt,
          lastRenderExit: state.lastRenderExit,
          consecutiveFailures: state.consecutiveFailures,
          totals: { claimed: state.totalClaimed, succeeded: state.totalSucceeded, failed: state.totalFailed },
        });
      }
      if (req.url === "/health/supabase" || req.url === "/api/health/supabase") {
        const r = await pingSupabase();
        return send(r.ok ? 200 : 503, { ...r, supabaseUrl: SUPABASE_URL });
      }
      if (req.url === "/debug/runtime" || req.url === "/api/debug/runtime") {
        return send(200, {
          node: process.version,
          pid: process.pid,
          startedAt: new Date(STARTED_AT).toISOString(),
          uptimeSec: Math.round((Date.now()-STARTED_AT)/1000),
          pollIntervalMs: POLL,
          workerId: WORKER_ID,
          envPresent: REQUIRED.reduce((a,k)=>(a[k]=!!process.env[k],a),{}),
          backendAuth: {
            mode: "edge_function_shared_secret",
            serviceRoleRequired: false,
            urlRef: URL_REF,
          },
          state,
        });
      }
      send(404, { ok: false, error: "not found" });
    } catch (e) {
      send(500, { ok: false, error: String(e?.message ?? e) });
    }
  });
  server.keepAliveTimeout = 61_000;
  server.headersTimeout = 62_000;
  server.listen(PORT, "0.0.0.0", () => log("info", "health server listening", { port: PORT }));
}

// ---------- shutdown ----------
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { log("info", "shutdown", { sig }); process.exit(0); });
}
process.on("unhandledRejection", (e) => log("error", "unhandledRejection", { err: String(e) }));
process.on("uncaughtException", (e) => log("error", "uncaughtException", { err: String(e?.message ?? e) }));

// ---------- main ----------
async function main() {
  console.log("[CINEMATIC WORKER] started from render-worker/start.mjs");
  console.log("[CINEMATIC WORKER] started");
  console.log(`[CINEMATIC WORKER] config host=${SUPABASE_HOST} pollMs=${POLL} workerId=${WORKER_ID} safeMode=${SAFE_MODE}`);
  console.log(`[CINEMATIC WORKER] env: SUPABASE_URL set=${!!SUPABASE_URL} RENDER_WORKER_SECRET set=${!!SECRET}`);
  console.log(`[CINEMATIC WORKER] secret fingerprint ${JSON.stringify(SECRET_FINGERPRINT)}`);
  setBootPhase("env_validated", { node: process.version, memMb: Math.round(process.memoryUsage().rss/1024/1024) });
  log("info", "worker starting", { workerId: WORKER_ID, pollMs: POLL, port: PORT, once: ONCE, safeMode: SAFE_MODE, maxRetries: MAX_RETRIES });
  // Hard startup-timeout guard
  const startupTimer = setTimeout(() => {
    state.crashReason = "startup_timeout";
    log("error", "startup timeout — forcing exit so platform restarts", { ms: STARTUP_TIMEOUT_MS });
    process.exit(1);
  }, STARTUP_TIMEOUT_MS);
  setBootPhase("starting_health_server");
  startHealthServer();
  console.log(`[worker-health] HTTP server bound on port ${PORT}`);
  setBootPhase("pinging_supabase");
  const ping = await pingSupabase().catch(e => ({ ok: false, error: String(e?.message ?? e) }));
  setBootPhase("supabase_checked", { ok: ping.ok, status: ping.status ?? null });
  if (!ping.ok) {
    state.subsystems.render.healthy = false;
    state.subsystems.render.lastError = `supabase_unreachable: ${ping.error ?? ping.status}`;
    log("warn", "supabase unreachable at boot — entering degraded mode (will retry on poll)", ping);
  }
  setBootPhase("ready");
  state.bootCompleted = true;
  clearTimeout(startupTimer);
  if (!ONCE) {
    setInterval(() => {
      log("info", "heartbeat", {
        workerId: WORKER_ID,
        uptimeSec: Math.round((Date.now()-STARTED_AT)/1000),
        safeMode: SAFE_MODE,
        busy: state.busy,
        currentJobId: state.currentJobId,
        lastPollAt: state.lastPollAt,
        lastPollOk: state.lastPollOk,
        lastPollReason: state.lastPollReason,
        memMb: Math.round(process.memoryUsage().rss/1024/1024),
        totals: { claimed: state.totalClaimed, succeeded: state.totalSucceeded, failed: state.totalFailed },
        consecutiveFailures: state.consecutiveFailures,
      });
    }, HEARTBEAT_MS);
  }
  await tick();
  if (ONCE) { log("info", "once mode complete"); return; }
  setInterval(tick, POLL);
}
main().catch(async (e) => {
  state.crashReason = String(e?.message ?? e);
  log("fatal", "main crashed", { err: state.crashReason });
  try {
    const fs = await import("node:fs/promises");
    await fs.writeFile("/tmp/worker-fatal.json", JSON.stringify({
      ts: new Date().toISOString(), reason: state.crashReason, bootPhase: state.bootPhase,
    }, null, 2));
  } catch {}
  // Anti crash-loop: sleep 30s before exit so Render doesn't fast-restart.
  await new Promise(r => setTimeout(r, 30_000));
  process.exit(1);
});
