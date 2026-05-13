// Profit Engine health endpoint — no auth required, returns env presence.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = {
    ok: true,
    function: "profit-engine-health",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    auth_required: false,
    env_loaded: {
      supabase_url: !!Deno.env.get("SUPABASE_URL"),
      service_role: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      anon_key: !!Deno.env.get("SUPABASE_ANON_KEY"),
      pinterest_token: !!Deno.env.get("PINTEREST_ACCESS_TOKEN"),
    },
  };
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
