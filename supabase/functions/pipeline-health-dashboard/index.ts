import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ ok: false, message: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ ok: false, message: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [latest, trend, failures, recoveries, settings] = await Promise.all([
      sb.from("pinterest_pipeline_health_snapshots").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("pinterest_pipeline_health_snapshots").select("created_at, health_score, mode, pins_published_24h").order("created_at", { ascending: false }).limit(96),
      sb.from("pinterest_pipeline_failures").select("id, source, job_type, error_message, attempt, next_retry_at, escalated_at, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(50),
      sb.from("pinterest_pipeline_recovery_runs").select("*").order("started_at", { ascending: false }).limit(10),
      sb.from("pinterest_pipeline_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    return new Response(JSON.stringify({
      ok: true, traceId,
      snapshot: latest.data ?? null,
      trend: trend.data ?? [],
      open_failures: failures.data ?? [],
      recovery_runs: recoveries.data ?? [],
      settings: settings.data ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});