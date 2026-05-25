// cinematic-job-verify — admin-only Pinterest remote verification for
// cinematic_ad_jobs. Updates verified_at, remote_exists, and corrects status
// when a "Pinterest Uploaded" job has no live pin.
//
// POST body: { job_id?: string, job_ids?: string[], limit?: number = 50 }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PINTEREST_API = "https://api.pinterest.com/v5";

type Outcome = "verified" | "not_found" | "inaccessible" | "no_pin_id";

// Transient statuses we retry with exponential backoff. 429 is Pinterest's
// documented rate-limit signal; 5xx covers upstream blips. Everything else
// (200/404/410/401/403) is terminal and short-circuits.
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4; // 1 try + 3 retries
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

function backoffDelay(attempt: number, retryAfterHeader: string | null): number {
  // Honor `Retry-After` (seconds, per RFC 7231) if Pinterest sends it.
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, MAX_DELAY_MS);
  }
  // Exponential with full jitter: rand(0, min(cap, base * 2^attempt)).
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.floor(Math.random() * exp);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function checkPin(
  token: string,
  pinId: string,
): Promise<{ outcome: Outcome; pin_url?: string; error?: string; attempts?: number }> {
  let lastError = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const r = await fetch(`${PINTEREST_API}/pins/${pinId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 404 || r.status === 410) return { outcome: "not_found", attempts: attempt + 1 };
      if (r.status === 200) {
        const b = await r.json().catch(() => ({} as any));
        if (!b?.id || !b?.board_id) return { outcome: "not_found", attempts: attempt + 1 };
        const pin_url = b?.link || `https://www.pinterest.com/pin/${pinId}/`;
        return { outcome: "verified", pin_url, attempts: attempt + 1 };
      }
      const txt = await r.text().catch(() => "");
      lastError = `${r.status}:${txt.slice(0, 120)}`;
      if (!TRANSIENT_STATUSES.has(r.status) || attempt === MAX_ATTEMPTS - 1) {
        return { outcome: "inaccessible", error: lastError, attempts: attempt + 1 };
      }
      await sleep(backoffDelay(attempt, r.headers.get("retry-after")));
    } catch (e) {
      // Network-level failures (DNS, TLS, abort) — always retryable.
      lastError = (e as Error).message;
      if (attempt === MAX_ATTEMPTS - 1) {
        return { outcome: "inaccessible", error: lastError, attempts: attempt + 1 };
      }
      await sleep(backoffDelay(attempt, null));
    }
  }
  return { outcome: "inaccessible", error: lastError, attempts: MAX_ATTEMPTS };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const uid = claims?.claims?.sub;
  if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
  const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ ok: false, message: "admin only" }, 403);

  const body: any = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 200);
  // dryRun=true → check remote state and return the would-be corrections without writing.
  const dryRun = body?.dryRun === true || body?.dry_run === true;

  let q = sb.from("cinematic_ad_jobs")
    .select("id, status, pinterest_pin_id, pinterest_pin_url, archived_at")
    .is("archived_at", null);
  if (body?.job_id) q = q.eq("id", body.job_id);
  else if (Array.isArray(body?.job_ids) && body.job_ids.length) q = q.in("id", body.job_ids);
  else q = q.eq("status", "pinterest_uploaded").limit(limit);

  const { data: jobs, error } = await q;
  if (error) return json({ ok: false, message: error.message }, 500);
  if (!jobs?.length) return json({ ok: true, checked: 0, results: [], run_id: null });

  // Active Pinterest connection
  const { data: settings } = await sb.from("pinterest_runtime_settings").select("active_pinterest_connection_id").eq("id", 1).maybeSingle();
  let connQ = sb.from("pinterest_connection").select("*").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) connQ = connQ.eq("id", settings.active_pinterest_connection_id);
  const { data: conn } = await connQ.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const token = conn?.access_token as string | undefined;

  const nowIso = new Date().toISOString();
  const results: any[] = [];

  // Persist a run header for non-dryRun executions so admins can browse
  // history. dryRun previews stay ephemeral by design.
  let runId: string | null = null;
  if (!dryRun) {
    const { data: runRow } = await sb
      .from("pinterest_verification_runs")
      .insert({
        started_at: nowIso,
        dry_run: false,
        triggered_by: uid,
        notes: body?.job_id
          ? `single:${body.job_id}`
          : Array.isArray(body?.job_ids) && body.job_ids.length
          ? `ids:${body.job_ids.length}`
          : `batch:${limit}`,
      })
      .select("id")
      .maybeSingle();
    runId = runRow?.id ?? null;
  }

  for (const j of jobs) {
    if (!j.pinterest_pin_id) {
      const newStatus = j.status === "pinterest_uploaded" ? "publish_failed" : j.status;
      const wouldCorrect = newStatus !== j.status;
      if (!dryRun) {
        await sb.from("cinematic_ad_jobs").update({ verified_at: nowIso, remote_exists: false, status: newStatus, publishable_reason: "no_pin_id" }).eq("id", j.id);
        await sb.from("pinterest_publish_verifications").insert({ job_id: j.id, pin_id: null, pin_url: null, remote_exists: false, error: "no_pin_id", run_id: runId });
      }
      results.push({ id: j.id, outcome: "no_pin_id", current_status: j.status, next_status: newStatus, would_correct: wouldCorrect });
      continue;
    }
    if (!token) {
      results.push({ id: j.id, outcome: "inaccessible", error: "pinterest_not_connected" });
      continue;
    }
    const r = await checkPin(token, j.pinterest_pin_id);
    const exists = r.outcome === "verified";
    const updates: Record<string, unknown> = {
      verified_at: nowIso,
      remote_exists: exists,
    };
    const prevStatus = j.status;
    if (exists) {
      updates.pinterest_pin_url = r.pin_url ?? j.pinterest_pin_url;
      updates.status = "pinterest_uploaded";
      updates.publishable_reason = null;
    } else if (r.outcome === "not_found") {
      // Truthful status correction
      if (j.status === "pinterest_uploaded") updates.status = "publish_failed";
      updates.publishable_reason = "remote_not_found";
    } else {
      updates.publishable_reason = "verification_inaccessible";
    }
    const nextStatus = (updates.status as string | undefined) ?? prevStatus;
    const wouldCorrect = nextStatus !== prevStatus;
    if (!dryRun) {
      await sb.from("cinematic_ad_jobs").update(updates).eq("id", j.id);
      await sb.from("pinterest_publish_verifications").insert({
        job_id: j.id,
        pin_id: j.pinterest_pin_id,
        pin_url: r.pin_url ?? j.pinterest_pin_url,
        remote_exists: exists,
        error: r.error ?? null,
        run_id: runId,
      });
    }
    results.push({ id: j.id, outcome: r.outcome, pin_url: r.pin_url, error: r.error, attempts: r.attempts, current_status: prevStatus, next_status: nextStatus, would_correct: wouldCorrect });
    await new Promise((rs) => setTimeout(rs, 80));
  }

  const corrections = results.filter((r) => r.would_correct).length;
  if (runId) {
    await sb
      .from("pinterest_verification_runs")
      .update({
        finished_at: new Date().toISOString(),
        checked: results.length,
        corrections,
      })
      .eq("id", runId);
  }
  return json({ ok: true, dryRun, run_id: runId, verified_at: nowIso, checked: results.length, corrections, results });
});