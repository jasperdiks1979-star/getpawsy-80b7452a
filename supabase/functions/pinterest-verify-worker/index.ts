// End-to-end verification worker. Reuses _shared/pinterest-verify.ts and the
// existing pinterest_pin_queue table. No new pipeline, no new schedulers
// beyond an extra pg_cron tick that calls this function.
//
// Modes:
//   default | "drain"   – process rows in verification_state='waiting_verification'
//                          (limit 25). Up to 3 attempts; on terminal failure
//                          create a Guardian incident and keep moving.
//   "sample"            – pick 5 random pins posted in last 7d and re-verify;
//                          flag drift (still visible? still correct?).
//   "report"            – persist a daily verification snapshot into
//                          pinterest_ops_snapshots.
//
// Call with body { mode } or query ?mode=…

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyPinFull, VERIFICATION_HEALTHY_MIN_SCORE } from "../_shared/pinterest-verify.ts";

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";
const MAX_ATTEMPTS = 3;

type Mode = "drain" | "sample" | "report";

async function loadAccessToken(sb: any): Promise<string | null> {
  const { data, error } = await sb
    .from("pinterest_connection")
    .select("access_token, token_expires_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.warn("[verify-worker] loadAccessToken", error.message);
  return data?.access_token ?? null;
}

async function triggerRecovery(
  sb: any,
  pin: any,
  failureReason: string,
): Promise<string | null> {
  // Lightweight recovery: pick the smallest action that matches the failure.
  try {
    if (failureReason === "token_unauthorized") {
      await sb.functions.invoke("pinterest-recovery-orchestrator", {
        body: { reason: "verify_worker_token_unauthorized", pin_id: pin.id },
      });
      return "token_refresh_requested";
    }
    if (failureReason === "pin_not_found_on_pinterest") {
      // Re-queue the pin for republish — keep image/copy, clear external IDs.
      await sb
        .from("pinterest_pin_queue")
        .update({
          status: "approved",
          posted_at: null,
          pinterest_pin_id: null,
          pin_external_id: null,
          external_url: null,
          publishing_started_at: null,
        })
        .eq("id", pin.id);
      return "re_queued_for_publish";
    }
    if (failureReason === "destination_url_match" || failureReason === "title_match" || failureReason === "description_match") {
      // Metadata drift — call the existing metadata repair function (no-op if
      // pin_edit scope unavailable; logged as 'blocked' rather than 'fixed').
      await sb.functions.invoke("pinterest-metadata-repair", {
        body: { action: "run", limit: 1, pin_queue_id: pin.id },
      });
      return "metadata_repair_requested";
    }
    if (failureReason === "preview_image_present") {
      await sb.functions.invoke("pinterest-pin-repair", {
        body: { pin_queue_id: pin.id, reason: "missing_preview_image" },
      });
      return "image_repair_requested";
    }
  } catch (e) {
    console.warn("[verify-worker] recovery invoke failed:", (e as Error).message);
  }
  return null;
}

async function persistResult(sb: any, pin: any, result: any, attempts: number, recovery: string | null) {
  await sb
    .from("pinterest_pin_queue")
    .update({
      verification_state: result.state,
      verification_score: result.score,
      verification_checks: result.checks,
      verification_attempts: attempts,
      verification_failure_reason: result.failureReason,
      last_verified_at: new Date().toISOString(),
      pin_verified: result.state === "verified_success",
      pin_verification_reason: result.state === "verified_success"
        ? (result.failureReason === "board_warning" ? "board_warning" : "verified_e2e")
        : result.failureReason,
      pin_verified_at: new Date().toISOString(),
    })
    .eq("id", pin.id);

  await sb.from("pinterest_post_logs").insert({
    pin_queue_id: pin.id,
    action: "verify_e2e",
    status: result.state === "verified_success" && result.failureReason !== "board_warning" ? "success" : "warning",
    error_message: result.failureReason,
    response_data: { score: result.score, attempts, recovery, checks: result.checks, payload: result.pinterestPayload },
  });
}

async function drain(sb: any, accessToken: string, limit: number) {
  const { data: pins } = await sb
    .from("pinterest_pin_queue")
    .select("id, pinterest_pin_id, pin_title, pin_description, pin_image_url, destination_link, final_resolved_url, board_id, board_name, verification_attempts")
    .eq("status", "posted")
    .in("verification_state", ["waiting_verification"])
    .not("pinterest_pin_id", "is", null)
    .order("posted_at", { ascending: true })
    .limit(limit);

  const out: any[] = [];
  for (const pin of pins || []) {
    const attempts = (pin.verification_attempts || 0) + 1;
    const result = await verifyPinFull(accessToken, PINTEREST_API_BASE, pin);
    let recovery: string | null = null;

    if (result.state !== "verified_success" && attempts < MAX_ATTEMPTS) {
      recovery = await triggerRecovery(sb, pin, result.failureReason || "unknown");
      await persistResult(sb, pin, { ...result, state: "waiting_verification" }, attempts, recovery);
      out.push({ pin_id: pin.id, state: "retry", attempts, score: result.score, recovery });
      continue;
    }

    if (result.state !== "verified_success" && attempts >= MAX_ATTEMPTS) {
      await persistResult(sb, pin, result, attempts, null);
      // Open one incident — Guardian dashboard already renders these.
      await sb.from("guardian_legacy_findings").insert({
        category: "pinterest_verification",
        severity: "warning",
        title: `Pin ${pin.id} verification failed after ${MAX_ATTEMPTS} attempts`,
        detail: { reason: result.failureReason, checks: result.checks, pin_id: pin.pinterest_pin_id },
        status: "open",
      }).then(() => {}, () => {});
      out.push({ pin_id: pin.id, state: "verification_failed", attempts, score: result.score });
      continue;
    }

    await persistResult(sb, pin, result, attempts, null);
    out.push({ pin_id: pin.id, state: "verified_success", attempts, score: result.score });
  }
  return out;
}

async function sampleLiveAccount(sb: any, accessToken: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data: candidates } = await sb
    .from("pinterest_pin_queue")
    .select("id, pinterest_pin_id, pin_title, pin_description, pin_image_url, destination_link, final_resolved_url, board_id, board_name")
    .eq("status", "posted")
    .gte("posted_at", sevenDaysAgo)
    .not("pinterest_pin_id", "is", null)
    .limit(100);

  const list = (candidates || []).sort(() => Math.random() - 0.5).slice(0, 5);
  const out: any[] = [];
  for (const pin of list) {
    const result = await verifyPinFull(accessToken, PINTEREST_API_BASE, pin);
    await sb.from("pinterest_post_logs").insert({
      pin_queue_id: pin.id,
      action: "verify_e2e_sample",
      status: result.state === "verified_success" ? "success" : "warning",
      error_message: result.failureReason,
      response_data: { score: result.score, checks: result.checks },
    });
    if (result.state !== "verified_success") {
      await triggerRecovery(sb, pin, result.failureReason || "unknown");
    }
    out.push({ pin_id: pin.id, state: result.state, score: result.score });
  }
  return out;
}

async function dailyReport(sb: any) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: rows } = await sb
    .from("pinterest_pin_queue")
    .select("verification_state, verification_score, verification_failure_reason, posted_at, last_verified_at")
    .gte("posted_at", since);

  const total = rows?.length || 0;
  const verified = rows?.filter((r: any) => r.verification_state === "verified_success").length || 0;
  const failed = rows?.filter((r: any) => r.verification_state === "verification_failed").length || 0;
  const waiting = rows?.filter((r: any) => r.verification_state === "waiting_verification").length || 0;
  const avgScore = total ? Math.round((rows!.reduce((a: number, r: any) => a + (r.verification_score || 0), 0) / total)) : null;
  const successRate = total ? verified / total : null;
  const topFailures = Object.entries(
    (rows || []).filter((r: any) => r.verification_failure_reason).reduce((acc: Record<string, number>, r: any) => {
      acc[r.verification_failure_reason] = (acc[r.verification_failure_reason] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const snapshot = {
    kind: "verification_daily",
    captured_at: new Date().toISOString(),
    payload: {
      total_published_24h: total,
      verified,
      failed,
      waiting,
      success_rate: successRate,
      avg_score: avgScore,
      healthy_min_score: VERIFICATION_HEALTHY_MIN_SCORE,
      top_failure_reasons: topFailures,
    },
  };

  await sb.from("pinterest_ops_snapshots").insert(snapshot);
  return snapshot.payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  let mode: Mode = (url.searchParams.get("mode") as Mode) || "drain";
  let limit = Number(url.searchParams.get("limit") || 25);
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.mode) mode = body.mode;
      if (body?.limit) limit = Number(body.limit);
    }
  } catch {/* ignore */}

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const accessToken = await loadAccessToken(sb);
  if (!accessToken) {
    return new Response(JSON.stringify({ ok: false, error: "pinterest_not_connected" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let result: any;
  if (mode === "report") {
    result = await dailyReport(sb);
  } else if (mode === "sample") {
    result = await sampleLiveAccount(sb, accessToken);
  } else {
    result = await drain(sb, accessToken, limit);
  }

  return new Response(JSON.stringify({ ok: true, mode, result }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});