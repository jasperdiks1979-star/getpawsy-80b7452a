#!/usr/bin/env node
/**
 * GetPawsy cinematic render worker — production-hardened.
 *
 * Required env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RENDER_WORKER_SECRET
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
const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RENDER_WORKER_SECRET"];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  log("fatal", "missing required env", { missing });
  process.exit(2);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "remotion", "scripts", "render-cinematic-ad.mjs");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET = process.env.RENDER_WORKER_SECRET;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL = Number(process.env.POLL_INTERVAL_MS || 5_000);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 30_000);
const WORKER_ID = process.env.RENDER_WORKER_ID || `worker-${Math.random().toString(36).slice(2, 8)}`;
const ONCE = process.argv.includes("--once");
const PORT = process.env.PORT ? Number(process.env.PORT) : null;
const MAX_CONSECUTIVE_FAILURES = Number(process.env.MAX_CONSECUTIVE_FAILURES || 5);
const CLAIM_TIMEOUT_MS = Number(process.env.CLAIM_TIMEOUT_MS || 15_000);
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS || 20 * 60 * 1000);

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
};

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

async function pingSupabase() {
  try {
    const r = await fetchWithRetry(
      `${SUPABASE_URL}/auth/v1/health`,
      { headers: { apikey: SERVICE_KEY } },
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
  state.busy = true;
  state.lastPollAt = new Date().toISOString();
  try {
    const data = await claimJob();
    state.lastPollOk = !!data?.ok;
    state.lastPollReason = data?.reason ?? null;
    if (!data?.ok || !data.job) {
      log("info", "poll idle", { reason: data?.reason ?? "no jobs" });
      state.consecutiveFailures = 0;
      return;
    }
    const jobId = data.job.job_id;
    state.currentJobId = jobId;
    state.totalClaimed++;
    log("info", "job claimed", { jobId, workerId: WORKER_ID });
    const code = await runRender(jobId);
    state.lastRenderAt = new Date().toISOString();
    state.lastRenderExit = code;
    if (code === 0) {
      state.totalSucceeded++;
      state.consecutiveFailures = 0;
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
      log("fatal", "too many consecutive failures, exiting for restart", { count: state.consecutiveFailures });
      process.exit(1);
    }
  }
}

// ---------- optional health http server ----------
function startHealthServer() {
  if (!PORT) return;
  const server = createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.url === "/health" || req.url === "/api/health") {
        return send(200, { ok: true, workerId: WORKER_ID, uptimeSec: Math.round((Date.now()-STARTED_AT)/1000) });
      }
      if (req.url === "/health/worker" || req.url === "/api/health/worker") {
        return send(200, {
          ok: state.consecutiveFailures < MAX_CONSECUTIVE_FAILURES,
          workerId: WORKER_ID,
          busy: state.busy,
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
          state,
        });
      }
      send(404, { ok: false, error: "not found" });
    } catch (e) {
      send(500, { ok: false, error: String(e?.message ?? e) });
    }
  });
  server.listen(PORT, () => log("info", "health server listening", { port: PORT }));
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
  console.log("[CINEMATIC WORKER] polling cinematic_ad_jobs every", POLL, "ms");
  log("info", "worker starting", { workerId: WORKER_ID, pollMs: POLL, port: PORT, once: ONCE });
  startHealthServer();
  if (!ONCE) {
    setInterval(() => {
      log("info", "heartbeat", {
        workerId: WORKER_ID,
        uptimeSec: Math.round((Date.now()-STARTED_AT)/1000),
        busy: state.busy,
        currentJobId: state.currentJobId,
        lastPollAt: state.lastPollAt,
        lastPollOk: state.lastPollOk,
        lastPollReason: state.lastPollReason,
        totals: { claimed: state.totalClaimed, succeeded: state.totalSucceeded, failed: state.totalFailed },
        consecutiveFailures: state.consecutiveFailures,
      });
    }, HEARTBEAT_MS);
  }
  await tick();
  if (ONCE) { log("info", "once mode complete"); return; }
  setInterval(tick, POLL);
}
main();
