import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const since24 = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

  const counts: Record<string, number> = {};
  const stages = ["landing","product_view","add_to_cart","checkout_start","payment_success","purchase"];
  for (const s of stages) {
    const { count } = await supabase
      .from("arie_funnel_events").select("id", { count: "exact", head: true })
      .eq("stage", s).gte("ts", since24);
    counts[s] = count || 0;
  }
  const dropPcts: Record<string, number> = {};
  for (let i = 1; i < stages.length; i++) {
    const prev = counts[stages[i - 1]];
    const cur = counts[stages[i]];
    dropPcts[`${stages[i - 1]}_to_${stages[i]}`] = prev ? 1 - cur / prev : 0;
  }
  const funnelConv = counts.landing ? counts.purchase / counts.landing : null;

  const { count: synthTotal } = await supabase
    .from("arie_synthetic_runs").select("id", { count: "exact", head: true }).gte("created_at", since24);
  const { count: synthFail } = await supabase
    .from("arie_synthetic_runs").select("id", { count: "exact", head: true })
    .eq("status", "fail").gte("created_at", since24);
  const apiHealth = synthTotal ? 1 - (synthFail || 0) / synthTotal : null;

  const { count: validationsTotal } = await supabase
    .from("arie_validation_runs").select("id", { count: "exact", head: true }).gte("created_at", since24);
  const { count: validationsDrift } = await supabase
    .from("arie_validation_runs").select("id", { count: "exact", head: true })
    .neq("status", "ok").gte("created_at", since24);
  const trackingHealth = validationsTotal ? 1 - (validationsDrift || 0) / validationsTotal : null;

  const { data: openIncidents } = await supabase
    .from("arie_incidents").select("affected_revenue_cents")
    .is("resolved_at", null);
  const lost = (openIncidents ?? []).reduce((s: number, r: any) => s + (r.affected_revenue_cents || 0), 0);

  const { error } = await supabase.from("arie_health_snapshots").insert({
    funnel_conversion: funnelConv,
    drop_pcts: dropPcts,
    pixel_health: trackingHealth,
    api_health: apiHealth,
    tracking_health: trackingHealth,
    lost_revenue_estimate_cents: lost,
    details: { counts },
  });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, funnelConv, apiHealth, trackingHealth, lost }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});