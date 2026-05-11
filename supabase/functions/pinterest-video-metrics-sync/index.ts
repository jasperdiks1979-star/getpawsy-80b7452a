// Pinterest Video Metrics Sync — fetch analytics for published video pins.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { getPinterestApiBase } from "../_shared/pinterest-config.ts";
import { createPvLogger } from "../_shared/pinterest-video-fn-logger.ts";

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
    const log = createPvLogger(sb, "pinterest-video-metrics-sync", traceId);
    await log.info("entered handler");
    const authHeader = req.headers.get("Authorization") || "";
    const sbUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) { await log.warn("unauthenticated"); return ok({ ok: false, code: "UNAUTHENTICATED", traceId }); }
    const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) { await log.warn("forbidden", { user_id: user.id }); return ok({ ok: false, code: "FORBIDDEN", traceId }); }
    const body = await req.json().catch(() => ({}));
    const apiBase = await getPinterestApiBase(sb);
    const { data: conn } = await sb.from("pinterest_connection").select("access_token").eq("status","connected").order("updated_at",{ascending:false}).limit(1).maybeSingle();
    const token = conn?.access_token;
    if (body?.action === "__health_check__" || body?.action === "refresh_status") {
      const { count } = await sb.from("pinterest_video_queue").select("id", { count: "exact", head: true }).eq("status", "published").not("pin_id", "is", null);
      await log.info("health check ok", { pinterest_connected: !!token, published_pin_count: count ?? 0 });
      return ok({ ok: true, traceId, function: "pinterest-video-metrics-sync", admin: true, pinterest_connected: !!token, published_pin_count: count ?? 0 });
    }
    if (!token) { await log.warn("no token"); return ok({ ok:false, code:"NO_TOKEN", traceId }); }
    const { data: rows } = await sb.from("pinterest_video_queue").select("pin_id, asset_id").eq("status","published").not("pin_id","is",null).limit(50);
    await log.info("syncing pins", { count: rows?.length || 0 });
    let updated = 0;
    const today = new Date().toISOString().slice(0,10);
    for (const r of rows || []) {
      try {
        const res = await fetch(`${apiBase}/pins/${r.pin_id}/analytics?start_date=${today}&end_date=${today}&metric_types=IMPRESSION,OUTBOUND_CLICK,SAVE`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { await log.warn("analytics fetch failed", { pin_id: r.pin_id, status: res.status }, { asset_id: r.asset_id }); continue; }
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
      } catch (e) {
        await log.error("pin sync error", { pin_id: r.pin_id, message: (e as Error)?.message }, { asset_id: r.asset_id });
      }
    }
    await log.info("done", { updated });
    return ok({ ok:true, traceId, updated });
  } catch (e) {
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("pinterest_video_function_logs").insert({
        function_name: "pinterest-video-metrics-sync", trace_id: traceId, level: "error",
        message: "fatal", payload: { message: (e as Error)?.message, stack: (e as Error)?.stack?.slice(0, 800) },
      });
    } catch (_) {}
    return ok({ ok:false, code:"UNEXPECTED_ERROR", traceId, message:(e as Error)?.message });
  }
});