import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * tracking-session-validator
 *
 * Validates that TikTok-tagged events are correctly correlated to a single session/visitor.
 * Anomalies detected (one row per session_id × anomaly_type):
 *
 *   - missing_utm_log         : visitor_activity row exists with TikTok signals but no row in utm_session_log
 *   - orphan_cart             : `cart` event for a session that never had a `browsing` event
 *   - orphan_checkout         : `checkout` event for a session that never had a `cart` event
 *   - session_id_mismatch     : same session_id has UTM log marked TikTok but later events show conflicting utm_source
 *   - multi_visitor_collision : same session_id used by 2+ distinct visitor_id values (sessions should be 1:1)
 *
 * Idempotent — safe to re-run; relies on UNIQUE(session_id, anomaly_type).
 */

function isTikTok(row: { utm_source?: string | null; referrer?: string | null }) {
  const s = (row.utm_source || "").toLowerCase();
  const r = (row.referrer || "").toLowerCase();
  return s.includes("tiktok") || r.includes("tiktok");
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Window: last 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // Pull TikTok-tagged visitor_activity rows for the last 24h
    const { data: activity, error: actErr } = await supabase
      .from("visitor_activity")
      .select("id, session_id, visitor_id, activity_type, utm_source, referrer, created_at")
      .gte("created_at", cutoff)
      .eq("is_internal", false)
      .limit(20000);
    if (actErr) throw actErr;

    const tiktokRows = (activity || []).filter(isTikTok);

    // Group per session
    type SessionAgg = {
      session_id: string;
      visitorIds: Set<string>;
      hasBrowsing: boolean;
      hasCart: boolean;
      hasCheckout: boolean;
      sources: Set<string>;
      sampleEventIds: string[];
    };
    const bySession = new Map<string, SessionAgg>();
    for (const r of tiktokRows) {
      const sid = r.session_id;
      if (!sid) continue;
      const agg = bySession.get(sid) || {
        session_id: sid,
        visitorIds: new Set<string>(),
        hasBrowsing: false,
        hasCart: false,
        hasCheckout: false,
        sources: new Set<string>(),
        sampleEventIds: [],
      };
      if (r.visitor_id) agg.visitorIds.add(r.visitor_id);
      if (r.utm_source) agg.sources.add(r.utm_source.toLowerCase());
      if (r.activity_type === "browsing") agg.hasBrowsing = true;
      if (r.activity_type === "cart") agg.hasCart = true;
      if (r.activity_type === "checkout") agg.hasCheckout = true;
      if (agg.sampleEventIds.length < 5) agg.sampleEventIds.push(r.id);
      bySession.set(sid, agg);
    }

    const sessionIds = Array.from(bySession.keys());
    if (sessionIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, traceId, message: "No TikTok sessions in window", anomaliesAdded: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch matching utm_session_log rows in chunks (PostgREST IN limit)
    const utmLog = new Map<string, { utm_source: string | null; source_channel: string | null }>();
    for (let i = 0; i < sessionIds.length; i += 200) {
      const chunk = sessionIds.slice(i, i + 200);
      const { data, error } = await supabase
        .from("utm_session_log")
        .select("session_id, utm_source, source_channel")
        .in("session_id", chunk);
      if (error) throw error;
      for (const row of data || []) {
        utmLog.set(row.session_id, { utm_source: row.utm_source, source_channel: row.source_channel });
      }
    }

    // Build anomaly upserts
    type Anomaly = {
      session_id: string;
      anomaly_type: string;
      source_channel: string;
      severity: string;
      sample_event_ids: string[];
      details: Record<string, unknown>;
    };
    const anomalies: Anomaly[] = [];

    for (const [sid, s] of bySession) {
      const log = utmLog.get(sid);

      if (!log) {
        anomalies.push({
          session_id: sid,
          anomaly_type: "missing_utm_log",
          source_channel: "tiktok",
          severity: "warn",
          sample_event_ids: s.sampleEventIds,
          details: {
            reason: "TikTok visitor_activity rows exist but no utm_session_log entry",
            visitor_ids: Array.from(s.visitorIds),
            sources: Array.from(s.sources),
          },
        });
      } else if (log.source_channel && log.source_channel !== "tiktok") {
        anomalies.push({
          session_id: sid,
          anomaly_type: "session_id_mismatch",
          source_channel: log.source_channel,
          severity: "critical",
          sample_event_ids: s.sampleEventIds,
          details: {
            reason: "utm_session_log channel differs from visitor_activity TikTok signals",
            log_channel: log.source_channel,
            log_utm_source: log.utm_source,
            activity_sources: Array.from(s.sources),
          },
        });
      }

      if (s.hasCart && !s.hasBrowsing) {
        anomalies.push({
          session_id: sid,
          anomaly_type: "orphan_cart",
          source_channel: "tiktok",
          severity: "warn",
          sample_event_ids: s.sampleEventIds,
          details: { reason: "cart event without preceding browsing event" },
        });
      }

      if (s.hasCheckout && !s.hasCart) {
        anomalies.push({
          session_id: sid,
          anomaly_type: "orphan_checkout",
          source_channel: "tiktok",
          severity: "critical",
          sample_event_ids: s.sampleEventIds,
          details: { reason: "checkout event without preceding cart event" },
        });
      }

      if (s.visitorIds.size > 1) {
        anomalies.push({
          session_id: sid,
          anomaly_type: "multi_visitor_collision",
          source_channel: "tiktok",
          severity: "critical",
          sample_event_ids: s.sampleEventIds,
          details: {
            reason: "session_id shared across multiple visitor_id values",
            visitor_ids: Array.from(s.visitorIds),
          },
        });
      }
    }

    let inserted = 0;
    if (anomalies.length > 0) {
      // Upsert in batches
      for (let i = 0; i < anomalies.length; i += 500) {
        const batch = anomalies.slice(i, i + 500);
        const { error } = await supabase
          .from("tracking_anomalies")
          .upsert(batch, { onConflict: "session_id,anomaly_type", ignoreDuplicates: false });
        if (error) {
          console.error("[tracking-session-validator] upsert error", error);
          throw error;
        }
        inserted += batch.length;
      }

      // If there are critical anomalies, raise a monitoring alert
      const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
      if (criticalCount > 0) {
        await supabase.from("monitoring_alerts").upsert(
          {
            alert_key: "tracking_session_correlation",
            severity: "P1",
            category: "tracking",
            title: `TikTok session correlation issues (${criticalCount} critical)`,
            description: `Detected ${criticalCount} critical anomalies in last 24h: orphan_checkout / session_id_mismatch / multi_visitor_collision. Check /admin for details.`,
            affected_urls: ["https://getpawsy.pet/admin/tiktok-realtime-funnel"],
            suggested_fix:
              "Inspect tracking_anomalies table for full detail. Verify session_id stability in src/hooks/useVisitorTracking.ts and src/lib/utm-session-logger.ts.",
            last_detected_at: new Date().toISOString(),
            is_active: true,
          },
          { onConflict: "alert_key" }
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: `Validated ${sessionIds.length} TikTok sessions`,
        sessionsChecked: sessionIds.length,
        anomaliesUpserted: inserted,
        breakdown: anomalies.reduce<Record<string, number>>((acc, a) => {
          acc[a.anomaly_type] = (acc[a.anomaly_type] || 0) + 1;
          return acc;
        }, {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[tracking-session-validator] error", e);
    return new Response(
      JSON.stringify({ ok: false, traceId, message: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});