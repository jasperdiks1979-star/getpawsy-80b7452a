// PAIP Product Daily Ranker — Module 10
import { corsHeaders, svc, startRun, finishRun, clamp } from "../_shared/paip-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const runId = await startRun("paip-product-ranker");
  try {
    const s = svc();
    const { data: products } = await s.from("products")
      .select("id, name, slug, margin_percent, us_stock, effective_stock, average_rating, review_count, fast_shipping_score, is_active")
      .eq("is_active", true)
      .limit(2000);
    const { data: trendRows } = await s.from("paip_product_trend_scores")
      .select("product_id, trend_score, demand_forecast_30d, seasonality, competition");
    const trendMap = new Map((trendRows ?? []).map((r: any) => [r.product_id, r]));
    const today = new Date().toISOString().slice(0, 10);
    const scored: any[] = [];
    for (const p of products ?? []) {
      const t: any = trendMap.get(p.id) ?? {};
      const trend = Number(t.trend_score ?? 0);
      const demand = Number(t.demand_forecast_30d ?? 0);
      const seas = Number(t.seasonality ?? 0);
      const comp = Number(t.competition ?? 50);
      const margin = clamp(Number(p.margin_percent ?? 0) * 100);
      const stockNum = Number(p.us_stock ?? p.effective_stock ?? 0);
      const stock = stockNum > 5 ? 100 : stockNum > 0 ? 60 : 0;
      const reviews = clamp((Number(p.average_rating ?? 0) / 5) * 100 * (Number(p.review_count ?? 0) > 5 ? 1 : 0.5));
      const shipping = clamp(Number(p.fast_shipping_score ?? 50));
      const composite =
        trend * 0.22 + demand * 0.15 + seas * 0.08 +
        margin * 0.18 + stock * 0.14 + reviews * 0.08 +
        shipping * 0.10 + (100 - comp) * 0.05;
      scored.push({
        product_id: p.id, run_date: today,
        composite_score: Math.round(composite * 100) / 100,
        components: { trend, demand, seas, margin, stock, reviews, shipping, comp },
      });
    }
    scored.sort((a, b) => b.composite_score - a.composite_score);
    scored.forEach((r, i) => r.rank = i + 1);
    for (let i = 0; i < scored.length; i += 200) {
      await s.from("paip_product_daily_rank").upsert(scored.slice(i, i + 200), { onConflict: "product_id,run_date" });
    }
    await finishRun(runId, "ok", { ranked: scored.length });
    return new Response(JSON.stringify({ ok: true, ranked: scored.length, top10: scored.slice(0, 10) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    await finishRun(runId, "error", {}, e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});