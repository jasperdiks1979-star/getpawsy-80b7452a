import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PE_CRON_SECRET = Deno.env.get("PE_CRON_SECRET");
    if (!PE_CRON_SECRET) {
      return new Response(JSON.stringify({ ok:false, traceId, message:"PE_CRON_SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type":"application/json" }});
    }

    // Bootstrap is safe to invoke openly: takes no caller input and only rewrites
    // cron job definitions using a server-side env secret. No data is leaked.
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await sb.rpc("pe_reschedule_crons", { p_secret: PE_CRON_SECRET });
    if (error) throw error;
    return new Response(JSON.stringify({ ok:true, traceId, result: data }),
      { headers: { ...corsHeaders, "Content-Type":"application/json" }});
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, traceId, message: String((e as Error).message) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type":"application/json" }});
  }
});