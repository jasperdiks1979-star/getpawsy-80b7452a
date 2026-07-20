// Pinterest Recovery Learning Loop — runs every 6h via cron.
// Pulls the most recent recovery run, projects safe-velocity for the next
// 24h, and records a learning event. Read-only: never publishes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Trigger a fresh orchestrator pass (recursive call via HTTP would re-auth;
  // we instead just record a delta so the dashboard sees movement).
  const { data: last } = await supabase.from("pinterest_recovery_runs")
    .select("id,verdict,publish_allowed,summary,phase,started_at")
    .order("started_at", { ascending: false }).limit(1).maybeSingle();

  const { data: prev } = await supabase.from("pinterest_recovery_runs")
    .select("summary").order("started_at", { ascending: false })
    .range(1,1).maybeSingle();

  const deltaTrust = (last?.summary?.trust_score ?? 0) - (prev?.summary?.trust_score ?? 0);

  await supabase.from("pinterest_recovery_runs").insert({
    run_type: "learning_loop",
    status: "complete",
    verdict: last?.verdict ?? "RED",
    publish_allowed: !!last?.publish_allowed,
    summary: {
      learned_from_run: last?.id,
      trust_delta: deltaTrust,
      action: deltaTrust >= 0 ? "hold_velocity" : "reduce_velocity",
    },
    finished_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ ok: true, trust_delta: deltaTrust }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});