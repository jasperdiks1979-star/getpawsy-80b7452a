import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500; // 500ms, 1000ms, 2000ms

function traceId() {
  return crypto.randomUUID();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type SupaClient = ReturnType<typeof createClient>;

interface AttemptResult {
  ok: boolean;
  remaining: number;
  syncedOk: number;
  syncedError: number;
  isComplete: boolean;
  notified: boolean;
  runId: string | null;
  totalInitial: number;
  noActiveRun?: boolean;
}

async function logAttempt(
  supabase: SupaClient,
  params: {
    runId: string | null;
    trace: string;
    attemptNumber: number;
    status: "success" | "error" | "retrying";
    errorMessage?: string;
    errorStack?: string;
    durationMs: number;
    remaining?: number;
    syncedOk?: number;
    syncedError?: number;
  },
) {
  try {
    await supabase.from("stock_refresh_monitor_attempts").insert({
      run_id: params.runId,
      trace_id: params.trace,
      attempt_number: params.attemptNumber,
      status: params.status,
      error_message: params.errorMessage ?? null,
      error_stack: params.errorStack ?? null,
      duration_ms: params.durationMs,
      remaining: params.remaining ?? null,
      synced_ok: params.syncedOk ?? null,
      synced_error: params.syncedError ?? null,
    });
  } catch (logErr) {
    console.error("[stock-refresh-monitor] failed to log attempt", logErr);
  }
}

async function runMonitorOnce(supabase: SupaClient): Promise<AttemptResult> {
  // 1. Get the most recent active run (not completed)
  const { data: run, error: runErr } = await supabase
    .from("stock_refresh_runs")
    .select("*")
    .is("completed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runErr) throw runErr;
  if (!run) {
    return {
      ok: true,
      remaining: 0,
      syncedOk: 0,
      syncedError: 0,
      isComplete: false,
      notified: false,
      runId: null,
      totalInitial: 0,
      noActiveRun: true,
    };
  }

  // 2. Count remaining pending_refresh products
  const { count: remaining, error: countErr } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("stock_sync_status", "pending_refresh")
    .eq("is_duplicate", false);
  if (countErr) throw countErr;

  // 3. Count synced ok / error since run start
  const { count: syncedOk, error: okErr } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("stock_sync_status", "ok")
    .gte("last_stock_sync_at", run.started_at);
  if (okErr) throw okErr;

  const { count: syncedError, error: errCountErr } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("stock_sync_status", "error")
    .gte("last_stock_sync_at", run.started_at);
  if (errCountErr) throw errCountErr;

  const isComplete = (remaining ?? 0) === 0;
  const update: Record<string, unknown> = {
    remaining: remaining ?? 0,
    synced_ok: syncedOk ?? 0,
    synced_error: syncedError ?? 0,
    last_checked_at: new Date().toISOString(),
  };
  if (isComplete && !run.completed_at) {
    update.completed_at = new Date().toISOString();
  }

  const { error: updErr } = await supabase
    .from("stock_refresh_runs")
    .update(update)
    .eq("id", run.id);
  if (updErr) throw updErr;

  // 4. Send notification once when complete (failures here are non-fatal)
  let notified = false;
  if (isComplete && !run.notified_complete_at) {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://getpawsy.pet";
    const notifyEmail = Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? "support@getpawsy.pet";

    if (RESEND_API_KEY) {
      try {
        const durationMs = Date.now() - new Date(run.started_at).getTime();
        const hours = Math.floor(durationMs / 3_600_000);
        const minutes = Math.floor((durationMs % 3_600_000) / 60_000);
        const html = `
          <h2>Stock refresh complete ✅</h2>
          <p>The bulk reactivation stock sync has finished.</p>
          <ul>
            <li><strong>Initial queue:</strong> ${run.total_initial}</li>
            <li><strong>Synced OK:</strong> ${syncedOk ?? 0}</li>
            <li><strong>Errors:</strong> ${syncedError ?? 0}</li>
            <li><strong>Duration:</strong> ${hours}h ${minutes}m</li>
          </ul>
          <p><a href="${APP_BASE_URL}/admin/stock-refresh-monitor">View dashboard</a></p>
        `;
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "GetPawsy Monitor <noreply@getpawsy.pet>",
            to: [notifyEmail],
            subject: `[GetPawsy] Stock refresh complete — ${run.total_initial} products synced`,
            html,
          }),
        });
        if (resp.ok) {
          notified = true;
          await supabase
            .from("stock_refresh_runs")
            .update({ notified_complete_at: new Date().toISOString() })
            .eq("id", run.id);
        } else {
          console.error("Resend failed:", await resp.text());
        }
      } catch (err) {
        console.error("Notify error:", err);
      }
    } else {
      await supabase
        .from("stock_refresh_runs")
        .update({ notified_complete_at: new Date().toISOString() })
        .eq("id", run.id);
      notified = true;
    }
  }

  return {
    ok: true,
    remaining: remaining ?? 0,
    syncedOk: syncedOk ?? 0,
    syncedError: syncedError ?? 0,
    isComplete,
    notified,
    runId: run.id,
    totalInitial: run.total_initial,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const trace = traceId();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let lastError: { message: string; stack?: string } | null = null;
  let lastRunId: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    try {
      const result = await runMonitorOnce(supabase);
      const durationMs = Date.now() - startedAt;
      lastRunId = result.runId;

      if (result.noActiveRun) {
        await logAttempt(supabase, {
          runId: null,
          trace,
          attemptNumber: attempt,
          status: "success",
          durationMs,
        });
        return new Response(
          JSON.stringify({
            ok: true,
            traceId: trace,
            attempts: attempt,
            message: "No active refresh run",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await logAttempt(supabase, {
        runId: result.runId,
        trace,
        attemptNumber: attempt,
        status: "success",
        durationMs,
        remaining: result.remaining,
        syncedOk: result.syncedOk,
        syncedError: result.syncedError,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          traceId: trace,
          attempts: attempt,
          run_id: result.runId,
          total_initial: result.totalInitial,
          remaining: result.remaining,
          synced_ok: result.syncedOk,
          synced_error: result.syncedError,
          is_complete: result.isComplete,
          notified: result.notified,
          message: result.isComplete
            ? "Refresh complete"
            : `${result.remaining} products still pending`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      const message = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      lastError = { message, stack };
      const willRetry = attempt < MAX_ATTEMPTS;
      console.error(
        `[stock-refresh-monitor] attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        message,
      );

      await logAttempt(supabase, {
        runId: lastRunId,
        trace,
        attemptNumber: attempt,
        status: willRetry ? "retrying" : "error",
        errorMessage: message,
        errorStack: stack,
        durationMs,
      });

      if (willRetry) {
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: false,
      traceId: trace,
      attempts: MAX_ATTEMPTS,
      message: lastError?.message ?? "Unknown error after retries",
    }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});