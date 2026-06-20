import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { archetypeFromText, bucketDuration, percentileRank, tierFromPercentile } from "../_shared/revenue-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const today = new Date().toISOString().slice(0, 10);

    // Pin performance feed (last 7d for tier recomputation)
    const { data: pins } = await supabase
      .from("pinterest_pin_performance")
      .select("pin_id, impressions, clicks, saves, outbound_clicks, day, product_id")
      .gte("day", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
      .limit(5000);

    const pinRows = pins ?? [];
    if (pinRows.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No pins to rollup", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch revenue/atc/checkouts/purchases for those pins via visitor scores
    const pinIds = [...new Set(pinRows.map((p: any) => p.pin_id).filter(Boolean))];
    const { data: scores } = await supabase
      .from("pinterest_visitor_revenue_scores")
      .select("pin_id, revenue_cents, atc_count, checkout_count, purchase_count")
      .in("pin_id", pinIds.slice(0, 1000));
    const revByPin = new Map<string, { rev: number; atc: number; co: number; pur: number }>();
    for (const s of (scores ?? []) as any[]) {
      const cur = revByPin.get(s.pin_id) ?? { rev: 0, atc: 0, co: 0, pur: 0 };
      cur.rev += Number(s.revenue_cents || 0);
      cur.atc += Number(s.atc_count || 0);
      cur.co += Number(s.checkout_count || 0);
      cur.pur += Number(s.purchase_count || 0);
      revByPin.set(s.pin_id, cur);
    }

    // Enrich with queue/voice/category from pinterest_pin_queue
    const { data: queueMeta } = await supabase
      .from("pinterest_pin_queue")
      .select("pinterest_pin_id, product_id, voice_id, category, title, cta_text, video_duration_seconds")
      .in("pinterest_pin_id", pinIds.slice(0, 1000));
    const metaByPin = new Map<string, any>();
    for (const q of (queueMeta ?? []) as any[]) {
      if (q.pinterest_pin_id) metaByPin.set(q.pinterest_pin_id, q);
    }

    // Aggregate by pin_id+day
    const agg = new Map<string, any>();
    for (const p of pinRows as any[]) {
      const key = `${p.pin_id}|${p.day}`;
      const cur = agg.get(key) ?? {
        pin_id: p.pin_id,
        product_id: p.product_id ?? null,
        day: p.day,
        impressions: 0,
        outbound_clicks: 0,
        saves: 0,
      };
      cur.impressions += Number(p.impressions || 0);
      cur.outbound_clicks += Number(p.outbound_clicks || p.clicks || 0);
      cur.saves += Number(p.saves || 0);
      agg.set(key, cur);
    }

    const rows: any[] = [];
    const revPerImpressionList: number[] = [];
    for (const v of agg.values()) {
      const r = revByPin.get(v.pin_id) ?? { rev: 0, atc: 0, co: 0, pur: 0 };
      const meta = metaByPin.get(v.pin_id);
      const impressions = v.impressions;
      const clicks = v.outbound_clicks;
      const rpi = impressions > 0 ? r.rev / impressions : 0;
      revPerImpressionList.push(rpi);
      rows.push({
        pin_id: v.pin_id,
        product_id: v.product_id ?? meta?.product_id ?? null,
        voice_id: meta?.voice_id ?? null,
        category: meta?.category ?? null,
        hook_archetype: archetypeFromText(meta?.title, "hook"),
        cta_archetype: archetypeFromText(meta?.cta_text, "cta"),
        video_duration_bucket: bucketDuration(meta?.video_duration_seconds),
        impressions,
        outbound_clicks: clicks,
        saves: v.saves,
        atc: r.atc,
        checkouts: r.co,
        purchases: r.pur,
        revenue_cents: r.rev,
        outbound_ctr: impressions ? clicks / impressions : 0,
        atc_rate: clicks ? r.atc / clicks : 0,
        checkout_rate: clicks ? r.co / clicks : 0,
        purchase_rate: clicks ? r.pur / clicks : 0,
        revenue_per_impression: rpi,
        revenue_per_click: clicks ? r.rev / clicks : 0,
        day: v.day,
        updated_at: new Date().toISOString(),
      });
    }

    // Assign percentile + tier
    for (const row of rows) {
      const p = percentileRank(revPerImpressionList, row.revenue_per_impression);
      row.percentile_revenue = Math.round(p * 1000) / 10;
      row.tier = tierFromPercentile(p, undefined, row.impressions >= 200);
    }

    // Upsert in chunks
    const chunks: any[][] = [];
    for (let i = 0; i < rows.length; i += 500) chunks.push(rows.slice(i, i + 500));
    for (const c of chunks) {
      await supabase.from("revenue_ai_pin_performance").upsert(c, { onConflict: "pin_id,day" });
    }

    return new Response(JSON.stringify({ ok: true, processed: rows.length, today }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("perf-rollup error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
