import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

type Probe = {
  key: string;
  query: string;
  yellow_after_min: number;
  red_after_min: number;
  suggested_fix: string;
};

const PROBES: Probe[] = [
  { key: "engagement_starts", query: "analytics_engagement_starts", yellow_after_min: 30, red_after_min: 120, suggested_fix: "Check engagementStart.ts gating and edge fn analytics-engagement-start" },
  { key: "visitor_activity",  query: "visitor_activity",            yellow_after_min: 15, red_after_min: 60,  suggested_fix: "Verify SafeGlobalVisitorTracker and visitor_activity inserts" },
  { key: "lp_funnel_events",  query: "lp_funnel_events",            yellow_after_min: 60, red_after_min: 240, suggested_fix: "Check funnelEvents.ts client emitters" },
  { key: "checkout_events",   query: "checkout_funnel_events",      yellow_after_min: 360, red_after_min: 1440, suggested_fix: "Inspect Stripe redirect and checkout pixel firing" },
  { key: "utm_session_log",   query: "utm_session_log",              yellow_after_min: 30, red_after_min: 120, suggested_fix: "Verify utm-session-logger" },
  { key: "ga4_snapshots",     query: "ga4_daily_snapshots",          yellow_after_min: 60 * 26, red_after_min: 60 * 48, suggested_fix: "Run gsc/ga4 sync; check service account credentials" },
];

async function probe(p: Probe) {
  const started = Date.now();
  try {
    const { data, error } = await admin
      .from(p.query)
      .select("created_at", { count: "exact", head: false })
      .order("created_at", { ascending: false })
      .limit(1);
    const latency = Date.now() - started;
    if (error) {
      return { probe_key: p.key, status: "red", latency_ms: latency, last_success_at: null, failure_reason: error.message, suggested_fix: p.suggested_fix, details: {} };
    }
    const last: string | null = (data && data[0] && (data[0] as any).created_at) || null;
    if (!last) {
      return { probe_key: p.key, status: "red", latency_ms: latency, last_success_at: null, failure_reason: "No rows ever", suggested_fix: p.suggested_fix, details: {} };
    }
    const ageMin = (Date.now() - new Date(last).getTime()) / 60000;
    let status: "green"|"yellow"|"red" = "green";
    if (ageMin > p.red_after_min) status = "red";
    else if (ageMin > p.yellow_after_min) status = "yellow";
    return { probe_key: p.key, status, latency_ms: latency, last_success_at: last, failure_reason: status === "green" ? null : `${Math.round(ageMin)}m since last row`, suggested_fix: p.suggested_fix, details: { age_minutes: Math.round(ageMin) } };
  } catch (e) {
    return { probe_key: p.key, status: "red", latency_ms: Date.now() - started, last_success_at: null, failure_reason: String(e), suggested_fix: p.suggested_fix, details: {} };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const rows = await Promise.all(PROBES.map(probe));
    await admin.from("analytics_health_checks").insert(rows);
    return new Response(JSON.stringify({ ok: true, count: rows.length, rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});