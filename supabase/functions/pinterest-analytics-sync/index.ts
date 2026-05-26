import "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getPinterestToken(sb: ReturnType<typeof createClient>) {
  const { data } = await sb.from("pinterest_connection").select("access_token").limit(1).maybeSingle();
  return (data as { access_token?: string } | null)?.access_token ?? null;
}

async function getApiBase(sb: ReturnType<typeof createClient>) {
  const { data } = await sb.from("pinterest_runtime_settings").select("api_mode").limit(1).maybeSingle();
  const mode = (data as { api_mode?: string } | null)?.api_mode ?? "production";
  return mode === "sandbox" ? "https://api-sandbox.pinterest.com" : "https://api.pinterest.com";
}

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = await getPinterestToken(sb);
    if (!token) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "no pinterest token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const base = await getApiBase(sb);

    // Refresh dimensions from video queue + pin queue
    const { data: vq } = await sb
      .from("pinterest_video_queue")
      .select("pin_id,asset_id,product_slug,hook_variant,copy_variant,cta_variant,board_id,published_at,category_key")
      .not("pin_id", "is", null)
      .limit(500);
    if (Array.isArray(vq) && vq.length) {
      const dims = vq.map((r: Record<string, unknown>) => ({
        pin_id: String(r.pin_id),
        asset_id: r.asset_id as string | null,
        product_slug: r.product_slug as string | null,
        category_key: (r.category_key as string | null) ?? null,
        hook_variant: (r.hook_variant as string | null) ?? null,
        copy_variant: (r.copy_variant as string | null) ?? null,
        cta_variant: (r.cta_variant as string | null) ?? null,
        board_id: (r.board_id as string | null) ?? null,
        published_at: (r.published_at as string | null) ?? null,
        source: "video",
        updated_at: new Date().toISOString(),
      }));
      await sb.from("pinterest_pin_dimensions").upsert(dims, { onConflict: "pin_id" });
    }
    const { data: pq } = await sb
      .from("pinterest_pin_queue")
      .select("pin_external_id,product_slug,product_id,hook_group,category_key,board_name,posted_at")
      .not("pin_external_id", "is", null)
      .limit(500);
    if (Array.isArray(pq) && pq.length) {
      const dims = pq.map((r: Record<string, unknown>) => ({
        pin_id: String(r.pin_external_id),
        product_slug: r.product_slug as string | null,
        category_key: (r.category_key as string | null) ?? null,
        hook_variant: (r.hook_group as string | null) ?? null,
        board_id: (r.board_name as string | null) ?? null,
        published_at: (r.posted_at as string | null) ?? null,
        source: "image",
        updated_at: new Date().toISOString(),
      }));
      await sb.from("pinterest_pin_dimensions").upsert(dims, { onConflict: "pin_id" });
    }

    // Pull last 7 days analytics for each known pin
    const { data: pins } = await sb.from("pinterest_pin_dimensions").select("pin_id").limit(1000);
    const start = new Date(Date.now() - 7 * 86400000);
    const startDay = isoDay(start);
    const endDay = isoDay(new Date());
    let synced = 0;
    let errors = 0;
    for (const row of (pins as { pin_id: string }[] | null) ?? []) {
      try {
        const url = `${base}/v5/pins/${row.pin_id}/analytics?start_date=${startDay}&end_date=${endDay}&metric_types=IMPRESSION,OUTBOUND_CLICK,SAVE,PIN_CLICK,VIDEO_MRC_VIEW`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) { errors++; continue; }
        const json = await r.json() as { all?: { daily_metrics?: Array<{ date: string; data_status?: string; metrics?: Record<string, number> }> } };
        const days = json?.all?.daily_metrics ?? [];
        const rows = days.filter(d => d.metrics).map(d => {
          const m = d.metrics ?? {};
          const imp = Number(m.IMPRESSION ?? 0);
          const out = Number(m.OUTBOUND_CLICK ?? 0);
          const sav = Number(m.SAVE ?? 0);
          const clk = Number(m.PIN_CLICK ?? 0);
          return {
            pin_id: row.pin_id,
            day: d.date,
            impressions: imp,
            outbound_clicks: out,
            saves: sav,
            pin_clicks: clk,
            video_views: Number(m.VIDEO_MRC_VIEW ?? 0),
            ctr: imp > 0 ? out / imp : 0,
            engagement_rate: imp > 0 ? (sav + clk + out) / imp : 0,
            raw: m,
            fetched_at: new Date().toISOString(),
          };
        });
        if (rows.length) {
          await sb.from("pinterest_analytics_daily").upsert(rows, { onConflict: "pin_id,day" });
          synced += rows.length;
        }
      } catch { errors++; }
    }

    return new Response(JSON.stringify({ ok: true, traceId, synced, errors, pins_scanned: (pins ?? []).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});