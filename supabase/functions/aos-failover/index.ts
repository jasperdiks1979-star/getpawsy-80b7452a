// AOS Phase 2 — Failover Intelligence.
// Detects stale engine heartbeats, opens failover events, replays missed work, reroutes tasks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Each engine has a fallback peer that can absorb work if it fails.
const FALLBACK: Record<string, string> = {
  pcie_v2: "ppe",
  ppe: "pcie_v2",
  creative_evolution: "pei",
  pei: "creative_evolution",
  forecast: "agd",
  agd: "aec",
  aec: "agd",
  revenue_intelligence: "pie",
  pie: "revenue_intelligence",
  arie: "agd",
  mil: "agal",
};

const STALE_MIN = 120; // 2h without heartbeat = unhealthy

async function run() {
  const cutoff = new Date(Date.now() - STALE_MIN * 60 * 1000).toISOString();
  const { data: engines } = await supabase
    .from("aos_engine_registry")
    .select("engine_key, display_name, last_heartbeat_at, health");

  let opened = 0, recovered = 0, rerouted = 0;
  for (const e of engines ?? []) {
    const stale = !e.last_heartbeat_at || e.last_heartbeat_at < cutoff;
    if (stale && e.health !== "down") {
      await supabase.from("aos_engine_registry")
        .update({ health: "down" }).eq("engine_key", e.engine_key);

      await supabase.from("aos_failover_events").insert({
        engine_key: e.engine_key,
        failure_type: "heartbeat_stale",
        recovery_action: "reroute_tasks",
        details: { last_heartbeat_at: e.last_heartbeat_at },
      });
      await supabase.from("aos_events").insert({
        event_type: "engine.down", source_engine: "aos_failover", subject: e.engine_key,
        payload: { last_heartbeat_at: e.last_heartbeat_at }, severity: "critical",
      });
      opened++;

      const fallback = FALLBACK[e.engine_key];
      if (fallback) {
        const { count } = await supabase.from("aos_tasks")
          .update({ owner_engine: fallback })
          .eq("status", "pending").eq("owner_engine", e.engine_key)
          .select("id", { count: "exact", head: true });
        rerouted += count ?? 0;
      }
    } else if (!stale && e.health === "down") {
      await supabase.from("aos_engine_registry")
        .update({ health: "ok" }).eq("engine_key", e.engine_key);
      await supabase.from("aos_failover_events")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("engine_key", e.engine_key).eq("status", "open");
      await supabase.from("aos_events").insert({
        event_type: "engine.recovered", source_engine: "aos_failover", subject: e.engine_key,
        payload: {}, severity: "info",
      });
      recovered++;
    }
  }
  return { opened, recovered, rerouted };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const res = await run();
    return new Response(JSON.stringify({ ok: true, ...res }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});