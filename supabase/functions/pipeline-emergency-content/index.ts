import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { data: assets } = await sb
      .from("pinterest_video_assets")
      .select("id, product_id, duration_ms")
      .gte("duration_ms", 5000)
      .order("created_at", { ascending: false })
      .limit(50);

    let queued = 0;
    for (const a of (assets ?? []) as any[]) {
      if (!a.product_id) continue;
      const { data: prod } = await sb.from("products").select("effective_stock, is_active").eq("id", a.product_id).maybeSingle();
      if (!prod || !(prod as any).is_active || ((prod as any).effective_stock ?? 0) <= 0) continue;
      try {
        const { error } = await sb.functions.invoke("pinterest-video-publisher", { body: { action: "queue_draft", asset_id: a.id, source: "emergency_mode" } });
        if (!error) queued++;
        if (queued >= 12) break;
      } catch (_) {}
    }

    return new Response(JSON.stringify({ ok: true, traceId, queued }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});