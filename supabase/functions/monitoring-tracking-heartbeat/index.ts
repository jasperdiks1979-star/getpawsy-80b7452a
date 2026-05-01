import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE = "https://getpawsy.pet";

/**
 * Heartbeat / silence detector for tracking pipelines.
 *
 * For each watched table we check:
 *  - rows in the last `windowMin` minutes (current)
 *  - rows in the matching window 24h ago (baseline)
 *  - rows since the most recent row (silence gap)
 *
 * We open a P1 alert when:
 *  - silence gap exceeds `maxSilenceMin` (hard alert: tracking dead)
 *  - OR current < dropFloor AND drop vs baseline >= dropPct (soft alert: tracking degraded)
 *
 * The alert auto-resolves on the next run that finds healthy data.
 */

interface Watch {
  alertKey: string;
  table: "lp_funnel_events" | "visitor_activity";
  label: string;
  windowMin: number;
  maxSilenceMin: number;
  dropPct: number; // e.g. 70 means open alert when current is ≤30% of baseline
  dropFloor: number; // ignore drops when traffic is naturally tiny
  internalFilter?: boolean; // exclude internal traffic
}

const WATCHES: Watch[] = [
  {
    alertKey: "tracking_silence_lp_funnel_events",
    table: "lp_funnel_events",
    label: "lp_funnel_events (/go funnel)",
    windowMin: 60,
    maxSilenceMin: 90,
    dropPct: 70,
    dropFloor: 5,
    internalFilter: true,
  },
  {
    alertKey: "tracking_silence_visitor_activity",
    table: "visitor_activity",
    label: "visitor_activity (site-wide)",
    windowMin: 60,
    maxSilenceMin: 60,
    dropPct: 70,
    dropFloor: 20,
    internalFilter: true,
  },
];

async function countSince(
  supabase: ReturnType<typeof createClient>,
  table: string,
  fromIso: string,
  toIso: string,
  excludeInternal: boolean
): Promise<number> {
  let q = supabase.from(table).select("id", { count: "exact", head: true })
    .gte("created_at", fromIso)
    .lt("created_at", toIso);
  if (excludeInternal) q = q.eq("is_internal", false);
  const { count, error } = await q;
  if (error) throw new Error(`${table} count error: ${error.message}`);
  return count ?? 0;
}

async function lastEventAt(
  supabase: ReturnType<typeof createClient>,
  table: string,
  excludeInternal: boolean
): Promise<Date | null> {
  let q = supabase.from(table).select("created_at").order("created_at", { ascending: false }).limit(1);
  if (excludeInternal) q = q.eq("is_internal", false);
  const { data, error } = await q;
  if (error) throw new Error(`${table} last error: ${error.message}`);
  if (!data || data.length === 0) return null;
  return new Date(data[0].created_at as string);
}

async function sendEmail(subject: string, html: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Monitoring <alerts@getpawsy.pet>",
        to: ["support@getpawsy.pet"],
        subject,
        html,
      }),
    });
  } catch (e) {
    console.error("[heartbeat] email send failed", e);
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  const startedAt = new Date();
  const t0 = performance.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const now = new Date();
  const results: Array<Record<string, unknown>> = [];
  const newAlerts: string[] = [];

  let persistError: string | null = null;

  async function persistRun(status: "success" | "error", errorMessage: string | null) {
    const finishedAt = new Date();
    const duration_ms = Math.round(performance.now() - t0);
    try {
      const { error: insertErr } = await supabase.from("monitoring_runs").insert({
        function_name: "monitoring-tracking-heartbeat",
        trace_id: traceId,
        run_type: "heartbeat",
        status,
        success: status === "success",
        duration_ms,
        watches_total: WATCHES.length,
        watches_unhealthy: results.filter((r) => r.unhealthy === true).length,
        checks_passed: results.filter((r) => r.unhealthy === false).length,
        checks_failed: results.filter((r) => r.unhealthy === true).length,
        new_alerts: newAlerts,
        results,
        details: { traceId, results, newAlerts, errorMessage },
        error_message: errorMessage,
        started_at: startedAt.toISOString(),
        completed_at: finishedAt.toISOString(),
      });
      if (insertErr) {
        persistError = insertErr.message;
        console.error("[heartbeat] persist error", insertErr);
      }
    } catch (e) {
      persistError = e instanceof Error ? e.message : String(e);
      console.error("[heartbeat] failed to persist monitoring_runs row", e);
    }
  }

  try {
    for (const w of WATCHES) {
      const fromCurrent = new Date(now.getTime() - w.windowMin * 60 * 1000);
      const fromBaseline = new Date(now.getTime() - (24 * 60 + w.windowMin) * 60 * 1000);
      const toBaseline = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [current, baseline, last] = await Promise.all([
        countSince(supabase, w.table, fromCurrent.toISOString(), now.toISOString(), !!w.internalFilter),
        countSince(supabase, w.table, fromBaseline.toISOString(), toBaseline.toISOString(), !!w.internalFilter),
        lastEventAt(supabase, w.table, !!w.internalFilter),
      ]);

      const silenceMin = last ? Math.round((now.getTime() - last.getTime()) / 60000) : Number.POSITIVE_INFINITY;
      const dropVsBaseline = baseline > 0 ? ((baseline - current) / baseline) * 100 : 0;

      const isSilence = silenceMin >= w.maxSilenceMin;
      const isDrop = current <= w.dropFloor && baseline >= w.dropFloor && dropVsBaseline >= w.dropPct;
      const unhealthy = isSilence || isDrop;

      const reason = isSilence
        ? `Geen events meer in ${w.table} sinds ${silenceMin} minuten (drempel ${w.maxSilenceMin}m).`
        : isDrop
          ? `Volume in laatste ${w.windowMin}m: ${current} (baseline 24h geleden: ${baseline}, daling ${dropVsBaseline.toFixed(0)}%).`
          : `Healthy: ${current} events in ${w.windowMin}m, last ${silenceMin}m geleden, baseline ${baseline}.`;

      results.push({
        watch: w.alertKey,
        table: w.table,
        current,
        baseline,
        silenceMin: Number.isFinite(silenceMin) ? silenceMin : null,
        dropVsBaseline: Number(dropVsBaseline.toFixed(1)),
        unhealthy,
        reason,
      });

      if (unhealthy) {
        newAlerts.push(w.alertKey);
        const description = `${w.label}: ${reason}`;
        // Upsert alert (active)
        const { data: existing } = await supabase
          .from("monitoring_alerts")
          .select("id, is_active, notification_sent, first_detected_at")
          .eq("alert_key", w.alertKey)
          .maybeSingle();

        const payload = {
          alert_key: w.alertKey,
          severity: "P1",
          category: "tracking",
          title: isSilence
            ? `Tracking silent: ${w.table}`
            : `Tracking volume drop: ${w.table}`,
          description,
          affected_urls: [`${SITE}/admin/utm-validation-log`, `${SITE}/admin/tiktok-realtime-funnel`],
          suggested_fix:
            "Check client analytics: src/lib/analytics.ts mirror, sessionStorage session_id, network tab voor Supabase RPC errors. Verify Founder Mode niet aan voor productie traffic.",
          last_detected_at: now.toISOString(),
          is_active: true,
        };

        await supabase.from("monitoring_alerts").upsert(payload, { onConflict: "alert_key" });

        // Send email only on first detection (or when alert was previously resolved)
        const shouldEmail = !existing || !existing.is_active || !existing.notification_sent;
        if (shouldEmail) {
          await sendEmail(
            `🚨 Tracking alert: ${w.table}`,
            `<div style="font-family: sans-serif; max-width:600px;">
              <h2 style="color:#dc2626;">🚨 Tracking pipeline alert</h2>
              <p><strong>${w.label}</strong></p>
              <p>${reason}</p>
              <ul>
                <li>Window: laatste ${w.windowMin} min</li>
                <li>Current: <strong>${current}</strong> events</li>
                <li>Baseline (24h ago, same window): ${baseline}</li>
                <li>Last event: ${last ? last.toISOString() : "nooit"}</li>
              </ul>
              <p>👉 <a href="${SITE}/admin/tiktok-realtime-funnel">Open admin funnel</a></p>
            </div>`
          );
          await supabase
            .from("monitoring_alerts")
            .update({ notification_sent: true })
            .eq("alert_key", w.alertKey);
        }
      } else {
        // Auto-resolve any prior alert
        await supabase
          .from("monitoring_alerts")
          .update({ is_active: false, resolved_at: now.toISOString(), notification_sent: false })
          .eq("alert_key", w.alertKey)
          .eq("is_active", true);
      }
    }

    await persistRun("success", null);

    return new Response(
      JSON.stringify({
        ok: persistError === null,
        traceId,
        message: `Heartbeat run complete (${newAlerts.length} active alerts)`,
        results,
        newAlerts,
        persistError,
      }),
      { status: persistError ? 500 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[heartbeat] error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    await persistRun("error", msg);
    return new Response(
      JSON.stringify({ ok: false, traceId, message: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});