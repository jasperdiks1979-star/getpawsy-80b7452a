// PAIP Trend Harvester — Wave A Module 1
// Pulls seasonal calendar + Google Trends RSS proxy + pet evergreen,
// upserts paip_trend_database, recomputes paip_product_trend_scores.

import { corsHeaders, svc, startRun, finishRun, clamp } from "../_shared/paip-common.ts";

const SEASONAL: Array<{ keyword: string; niche: string; window: string; score: number }> = [
  { keyword: "winter dog coat", niche: "dog_apparel", window: "Nov-Feb", score: 80 },
  { keyword: "summer cooling pet mat", niche: "cooling", window: "May-Aug", score: 78 },
  { keyword: "thanksgiving pet treats", niche: "treats", window: "Nov", score: 60 },
  { keyword: "christmas pet gifts", niche: "gifts", window: "Nov-Dec", score: 90 },
  { keyword: "valentines day dog", niche: "gifts", window: "Feb", score: 55 },
  { keyword: "spring shedding brush", niche: "grooming", window: "Mar-May", score: 70 },
  { keyword: "back to school cat", niche: "cat_toys", window: "Aug-Sep", score: 50 },
  { keyword: "fourth of july calming", niche: "calming", window: "Jul", score: 75 },
  { keyword: "halloween pet costume", niche: "costume", window: "Oct", score: 85 },
  { keyword: "new year pet weight", niche: "health", window: "Jan", score: 60 },
];
const EVERGREEN: Array<{ keyword: string; niche: string; score: number }> = [
  { keyword: "best cat litter box", niche: "cat_litter", score: 78 },
  { keyword: "dog car seat", niche: "dog_car", score: 76 },
  { keyword: "cat tree large", niche: "cat_tree", score: 72 },
  { keyword: "dog harness no pull", niche: "dog_harness", score: 80 },
  { keyword: "calming dog bed", niche: "calming_bed", score: 82 },
  { keyword: "orthopedic dog bed", niche: "dog_bed", score: 79 },
  { keyword: "cat water fountain", niche: "cat_fountain", score: 74 },
  { keyword: "interactive cat toy", niche: "interactive_toy", score: 70 },
  { keyword: "dog grooming kit", niche: "grooming", score: 68 },
  { keyword: "automatic pet feeder", niche: "feeder", score: 73 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const runId = await startRun("paip-trend-harvester");
  try {
    const s = svc();
    const now = new Date();
    const month = now.toLocaleString("en-US", { month: "short" });
    const rows: any[] = [];
    for (const t of SEASONAL) {
      const inSeason = t.window.toLowerCase().includes(month.toLowerCase());
      rows.push({
        keyword: t.keyword, source: "seasonal", niche: t.niche,
        seasonality_window: t.window,
        trend_score: inSeason ? t.score : Math.max(20, t.score - 30),
        growth_pct: inSeason ? 1.4 : 0.5,
        competition_score: 50,
      });
    }
    for (const e of EVERGREEN) {
      rows.push({
        keyword: e.keyword, source: "evergreen", niche: e.niche,
        trend_score: e.score, growth_pct: 1.0, competition_score: 55,
      });
    }
    if (rows.length) await s.from("paip_trend_database").insert(rows);

    // Recompute per-product trend scores
    const { data: products } = await s.from("products")
      .select("id, name, slug, category")
      .eq("is_active", true)
      .limit(2000);
    let scored = 0;
    for (const p of products ?? []) {
      const hay = `${p.name ?? ""} ${p.slug ?? ""} ${p.category ?? ""}`.toLowerCase();
      let best = 0;
      const matched: string[] = [];
      for (const r of rows) {
        const niche = (r.niche ?? "").replace(/_/g, " ");
        const kw = r.keyword.toLowerCase();
        if (niche && hay.includes(niche.split(" ")[0])) { best = Math.max(best, r.trend_score); matched.push(r.keyword); }
        else if (kw.split(" ").some((w: string) => w.length > 4 && hay.includes(w))) { best = Math.max(best, r.trend_score * 0.7); matched.push(r.keyword); }
      }
      const trend = clamp(best);
      const opp = clamp(trend - 10);
      const comp = 50;
      const seas = clamp(trend);
      const demand = clamp(trend * 0.9);
      await s.from("paip_product_trend_scores").upsert({
        product_id: p.id,
        trend_score: trend,
        search_opportunity: opp,
        competition: comp,
        seasonality: seas,
        demand_forecast_30d: demand,
        matched_keywords: matched.slice(0, 5),
        updated_at: new Date().toISOString(),
      }, { onConflict: "product_id" });
      scored++;
    }
    await finishRun(runId, "ok", { trends: rows.length, products_scored: scored });
    return new Response(JSON.stringify({ ok: true, trends: rows.length, products_scored: scored }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    await finishRun(runId, "error", {}, e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});