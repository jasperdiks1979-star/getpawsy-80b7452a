import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function severityFrom(driftPct: number): string {
  const a = Math.abs(driftPct);
  if (a >= 50) return "critical";
  if (a >= 25) return "high";
  if (a >= 15) return "medium";
  if (a >= 5) return "low";
  return "info";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
  const checks: any[] = [];

  const { count: atc } = await supabase
    .from("arie_funnel_events")
    .select("id", { count: "exact", head: true })
    .eq("stage", "add_to_cart")
    .gte("ts", since);

  const { count: purchases } = await supabase
    .from("arie_funnel_events")
    .select("id", { count: "exact", head: true })
    .eq("stage", "purchase")
    .gte("ts", since);

  const { count: ordersCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  function pushCheck(pair: string, expected: number, actual: number) {
    const drift = expected ? ((actual - expected) / Math.max(expected, 1)) * 100 : 0;
    const severity = severityFrom(drift);
    checks.push({
      source_pair: pair,
      window_label: "24h",
      expected,
      actual,
      drift_pct: drift,
      severity,
      status: severity === "info" || severity === "low" ? "ok" : "drift",
      details: {},
    });
    return { drift, severity };
  }

  const purchaseVsOrders = pushCheck("arie_purchase_vs_orders", ordersCount || 0, purchases || 0);
  pushCheck("arie_atc_vs_purchase_ratio", Math.max(atc || 0, 1), purchases || 0);

  await supabase.from("arie_validation_runs").insert(checks);

  const incidents: any[] = [];
  if (purchaseVsOrders.severity === "high" || purchaseVsOrders.severity === "critical") {
    incidents.push({
      type: "purchase_event_drift",
      severity: purchaseVsOrders.severity,
      confidence: 0.8,
      affected_revenue_cents: 0,
      affected_sessions: Math.abs((ordersCount || 0) - (purchases || 0)),
      root_cause: `Funnel purchase events drift ${purchaseVsOrders.drift.toFixed(1)}% vs orders table`,
      suggested_repair: "tracking.event_dedup",
      source_pair: "arie_purchase_vs_orders",
      segment: { window: "24h" },
      details: { expected_orders: ordersCount, actual_purchases: purchases },
    });
  }
  if (incidents.length) await supabase.from("arie_incidents").insert(incidents);

  return new Response(JSON.stringify({ ok: true, checks: checks.length, incidents: incidents.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});