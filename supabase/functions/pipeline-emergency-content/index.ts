import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

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
      // P0 architecture remediation: video publisher retired. No alternative
      // emergency video path exists — pcie2_publish_queue handles images only.
      // Emergency mode is now a no-op for video assets.
      void a;
      break;
    }

    return new Response(JSON.stringify({ ok: true, traceId, queued }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});