import "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const start = Date.now();
    let ok = false, status = 0;
    try {
      const r = await fetch("https://getpawsy.pet/", { method: "HEAD" });
      status = r.status; ok = r.ok;
    } catch { /* dns fail */ }
    const latency = Date.now() - start;
    let pinterest_reachable = false;
    try {
      const p = await fetch("https://api.pinterest.com/v5/", { method: "HEAD" });
      pinterest_reachable = p.status < 500;
    } catch { /* */ }
    await sb.from("pinterest_domain_health").insert({
      domain: "getpawsy.pet", ok, http_status: status, latency_ms: latency, pinterest_reachable,
    });
    // Update governor trust score
    const trust = ok && pinterest_reachable ? 100 : ok || pinterest_reachable ? 60 : 20;
    const { data: gov } = await sb.from("pinterest_publish_governor").select("id").limit(1).maybeSingle();
    if (gov?.id) {
      await sb.from("pinterest_publish_governor").update({
        trust_score: trust, domain_healthy: ok, updated_at: new Date().toISOString(),
      }).eq("id", gov.id);
    }
    return new Response(JSON.stringify({ ok: true, traceId, http_status: status, latency_ms: latency, pinterest_reachable, trust }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});