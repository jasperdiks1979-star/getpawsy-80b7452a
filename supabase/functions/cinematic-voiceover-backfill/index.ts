// cinematic-voiceover-backfill
// ---------------------------------------------------------------------------
// Backfills voice-overs for cinematic_ad_jobs that are missing them, with:
//   • Circuit breaker on ElevenLabs key state. If the active key (identified
//     by SHA-256 fingerprint) is known-invalid we abort immediately and DO
//     NOT spend any ElevenLabs quota. The breaker auto-resets when the key
//     fingerprint changes (operator rotated the secret).
//   • Per-job exponential backoff retry for transient failures (HTTP 429,
//     5xx, network). Retries: 1s, 2s, 4s, 8s (configurable, max 4).
//   • Hard stop the moment we see a 401 from ElevenLabs — flip the breaker
//     to "invalid" so subsequent invocations skip immediately.
//
// Input (all optional):
//   { limit?: number, job_ids?: string[], force?: boolean }
// Output:
//   { ok, traceId, state, processed, succeeded, failed, skipped, results }
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_ATTEMPTS = 4;            // total tries per job
const BASE_DELAY_MS = 1000;        // 1s, 2s, 4s, 8s
const MAX_DELAY_MS = 15_000;

const j = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const trace = () => `vobf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getKey(): string {
  return (Deno.env.get("ELEVENLABS_API_KEY") ?? "").trim().replace(/^['"]|['"]$/g, "");
}

async function fingerprint(key: string): Promise<string> {
  if (!key) return "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pingElevenLabs(key: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body: body.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, body: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  let body: { limit?: number; job_ids?: string[]; force?: boolean } = {};
  try { body = await req.json(); } catch {}
  const limit = Math.max(1, Math.min(Number(body.limit ?? 25), 100));

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const key = getKey();
  if (!key) {
    return j(502, { ok: false, traceId, state: "no_key", message: "ELEVENLABS_API_KEY not configured" });
  }
  const fp = await fingerprint(key);

  // 1. Load circuit-breaker state
  const { data: prevState } = await admin
    .from("cinematic_voiceover_key_state")
    .select("key_fingerprint, state, consecutive_failures, last_error, last_checked_at")
    .eq("id", true)
    .maybeSingle();

  const sameKey = prevState?.key_fingerprint === fp;

  // If the same key is already known-invalid and caller didn't force, skip everything.
  if (!body.force && sameKey && prevState?.state === "invalid") {
    return j(409, {
      ok: false,
      traceId,
      state: "circuit_open",
      key_fingerprint: fp,
      last_error: prevState.last_error,
      last_checked_at: prevState.last_checked_at,
      message: "ElevenLabs key was previously rejected. Rotate the secret to reset the breaker (or pass force=true).",
    });
  }

  // 2. Live validate. If 401 → flip breaker, abort.
  const ping = await pingElevenLabs(key);
  if (!ping.ok) {
    const isAuth = ping.status === 401 || ping.status === 403;
    await admin.from("cinematic_voiceover_key_state").upsert({
      id: true,
      key_fingerprint: fp,
      state: isAuth ? "invalid" : (sameKey ? prevState?.state ?? "unknown" : "unknown"),
      last_error: `validate ${ping.status}: ${ping.body}`,
      last_checked_at: new Date().toISOString(),
      consecutive_failures: (prevState?.consecutive_failures ?? 0) + 1,
      updated_at: new Date().toISOString(),
    });
    return j(isAuth ? 401 : 502, {
      ok: false,
      traceId,
      state: isAuth ? "circuit_open" : "validate_failed",
      key_fingerprint: fp,
      http_status: ping.status,
      message: isAuth
        ? `ElevenLabs rejected the key (${ping.status}). Breaker tripped — rotate the secret to retry.`
        : `ElevenLabs /v1/user failed: ${ping.status}`,
    });
  }

  // 3. Validation passed → mark breaker healthy.
  await admin.from("cinematic_voiceover_key_state").upsert({
    id: true,
    key_fingerprint: fp,
    state: "ok",
    last_error: null,
    last_checked_at: new Date().toISOString(),
    consecutive_failures: 0,
    updated_at: new Date().toISOString(),
  });

  // 4. Pick jobs to backfill
  let jobQuery = admin
    .from("cinematic_ad_jobs")
    .select("id")
    .or("voiceover_url.is.null,vo_url.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (body.job_ids?.length) {
    jobQuery = admin
      .from("cinematic_ad_jobs")
      .select("id")
      .in("id", body.job_ids);
  }
  const { data: jobs = [], error: jobsErr } = await jobQuery;
  if (jobsErr) return j(500, { ok: false, traceId, message: jobsErr.message });

  const results: { job_id: string; ok: boolean; attempts: number; message: string; status?: number }[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  const voUrl = `${SUPABASE_URL}/functions/v1/cinematic-voiceover-generate`;

  for (const row of jobs ?? []) {
    const jobId = (row as { id: string }).id;
    let attempt = 0;
    let ok = false;
    let lastMsg = "";
    let lastStatus: number | undefined;
    let circuitTripped = false;

    while (attempt < MAX_ATTEMPTS && !ok) {
      attempt++;
      try {
        const res = await fetch(voUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ job_id: jobId }),
        });
        lastStatus = res.status;
        const txt = await res.text();
        let parsed: { ok?: boolean; message?: string } = {};
        try { parsed = JSON.parse(txt); } catch {}
        if (res.ok && parsed.ok) {
          ok = true;
          lastMsg = "ok";
          break;
        }
        lastMsg = parsed.message ?? txt.slice(0, 200);

        // Detect auth failure bubbling up from voiceover-generate → trip breaker.
        if (/elevenlabs-user 401|elevenlabs 401|invalid_api_key/i.test(lastMsg)) {
          circuitTripped = true;
          break;
        }
        // Non-retryable client errors (other than 429): stop trying this job.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          break;
        }
      } catch (e) {
        lastMsg = (e as Error).message;
      }
      if (attempt < MAX_ATTEMPTS) {
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
        const jitter = Math.floor(Math.random() * 300);
        await sleep(delay + jitter);
      }
    }

    results.push({ job_id: jobId, ok, attempts: attempt, message: lastMsg, status: lastStatus });
    if (ok) {
      succeeded++;
    } else {
      failed++;
      // Annotate the existing voiceover_error row (set by generate) with the
      // backfill attempt count + last status so operators see retry context.
      try {
        const { data: existing } = await admin
          .from("cinematic_ad_jobs")
          .select("voiceover_error")
          .eq("id", jobId)
          .maybeSingle();
        const prev = (existing?.voiceover_error ?? {}) as Record<string, unknown>;
        await admin.from("cinematic_ad_jobs").update({
          voiceover_error: {
            ...prev,
            backfill_attempts: attempt,
            backfill_last_status: lastStatus ?? null,
            backfill_last_message: lastMsg?.slice(0, 1000) ?? null,
            backfill_trace_id: traceId,
            backfill_at: new Date().toISOString(),
          },
          voiceover_last_attempt_at: new Date().toISOString(),
        }).eq("id", jobId);
      } catch (_) { /* swallow */ }
    }

    if (circuitTripped) {
      // Flip breaker and stop processing remaining jobs.
      const newConsecutive = (prevState?.consecutive_failures ?? 0) + 1;
      await admin.from("cinematic_voiceover_key_state").upsert({
        id: true,
        key_fingerprint: fp,
        state: "invalid",
        last_error: lastMsg,
        last_checked_at: new Date().toISOString(),
        consecutive_failures: newConsecutive,
        updated_at: new Date().toISOString(),
      });
      // Fire alert (alert function enforces threshold + cooldown).
      admin.functions.invoke("cinematic-voiceover-alert", {
        body: {
          key_fingerprint: fp,
          consecutive_failures: newConsecutive,
          source: "cinematic-voiceover-backfill",
          last_error: lastMsg,
        },
      }).catch(() => {});
      skipped = (jobs?.length ?? 0) - results.length;
      return j(200, {
        ok: false,
        traceId,
        state: "circuit_open",
        key_fingerprint: fp,
        processed: results.length,
        succeeded,
        failed,
        skipped,
        results,
        message: "ElevenLabs rejected the key mid-run — breaker tripped, remaining jobs skipped.",
      });
    }
  }

  return j(200, {
    ok: failed === 0,
    traceId,
    state: "ok",
    key_fingerprint: fp,
    processed: results.length,
    succeeded,
    failed,
    skipped,
    results,
    message: `Backfill complete: ${succeeded} ok, ${failed} failed.`,
  });
});