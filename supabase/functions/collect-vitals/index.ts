import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { path, ua, deviceHint, lcp, cls, inp, fcp, ttfb, sessionId, proxyLcp, connectionType } = body;

    if (!path) {
      return new Response(JSON.stringify({ error: "path required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);

    const { error } = await client.from("web_vitals").insert({
      path,
      device_hint: deviceHint || null,
      lcp_value: lcp?.value ?? null,
      lcp_element: lcp?.element ?? null,
      cls_value: cls?.value ?? null,
      inp_value: inp?.value ?? null,
      inp_event: inp?.event ?? null,
      fcp_value: fcp?.value ?? null,
      ttfb_value: ttfb?.value ?? null,
      ua: ua ? ua.substring(0, 500) : null,
      session_id: sessionId || null,
      proxy_lcp_value: proxyLcp?.value ?? null,
      proxy_lcp_candidate: proxyLcp?.candidate ?? null,
      connection_type: connectionType || null,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
