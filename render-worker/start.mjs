#!/usr/bin/env node
/**
 * GetPawsy cinematic render worker.
 * Polls Supabase every 2 minutes for render_queued jobs.
 * Renders one at a time, retries handled server-side (max 2).
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RENDER_WORKER_SECRET
 *
 * Optional env:
 *   POLL_INTERVAL_MS (default 120000)
 *   RENDER_WORKER_ID
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "..", "remotion", "scripts", "render-cinematic-ad.mjs");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET = process.env.RENDER_WORKER_SECRET;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL = Number(process.env.POLL_INTERVAL_MS || 120_000);
const WORKER_ID = process.env.RENDER_WORKER_ID || `worker-${Math.random().toString(36).slice(2, 8)}`;
const ONCE = process.argv.includes("--once");

if (!SUPABASE_URL || !SECRET || !SERVICE_KEY) {
  console.error("Missing env: SUPABASE_URL, RENDER_WORKER_SECRET, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

let busy = false;

async function fetchNext() {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-claim-job`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-render-secret": SECRET },
    body: JSON.stringify({ worker_id: WORKER_ID }),
  });
  return r.json();
}

function runRender(jobId) {
  return new Promise((res) => {
    const env = { ...process.env, JOB_ID: jobId, RENDER_WORKER_ID: WORKER_ID };
    const p = spawn("bun", [SCRIPT, `--job=${jobId}`], { env, stdio: "inherit" });
    p.on("exit", code => res(code ?? 1));
    p.on("error", err => { console.error(err); res(1); });
  });
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const data = await fetchNext();
    if (!data?.ok || !data.job) {
      console.log(`[poll] idle (${data?.reason ?? "no jobs"})`);
      return;
    }
    const jobId = data.job.job_id;
    console.log(`[poll] claimed job ${jobId}`);
    // claim already set rendering; re-running render script will re-claim same id (allowed)
    await runRender(jobId);
  } catch (e) {
    console.error("[poll] error", e);
  } finally {
    busy = false;
  }
}

async function main() {
  console.log(`[worker] starting ${WORKER_ID}, poll=${POLL}ms`);
  await tick();
  if (ONCE) return;
  setInterval(tick, POLL);
}
main();