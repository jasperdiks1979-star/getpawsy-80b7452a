// Guardian Publish Gate — invoked by pcie2-publisher before any live Pinterest
// publish. Returns { allow: boolean, reason } based on guardian_status.
// If Guardian status is not GREEN, blocks the publish and logs the decision.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RUN_AGE_MIN = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let pipeline = "pcie2-publisher";
  let context: Record<string, unknown> = {};
  try { const body = await req.json(); pipeline = body?.pipeline ?? pipeline; context = body?.context ?? {}; } catch {}

  const { data: status } = await sb.from("guardian_status").select("*").eq("id", true).maybeSingle();
  const ageMin = status?.last_run_at ? (Date.now() - new Date(status.last_run_at).getTime()) / 60000 : Infinity;

  let allow = false;
  let reason = "";
  if (!status) { reason = "guardian_status_missing"; }
  else if (!status.publish_gate_open) { reason = `gate_closed_color=${status.color}`; }
  else if (status.color !== "green") { reason = `guardian_not_green=${status.color}`; }
  else if (ageMin > MAX_RUN_AGE_MIN) { reason = `last_run_stale_${Math.round(ageMin)}min`; }
  else { allow = true; reason = "guardian_green_and_fresh"; }

  await sb.from("guardian_publish_gate_log").insert({
    pipeline, decision: allow ? "allow" : "block", reason,
    guardian_color: status?.color ?? null, guardian_score: status?.score ?? null,
    context: { ...context, last_run_age_min: Math.round(ageMin) },
  });

  return new Response(JSON.stringify({ allow, reason, guardian: status ?? null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
