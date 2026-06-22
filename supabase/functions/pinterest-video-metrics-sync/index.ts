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
function json(b: unknown, status = 200) { return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const log = createPvLogger(sb, "pinterest-video-metrics-sync", traceId);
    await log.info("entered handler");
    const body = await req.json().catch(() => ({}));
    // Auth: accept (a) admin JWT, (b) cron with anon apikey, or (c) x-render-secret
    const renderSecret = Deno.env.get("RENDER_WORKER_SECRET") || "";
    const headerSecret = req.headers.get("x-render-secret") || "";
    const apikey = req.headers.get("apikey") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const isCronCall = body?.action === "cron" && apikey && apikey === anonKey;
    const isSecretCall = renderSecret && headerSecret === renderSecret;
    if (!isCronCall && !isSecretCall) {
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        await log.warn("missing bearer token");
        return json({ ok: false, code: "UNAUTHENTICATED", traceId, message: "Missing authenticated admin JWT" }, 401);
      }
      const sbUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await sbUser.auth.getUser();
      if (userError || !user) { await log.warn("unauthenticated", { message: userError?.message }); return json({ ok: false, code: "UNAUTHENTICATED", traceId, message: userError?.message || "Invalid user token" }, 401); }
      const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) { return json({ ok: false, code: "FORBIDDEN", traceId, message: "Admin authorization required" }, 403); }
    }
    const apiBase = await getPinterestApiBase(sb);
    const { data: conn } = await sb.from("pinterest_connection").select("access_token").eq("status","connected").order("updated_at",{ascending:false}).limit(1).maybeSingle();
    const token = conn?.access_token;
    if (body?.action === "__health_check__" || body?.action === "refresh_status") {
      const { count } = await sb.from("pinterest_video_queue").select("id", { count: "exact", head: true }).eq("status", "published").not("pin_id", "is", null);
      await log.info("health check ok", { pinterest_connected: !!token, published_pin_count: count ?? 0 });
      return ok({ ok: true, traceId, function: "pinterest-video-metrics-sync", admin: true, pinterest_connected: !!token, published_pin_count: count ?? 0 });
    }
    if (!token) { await log.warn("no token"); return ok({ ok:false, code:"NO_TOKEN", traceId }); }
    const { data: rows } = await sb.from("pinterest_video_queue")
      .select("pin_id, asset_id, board_id")
      .eq("status","published").not("pin_id","is",null).limit(200);
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
        const engagement_rate = impressions > 0 ? ((outbound_clicks + saves) / impressions) * 100 : 0;
        // Enrich linkage: voice (latest assignment), scene (asset), category (asset.product_slug → products.category)
        let voice_name: string | null = null;
        let scene_slug: string | null = null;
        let category: string | null = null;
        try {
          const { data: va } = await sb.from("pinterest_voice_assignments")
            .select("voice_name, category").eq("pin_id", r.pin_id)
            .order("assigned_at",{ ascending:false }).limit(1).maybeSingle();
          if (va) { voice_name = (va as any).voice_name ?? null; category = (va as any).category ?? null; }
        } catch (_) {}
        try {
          const { data: asset } = await sb.from("pinterest_video_assets")
            .select("product_slug").eq("id", r.asset_id).maybeSingle();
          const slug = (asset as any)?.product_slug;
          if (slug && !category) {
            const { data: prod } = await sb.from("products").select("category").eq("slug", slug).maybeSingle();
            category = (prod as any)?.category ?? null;
          }
        } catch (_) {}
        try {
          const { data: se } = await sb.from("cinematic_scene_environments")
            .select("slug").order("last_used_at",{ ascending:false, nullsFirst:false }).limit(1).maybeSingle();
          scene_slug = (se as any)?.slug ?? null;
        } catch (_) {}
        await sb.from("pinterest_video_metrics").upsert({
          pin_id: r.pin_id, asset_id: r.asset_id,
          impressions, outbound_clicks, saves, ctr, engagement_rate,
          voice_name, scene_slug, board_id: (r as any).board_id ?? null, category,
          day: today, fetched_at: new Date().toISOString(),
        }, { onConflict: "pin_id,day" });
        updated++;
      } catch (e) {
        await log.error("pin sync error", { pin_id: r.pin_id, message: (e as Error)?.message }, { asset_id: r.asset_id });
      }
    }
    // Auto-apply performance weights to voices + scenes
    let weights: any = null;
    try {
      const { data: w } = await sb.rpc("apply_pinterest_perf_weights");
      weights = w;
    } catch (e) { await log.warn("weights rpc failed", { message: (e as Error)?.message }); }
    await log.info("done", { updated, weights });
    return ok({ ok:true, traceId, updated, weights });
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