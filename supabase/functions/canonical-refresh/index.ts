// Genesis V2.5 — Canonical Analytics MV refresh
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL     = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const internalHeader = req.headers.get("x-internal-secret") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const okInternal = INTERNAL.length > 0 && internalHeader === INTERNAL;
  const okJwt = auth.includes(SERVICE_KEY);
  if (!okInternal && !okJwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await sb.rpc("canonical_refresh_all");
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, refreshed_at: new Date().toISOString() }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
