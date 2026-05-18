// Cinematic Ads failure-alert monitor.
//
// Runs on a 5-minute cron (and on-demand). Detects:
//   - jobs stuck in render_queued past queued_threshold_minutes
//   - jobs stuck in rendering past rendering_threshold_minutes
//   - jobs that recently transitioned to render_failed / pinterest_failed
//   - cinematic-ad-* edge functions reporting persistent errors via job.error_message
//
// Each detection is deduped via a stable dedupe_key so the same incident is
// only alerted once. New alerts are persisted in cinematic_ad_alert_log and
// (if email infra exists) forwarded to the configured recipient via the
// send-transactional-email function. If email infra is not yet set up, alerts
// are still recorded for the admin dashboard.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type AlertType = "stuck_queued" | "stuck_rendering" | "render_failed" | "pinterest_failed" | "function_error";

interface CandidateAlert {
  alert_type: AlertType;
  severity: "warning" | "critical";
  job_id: string | null;
  function_name: string | null;
  summary: string;
  details: Record<string, unknown>;
  dedupe_key: string;
}

// Bucket timestamps to the hour so a single stuck job alerts at most once per
// hour. Failures use the job's updated_at minute so each new failure alerts.
function hourBucket(d = new Date()): string {
  return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

async function trySendEmail(
  sb: any,
  recipient: string,
  alert: CandidateAlert,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const { data, error } = await sb.functions.invoke("send-transactional-email", {
      body: {
        templateName: "cinematic-ad-alert",
        recipientEmail: recipient,
        idempotencyKey: `cinematic-alert-${alert.dedupe_key}`,
        templateData: {
          alertType: alert.alert_type,
          severity: alert.severity,
          summary: alert.summary,
          jobId: alert.job_id,
          functionName: alert.function_name,
          details: alert.details,
          dashboardUrl: "https://getpawsy.lovable.app/admin/cinematic-ads/dashboard",
        },
      },
    });
    if (error) return { sent: false, error: error.message || "invoke error" };
    if ((data as any)?.ok === false) return { sent: false, error: (data as any)?.reason || "send failed" };
    return { sent: true };
  } catch (e) {
    // send-transactional-email may not exist yet (email infra not provisioned).
    return { sent: false, error: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { data: settings } = await sb
      .from("cinematic_ad_alert_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (!settings || !settings.enabled) {
      return ok({ ok: true, traceId, skipped: "disabled", checked: 0, new_alerts: 0 });
    }

    const recipient = settings.recipient_email as string;
    const queuedMin = Number(settings.queued_threshold_minutes ?? 10);
    const renderingMin = Number(settings.rendering_threshold_minutes ?? 20);
    const lookbackMin = Number(settings.failure_lookback_minutes ?? 60);

    const nowIso = new Date().toISOString();
    const queuedCutoff = new Date(Date.now() - queuedMin * 60_000).toISOString();
    const renderingCutoff = new Date(Date.now() - renderingMin * 60_000).toISOString();
    const failureCutoff = new Date(Date.now() - lookbackMin * 60_000).toISOString();

    const candidates: CandidateAlert[] = [];

    // 1. stuck render_queued
    const { data: stuckQueued } = await sb
      .from("cinematic_ad_jobs")
      .select("id, product_slug, status, render_queued_at, created_at, render_attempts")
      .eq("status", "render_queued")
      .lt("render_queued_at", queuedCutoff);
    for (const j of stuckQueued || []) {
      const ageMin = Math.round((Date.now() - new Date(j.render_queued_at || j.created_at).getTime()) / 60_000);
      candidates.push({
        alert_type: "stuck_queued",
        severity: ageMin > queuedMin * 3 ? "critical" : "warning",
        job_id: j.id,
        function_name: "cinematic-ad-claim-job",
        summary: `Job ${j.product_slug} stuck in render_queued for ${ageMin}m (threshold ${queuedMin}m)`,
        details: { product_slug: j.product_slug, age_minutes: ageMin, render_attempts: j.render_attempts },
        dedupe_key: `stuck_queued:${j.id}:${hourBucket()}`,
      });
    }

    // 2. stuck rendering
    const { data: stuckRendering } = await sb
      .from("cinematic_ad_jobs")
      .select("id, product_slug, status, render_started_at, render_queued_at, render_worker_id, render_attempts")
      .eq("status", "rendering")
      .lt("render_started_at", renderingCutoff);
    for (const j of stuckRendering || []) {
      const ageMin = Math.round((Date.now() - new Date(j.render_started_at || j.render_queued_at).getTime()) / 60_000);
      candidates.push({
        alert_type: "stuck_rendering",
        severity: ageMin > renderingMin * 2 ? "critical" : "warning",
        job_id: j.id,
        function_name: "cinematic-ad-render-webhook",
        summary: `Job ${j.product_slug} stuck in rendering for ${ageMin}m (threshold ${renderingMin}m) on worker ${j.render_worker_id ?? "?"}`,
        details: { product_slug: j.product_slug, age_minutes: ageMin, worker: j.render_worker_id, render_attempts: j.render_attempts },
        dedupe_key: `stuck_rendering:${j.id}:${hourBucket()}`,
      });
    }

    // 3. recent render_failed
    const { data: failed } = await sb
      .from("cinematic_ad_jobs")
      .select("id, product_slug, status, error_message, updated_at, render_attempts")
      .eq("status", "render_failed")
      .gt("updated_at", failureCutoff);
    for (const j of failed || []) {
      candidates.push({
        alert_type: "render_failed",
        severity: "critical",
        job_id: j.id,
        function_name: "cinematic-ad-fail-job",
        summary: `Render failed for ${j.product_slug}: ${j.error_message || "(no message)"}`,
        details: { product_slug: j.product_slug, error_message: j.error_message, render_attempts: j.render_attempts },
        dedupe_key: `render_failed:${j.id}:${(j.updated_at || nowIso).slice(0, 16)}`,
      });
    }

    // 4. recent pinterest publish failures
    const { data: pinFailed } = await sb
      .from("cinematic_ad_jobs")
      .select("id, product_slug, pinterest_publish_error, last_pinterest_attempt_at, pinterest_publish_attempts")
      .not("pinterest_publish_error", "is", null)
      .gt("last_pinterest_attempt_at", failureCutoff);
    for (const j of pinFailed || []) {
      candidates.push({
        alert_type: "pinterest_failed",
        severity: "warning",
        job_id: j.id,
        function_name: "pinterest-video-publisher",
        summary: `Pinterest publish failed for ${j.product_slug}: ${j.pinterest_publish_error}`,
        details: { product_slug: j.product_slug, error: j.pinterest_publish_error, attempts: j.pinterest_publish_attempts },
        dedupe_key: `pinterest_failed:${j.id}:${(j.last_pinterest_attempt_at || nowIso).slice(0, 16)}`,
      });
    }

    // Insert + dedupe + (try to) email each
    let newAlerts = 0;
    let sentCount = 0;
    const sendErrors: string[] = [];

    for (const c of candidates) {
      const emailResult = await trySendEmail(sb, recipient, c);
      const { data, error } = await sb
        .from("cinematic_ad_alert_log")
        .insert({
          alert_type: c.alert_type,
          severity: c.severity,
          job_id: c.job_id,
          function_name: c.function_name,
          summary: c.summary,
          details: c.details,
          dedupe_key: c.dedupe_key,
          email_sent: emailResult.sent,
          email_error: emailResult.error ?? null,
        })
        .select("id")
        .maybeSingle();
      // unique-violation = already alerted, that's fine
      if (error && error.code !== "23505") {
        console.warn(`[alert-monitor ${traceId}] insert failed`, error.message);
        continue;
      }
      if (data) {
        newAlerts++;
        if (emailResult.sent) sentCount++;
        else if (emailResult.error) sendErrors.push(emailResult.error);
      }
    }

    console.log(`[alert-monitor ${traceId}] candidates=${candidates.length} new=${newAlerts} sent=${sentCount}`);
    return ok({
      ok: true,
      traceId,
      candidates_examined: candidates.length,
      new_alerts: newAlerts,
      emails_sent: sentCount,
      send_errors: sendErrors.slice(0, 5),
      recipient,
      thresholds: { queued_minutes: queuedMin, rendering_minutes: renderingMin, failure_lookback_minutes: lookbackMin },
    });
  } catch (e) {
    console.error(`[alert-monitor ${traceId}] fatal`, e);
    return ok({ ok: false, traceId, code: "UNEXPECTED_ERROR", message: (e as Error).message });
  }
});