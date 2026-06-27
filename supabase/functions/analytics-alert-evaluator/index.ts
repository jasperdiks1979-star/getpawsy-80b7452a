import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function openAlert(key: string, severity: "info"|"warning"|"critical", title: string, message: string, fix: string, mv?: number, tv?: number) {
  // skip if already open
  const { data: existing } = await admin
    .from("analytics_alerts")
    .select("id")
    .eq("alert_key", key)
    .eq("status", "open")
    .limit(1);
  if (existing && existing.length > 0) return;
  await admin.from("analytics_alerts").insert({
    alert_key: key, severity, title, message, suggested_fix: fix,
    metric_value: mv ?? null, threshold_value: tv ?? null,
  });
}

async function resolveAlert(key: string) {
  await admin.from("analytics_alerts")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("alert_key", key).eq("status", "open");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Geo success %
    const { data: geo } = await admin
      .from("analytics_geo_quality")
      .select("confidence")
      .gte("created_at", since);
    if (geo && geo.length > 20) {
      const ok = geo.filter((r: any) => r.confidence !== "Unknown").length;
      const pct = (ok / geo.length) * 100;
      if (pct < 95) await openAlert("geo_success_low", "warning", "Geo success < 95%", `Only ${pct.toFixed(1)}% of sessions enriched.`, "Inspect multi-provider fallback in useVisitorTracking", pct, 95);
      else await resolveAlert("geo_success_low");
    }

    // Purchase events stopped (>24h)
    const { data: lastPurchase } = await admin
      .from("analytics_funnel_waterfall")
      .select("purchase_at")
      .not("purchase_at", "is", null)
      .order("purchase_at", { ascending: false })
      .limit(1);
    const lp = lastPurchase?.[0]?.purchase_at;
    if (lp) {
      const ageH = (Date.now() - new Date(lp).getTime()) / 3600000;
      if (ageH > 24) await openAlert("purchases_stalled", "critical", "No purchase events in 24h", `Last purchase ${ageH.toFixed(1)}h ago.`, "Check Stripe webhook + checkout_funnel_events", ageH, 24);
      else await resolveAlert("purchases_stalled");
    }

    // Engagement starts stopped
    const { data: lastEs } = await admin
      .from("analytics_engagement_starts")
      .select("fired_at")
      .order("fired_at", { ascending: false })
      .limit(1);
    const les = lastEs?.[0]?.fired_at;
    if (les) {
      const ageM = (Date.now() - new Date(les).getTime()) / 60000;
      if (ageM > 60) await openAlert("engagement_stalled", "warning", "No engagement_start in 60m", `Last ${Math.round(ageM)}m ago.`, "Verify engagementStart collector loaded on landing pages", ageM, 60);
      else await resolveAlert("engagement_stalled");
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});