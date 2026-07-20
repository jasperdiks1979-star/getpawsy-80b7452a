import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

// Phase 7a — Multi-channel ingest
// Pulls daily impressions/clicks/conversions/revenue/spend per channel per product
// from existing source tables and upserts into growth_channel_signals.

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function score(imp: number, clk: number, conv: number, rev: number, spend: number) {
  const ctr = imp > 0 ? clk / imp : 0;
  const cvr = clk > 0 ? conv / clk : 0;
  const roas = spend > 0 ? rev / spend : (rev > 0 ? 4 : 0);
  // 0..100 composite
  return Math.min(100, ctr * 100 * 5 + cvr * 100 * 3 + roas * 8);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const since = new Date(Date.now() - 86_400_000).toISOString();

    const rows: Array<Record<string, unknown>> = [];

    // PINTEREST — derive from pinterest_pin_metrics joined to pin_queue
    try {
      const { data: pm } = await sb
        .from("pinterest_pin_metrics")
        .select("pin_id, impressions, outbound_clicks, saves, day")
        .gte("day", yest);
      const byPin = new Map<string, { imp: number; clk: number; sav: number }>();
      (pm ?? []).forEach((r: any) => {
        const k = String(r.pin_id);
        const cur = byPin.get(k) ?? { imp: 0, clk: 0, sav: 0 };
        cur.imp += Number(r.impressions ?? 0);
        cur.clk += Number(r.outbound_clicks ?? 0);
        cur.sav += Number(r.saves ?? 0);
        byPin.set(k, cur);
      });
      if (byPin.size) {
        const { data: pins } = await sb
          .from("pinterest_pin_queue")
          .select("pin_id, product_slug")
          .in("pin_id", Array.from(byPin.keys()));
        const slugAgg = new Map<string, { imp: number; clk: number; sav: number }>();
        (pins ?? []).forEach((p: any) => {
          if (!p.product_slug || !p.pin_id) return;
          const m = byPin.get(String(p.pin_id));
          if (!m) return;
          const cur = slugAgg.get(p.product_slug) ?? { imp: 0, clk: 0, sav: 0 };
          cur.imp += m.imp;
          cur.clk += m.clk;
          cur.sav += m.sav;
          slugAgg.set(p.product_slug, cur);
        });
        for (const [slug, m] of slugAgg) {
          rows.push({
            channel: "pinterest",
            product_slug: slug,
            day: today,
            impressions: m.imp,
            clicks: m.clk,
            conversions: 0,
            revenue: 0,
            spend: 0,
            score: score(m.imp, m.clk, 0, 0, 0),
            meta: { saves: m.sav },
          });
        }
      }
    } catch (e) {
      console.warn(`[${traceId}] pinterest ingest skipped`, (e as Error).message);
    }

    // TIKTOK — organic, derive from visitor_events tagged tiktok
    try {
      const { data: ev } = await sb
        .from("visitor_events")
        .select("event_type, path, utm_source, created_at")
        .gte("created_at", since)
        .ilike("utm_source", "%tiktok%");
      const slugAgg = new Map<string, { clk: number }>();
      (ev ?? []).forEach((r: any) => {
        const m = String(r.path ?? "").match(/\/products\/([^/?#]+)/);
        if (!m) return;
        const cur = slugAgg.get(m[1]) ?? { clk: 0 };
        cur.clk += 1;
        slugAgg.set(m[1], cur);
      });
      for (const [slug, m] of slugAgg) {
        rows.push({
          channel: "tiktok",
          product_slug: slug,
          day: today,
          impressions: m.clk * 20, // organic proxy
          clicks: m.clk,
          conversions: 0,
          revenue: 0,
          spend: 0,
          score: score(m.clk * 20, m.clk, 0, 0, 0),
          meta: { source: "visitor_events" },
        });
      }
    } catch (e) {
      console.warn(`[${traceId}] tiktok ingest skipped`, (e as Error).message);
    }

    // GOOGLE ADS — derive from google_ads_daily_stats if present
    try {
      const { data: ga } = await sb
        .from("google_ads_daily_stats")
        .select("product_slug, impressions, clicks, conversions, revenue, cost, day")
        .gte("day", yest);
      (ga ?? []).forEach((r: any) => {
        const imp = Number(r.impressions ?? 0);
        const clk = Number(r.clicks ?? 0);
        const conv = Number(r.conversions ?? 0);
        const rev = Number(r.revenue ?? 0);
        const spend = Number(r.cost ?? 0);
        rows.push({
          channel: "google_ads",
          product_slug: r.product_slug ?? "unknown",
          day: today,
          impressions: imp,
          clicks: clk,
          conversions: conv,
          revenue: rev,
          spend,
          score: score(imp, clk, conv, rev, spend),
          meta: {},
        });
      });
    } catch (e) {
      console.warn(`[${traceId}] google_ads ingest skipped (table may not exist)`);
    }

    let upserted = 0;
    if (rows.length) {
      const { error } = await sb
        .from("growth_channel_signals")
        .upsert(rows, { onConflict: "channel,product_slug,day" });
      if (error) throw error;
      upserted = rows.length;
    }

    await sb.from("growth_events").insert({
      event_type: "channel_ingest",
      payload: { trace_id: traceId, upserted } as any,
    });

    return json({ ok: true, traceId, upserted });
  } catch (e) {
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});