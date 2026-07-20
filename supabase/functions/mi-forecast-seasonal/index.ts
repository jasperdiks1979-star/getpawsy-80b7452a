import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Pull last 365 days of US visitor_activity tied to a product (with category lookup)
    const since = new Date(Date.now() - 365 * 86400_000).toISOString();
    const { data: rows, error } = await supabase
      .from("visitor_activity")
      .select("created_at, activity_type, product_id, country, is_internal")
      .eq("country", "US")
      .neq("is_internal", true)
      .not("product_id", "is", null)
      .gte("created_at", since)
      .limit(50000);
    if (error) throw error;

    const productIds = Array.from(new Set((rows ?? []).map((r: any) => r.product_id))).filter(Boolean);
    const catMap = new Map<string, string>();
    if (productIds.length) {
      for (let i = 0; i < productIds.length; i += 200) {
        const batch = productIds.slice(i, i + 200);
        const { data: prods } = await supabase
          .from("products")
          .select("id, category")
          .in("id", batch);
        for (const p of prods ?? []) catMap.set((p as any).id, (p as any).category ?? "uncategorized");
      }
    }

    // Aggregate per (category, week_of_year)
    const buckets = new Map<string, { cat: string; week: number; count: number }>();
    const catWeekTotals = new Map<string, number>();
    const catTotals = new Map<string, number>();
    for (const r of rows ?? []) {
      const cat = catMap.get((r as any).product_id) ?? "uncategorized";
      const d = new Date((r as any).created_at);
      const week = isoWeek(d);
      const key = `${cat}__${week}`;
      const w = (r as any).activity_type === "purchase" ? 5 : 1;
      const b = buckets.get(key) ?? { cat, week, count: 0 };
      b.count += w;
      buckets.set(key, b);
      catTotals.set(cat, (catTotals.get(cat) ?? 0) + w);
      catWeekTotals.set(cat, (catWeekTotals.get(cat) ?? 0) + w);
    }

    // Compute expected lift per (cat, week) vs cat average across weeks
    const catWeekCount = new Map<string, number>();
    for (const b of buckets.values()) {
      catWeekCount.set(b.cat, (catWeekCount.get(b.cat) ?? 0) + 1);
    }

    let upserted = 0;
    const records: any[] = [];
    for (const b of buckets.values()) {
      const total = catTotals.get(b.cat) ?? 0;
      const weeks = catWeekCount.get(b.cat) ?? 1;
      const avg = total / weeks;
      if (avg <= 0) continue;
      const lift = ((b.count - avg) / avg) * 100;
      const sample = b.count;
      const confidence = Math.min(1, sample / 50);
      records.push({
        category: b.cat,
        week_of_year: b.week,
        market: "US",
        expected_lift: Number(lift.toFixed(2)),
        confidence: Number(confidence.toFixed(2)),
        notes: `samples=${sample}, baseline_avg=${avg.toFixed(1)}`,
      });
    }

    // Replace forecasts for US
    if (records.length) {
      await supabase.from("mi_seasonal_forecasts").delete().eq("market", "US");
      for (let i = 0; i < records.length; i += 200) {
        const batch = records.slice(i, i + 200);
        const { error: insErr } = await supabase.from("mi_seasonal_forecasts").insert(batch);
        if (!insErr) upserted += batch.length;
      }
    }

    return new Response(JSON.stringify({
      ok: true, traceId,
      message: `Forecasts rebuilt: ${upserted} rows across ${catTotals.size} categories`,
      stats: { rows_scanned: rows?.length ?? 0, categories: catTotals.size, forecasts_inserted: upserted },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, traceId, message: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}