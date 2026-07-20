import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function secretFingerprint(secret: string) {
  if (!secret) {
    return {
      length: 0,
      sha256_prefix: null,
      has_leading_ws: false,
      has_trailing_ws: false,
      has_quotes: false,
    };
  }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return {
    length: secret.length,
    sha256_prefix: hex.slice(0, 12),
    has_leading_ws: /^\s/.test(secret),
    has_trailing_ws: /\s$/.test(secret),
    has_quotes: /^["'].*["']$/.test(secret),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);

  try {
    const secret = req.headers.get("x-render-secret") ?? "";
    console.log("[render-worker-heartbeat] secret fingerprint", {
      traceId,
      env_var: "RENDER_WORKER_SECRET",
      configured: await secretFingerprint(RENDER_WORKER_SECRET),
      incoming: await secretFingerprint(secret),
    });
    if (!RENDER_WORKER_SECRET || secret !== RENDER_WORKER_SECRET) {
      return json(401, { ok: false, traceId, message: "unauthorized" });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json(500, { ok: false, traceId, message: "backend secrets not configured" });
    }

    const body = await req.json().catch(() => ({}));
    const workerId = asString(body.worker_id, "anonymous").slice(0, 160);
    const nowIso = new Date().toISOString();
    const claimed = Boolean(body.claimed);
    const jobId = asString(body.job_id) || null;
    const queueDepth = Number.isFinite(Number(body.queue_depth)) ? Number(body.queue_depth) : null;
    const supabaseHost = asString(body.supabase_host, "unknown").slice(0, 255);
    const safeMode = typeof body.safe_mode === "boolean" ? body.safe_mode : null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const legacyPayload: Record<string, unknown> = {
      worker_id: workerId,
      last_poll_at: asString(body.last_poll_at, nowIso),
      updated_at: nowIso,
    };
    if (claimed) legacyPayload.last_claim_at = nowIso;
    if (jobId) legacyPayload.last_job_id = jobId;

    const modernPayload = {
      worker_id: workerId,
      last_seen_at: nowIso,
      queue_depth: queueDepth,
      supabase_host: supabaseHost,
      safe_mode: safeMode,
      payload: {
        ...(typeof body.payload === "object" && body.payload ? body.payload : {}),
        claimed,
        job_id: jobId,
        traceId,
      },
    };

    const [legacy, modern] = await Promise.all([
      admin.from("cinematic_worker_heartbeats").upsert(legacyPayload, { onConflict: "worker_id" }),
      admin.from("render_worker_heartbeats").upsert(modernPayload, { onConflict: "worker_id" }),
    ]);

    if (legacy.error || modern.error) {
      console.error("[render-worker-heartbeat] upsert failed", {
        traceId,
        legacy: legacy.error?.message ?? null,
        modern: modern.error?.message ?? null,
      });
      return json(500, {
        ok: false,
        traceId,
        message: legacy.error?.message ?? modern.error?.message ?? "heartbeat write failed",
      });
    }

    return json(200, { ok: true, traceId, worker_id: workerId, last_seen_at: nowIso });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[render-worker-heartbeat] fatal", { traceId, message });
    return json(500, { ok: false, traceId, message });
  }
});