// Cinematic V3 Auto Dispatcher
// Cron entry-point (every 15 min). Refills the queue when low, dispatches the
// top-priority pending product to cinematic-v3-start, retries failures up to
// max_retries, and runs emergency recovery if the pipeline has been idle.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Config = {
  enabled: boolean;
  min_queue_size: number;
  low_water_mark: number;
  max_retries: number;
  emergency_idle_minutes: number;
  last_dispatch_at: string | null;
  last_emergency_at: string | null;
};

async function logEvent(admin: any, row: {
  event_type: string;
  product_id?: string | null;
  product_slug?: string | null;
  job_id?: string | null;
  outcome?: string | null;
  details?: Record<string, unknown>;
}) {
  await admin.from("cinematic_v3_dispatch_log").insert({
    event_type: row.event_type,
    product_id: row.product_id ?? null,
    product_slug: row.product_slug ?? null,
    job_id: row.job_id ?? null,
    outcome: row.outcome ?? null,
    details: row.details ?? {},
  });
}

async function callRefill(admin: any, traceId: string) {
  // Inline refill via internal HTTP call so dashboard + cron share the same code path.
  const url = `${SUPABASE_URL}/functions/v1/cinematic-v3-queue-refill`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_FUNCTION_SECRET,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ traceId }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function dispatchOne(admin: any, traceId: string, config: Config) {
  // Pick the highest-priority pending row.
  const { data: pending, error: pendErr } = await admin
    .from("cinematic_v3_dispatch_queue")
    .select("id, product_id, product_slug, attempts, priority_reason, priority_score")
    .eq("status", "pending")
    .order("priority_score", { ascending: false })
    .order("enqueued_at", { ascending: true })
    .limit(1);
  if (pendErr) throw new Error(pendErr.message);
  if (!pending || pending.length === 0) return { dispatched: false, reason: "empty_queue" };

  const row = pending[0];
  const attempts = (row.attempts ?? 0) + 1;

  // Call cinematic-v3-start with internal-secret bypass.
  const startUrl = `${SUPABASE_URL}/functions/v1/cinematic-v3-start`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_FUNCTION_SECRET,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ product_slug: row.product_slug }),
  });
  const startBody: any = await startRes.json().catch(() => ({}));
  const ok = startRes.ok && startBody?.ok === true;
  const jobId = startBody?.jobId ?? null;

  if (ok) {
    await admin.from("cinematic_v3_dispatch_queue")
      .update({
        status: "dispatched",
        attempts,
        dispatched_at: new Date().toISOString(),
        last_job_id: jobId,
        last_error: null,
      })
      .eq("id", row.id);
    await admin.from("cinematic_v3_dispatch_config")
      .update({ last_dispatch_at: new Date().toISOString() })
      .eq("id", true);
    await logEvent(admin, {
      event_type: "dispatch",
      product_id: row.product_id,
      product_slug: row.product_slug,
      job_id: jobId,
      outcome: "ok",
      details: { attempts, priority_reason: row.priority_reason, priority_score: row.priority_score, traceId },
    });
    return { dispatched: true, product_slug: row.product_slug, jobId, attempts };
  }

  // Failure path: retry or skip.
  const errMsg = String(startBody?.message ?? `start_failed_${startRes.status}`).slice(0, 500);
  if (attempts >= config.max_retries) {
    await admin.from("cinematic_v3_dispatch_queue")
      .update({ status: "skipped", attempts, last_error: errMsg })
      .eq("id", row.id);
    await logEvent(admin, {
      event_type: "skip",
      product_id: row.product_id,
      product_slug: row.product_slug,
      outcome: "max_retries",
      details: { attempts, error: errMsg, traceId },
    });
    return { dispatched: false, reason: "skipped", product_slug: row.product_slug, error: errMsg };
  }
  await admin.from("cinematic_v3_dispatch_queue")
    .update({ status: "pending", attempts, last_error: errMsg })
    .eq("id", row.id);
  await logEvent(admin, {
    event_type: "retry",
    product_id: row.product_id,
    product_slug: row.product_slug,
    outcome: "retry",
    details: { attempts, error: errMsg, traceId },
  });
  return { dispatched: false, reason: "retry", product_slug: row.product_slug, error: errMsg, attempts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: configRow } = await admin
      .from("cinematic_v3_dispatch_config").select("*").eq("id", true).maybeSingle();
    const config: Config = configRow ?? {
      enabled: true, min_queue_size: 10, low_water_mark: 5, max_retries: 3,
      emergency_idle_minutes: 30, last_dispatch_at: null, last_emergency_at: null,
    };
    if (!config.enabled) {
      return json({ ok: true, traceId, skipped: "disabled" });
    }

    // Watchdog: refill if queue is under the low-water mark.
    const { count: pendingCount } = await admin
      .from("cinematic_v3_dispatch_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    let refillResult: any = null;
    if ((pendingCount ?? 0) < config.low_water_mark) {
      refillResult = await callRefill(admin, traceId);
      await logEvent(admin, {
        event_type: "watchdog",
        outcome: refillResult.ok ? "refilled" : "refill_failed",
        details: { pending_before: pendingCount, traceId, refill: refillResult.data },
      });
    }

    // Emergency: dispatcher silent for too long → force a dispatch.
    let emergency = false;
    if (config.last_dispatch_at) {
      const lastMs = new Date(config.last_dispatch_at).getTime();
      const idleMin = (Date.now() - lastMs) / 60000;
      if (idleMin >= config.emergency_idle_minutes) {
        emergency = true;
        await admin.from("cinematic_v3_dispatch_config")
          .update({ last_emergency_at: new Date().toISOString() })
          .eq("id", true);
        await logEvent(admin, {
          event_type: "emergency",
          outcome: "trigger",
          details: { idle_minutes: Math.round(idleMin), threshold: config.emergency_idle_minutes, traceId },
        });
      }
    }

    const result = await dispatchOne(admin, traceId, config);
    return json({ ok: true, traceId, pending_before: pendingCount, emergency, refill: refillResult?.data ?? null, result });
  } catch (err: any) {
    return json({ ok: false, traceId, message: String(err?.message ?? err) }, 500);
  }
});