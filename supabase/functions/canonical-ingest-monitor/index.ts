import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Monitors the canonical-ingest-recent cron. Alerts when the job goes stale
// (no run in >10 min) or when recent runs are failing.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: health, error } = await admin.rpc("canonical_ingest_health");
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const h = health as Record<string, unknown>;
  const status = String(h.status ?? "unknown");
  const alertKey = "canonical-ingest-recent-health";

  let severity: "info" | "warning" | "critical" = "info";
  let title = "";
  let description = "";

  if (status === "stale") {
    severity = "critical";
    title = "Canonical ingest cron is stale";
    description = `No run in ${Math.round(Number(h.minutes_since_last_run) || 0)} min. ` +
      `Near-real-time analytics are frozen. Last success ${h.last_success_at ?? "unknown"}.`;
  } else if (status === "failing") {
    severity = "critical";
    title = "Canonical ingest cron is failing";
    description = `${h.failures_1h} failures in the last hour. ` +
      `Last error: ${h.last_run_error ?? "unknown"}. Rows/1h=${h.rows_ingested_1h}.`;
  } else if (status === "unknown") {
    severity = "warning";
    title = "Canonical ingest cron has no run history";
    description = "No cron_job_logs entries for canonical-ingest-recent yet.";
  }

  const now = new Date().toISOString();

  if (severity === "info") {
    // Auto-resolve any active alert
    await admin
      .from("monitoring_alerts")
      .update({ is_active: false, resolved_at: now, updated_at: now })
      .eq("alert_key", alertKey)
      .eq("is_active", true);
  } else {
    const { data: existing } = await admin
      .from("monitoring_alerts")
      .select("id")
      .eq("alert_key", alertKey)
      .eq("is_active", true)
      .maybeSingle();

    if (existing?.id) {
      await admin
        .from("monitoring_alerts")
        .update({
          severity,
          title,
          description,
          last_detected_at: now,
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      await admin.from("monitoring_alerts").insert({
        alert_key: alertKey,
        severity,
        category: "cron_health",
        title,
        description,
        suggested_fix:
          "Check cron_job_logs for job_name='canonical-ingest-recent' and canonical_ingest_recent_logged errors.",
        first_detected_at: now,
        last_detected_at: now,
        is_active: true,
        notification_sent: false,
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, status, health: h }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
