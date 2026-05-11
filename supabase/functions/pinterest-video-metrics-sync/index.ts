// Pinterest Video Metrics Sync — fetch analytics for published video pins.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { getPinterestApiBase } from "../_shared/pinterest-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function ok(b: unknown) { return new Response(JSON.stringify(b), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const apiBase = await getPinterestApiBase(sb);
    const { data: conn } = await sb.from("pinterest_connection").select("access_token").eq("status","connected").order("updated_at",{ascending:false}).limit(1).maybeSingle();
    const token = conn?.access_token;
    if (!token) return ok({ ok:false, code:"NO_TOKEN", traceId });
    const { data: rows } = await sb.from("pinterest_video_queue").select("pin_id, asset_id").eq("status","published").not("pin_id","is",null).limit(50);
    let updated = 0;
    const today = new Date().toISOString().slice(0,10);
    for (const r of rows || []) {
      try {
        const res = await fetch(`${apiBase}/pins/${r.pin_id}/analytics?start_date=${today}&end_date=${today}&metric_types=IMPRESSION,OUTBOUND_CLICK,SAVE`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) continue;
        const body = await res.json().catch(() => ({}));
        const m = body?.all?.summary_metrics || {};
        const impressions = Number(m.IMPRESSION || 0);
        const outbound_clicks = Number(m.OUTBOUND_CLICK || 0);
        const saves = Number(m.SAVE || 0);
        const ctr = impressions > 0 ? (outbound_clicks / impressions) * 100 : 0;
        await sb.from("pinterest_video_metrics").upsert({
          pin_id: r.pin_id, asset_id: r.asset_id,
          impressions, outbound_clicks, saves, ctr,
          day: today, fetched_at: new Date().toISOString(),
        }, { onConflict: "pin_id,day" });
        updated++;
      } catch (e) { console.error("[pvms] err pin=", r.pin_id, e); }
    }
    return ok({ ok:true, traceId, updated });
  } catch (e) {
    return ok({ ok:false, code:"UNEXPECTED_ERROR", traceId, message:(e as Error)?.message });
  }
});