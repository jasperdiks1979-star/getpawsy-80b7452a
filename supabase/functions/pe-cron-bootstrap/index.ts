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

    // Require admin caller OR internal secret
    const internal = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const hdr = req.headers.get("x-internal-secret");
    let authed = !!(hdr && ((internal && hdr === internal) || hdr === PE_CRON_SECRET));
    if (!authed) {
      const auth = req.headers.get("Authorization") ?? "";
      if (auth.startsWith("Bearer ")) {
        const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
        const { data: { user } } = await sb.auth.getUser(auth.slice(7));
        if (user) {
          const { data: role } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role","admin").maybeSingle();
          authed = !!role;
        }
      }
    }
    if (!authed) {
      return new Response(JSON.stringify({ ok:false, traceId, message:"unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type":"application/json" }});
    }

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