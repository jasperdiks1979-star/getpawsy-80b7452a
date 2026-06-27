// Phase 9 — Pinterest Market Intelligence Platform
// Read-only aggregator over existing market_*, pinterest_*, ee_p2_*, paip_*, agp_*
// tables. NO publishing, NO mutations to production data. Recommendations flow
// into the existing Execution Center via market_ai_recommendations.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function score(arr: number[]): number {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

async function aggregate() {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const today = new Date().toISOString().slice(0, 10);

  const [
    trends, clusters, opportunities, recs, priority, products,
    competitorPatterns, competitorOpps, gapActions, seasonal,
    pinPerf, boards, keywordTrends, visualDna,
  ] = await Promise.all([
    sb.from("market_trending_products").select("*").order("score", { ascending: false }).limit(100),
    sb.from("market_trend_clusters").select("*").order("signal_score", { ascending: false }).limit(40),
    sb.from("market_opportunity_gaps").select("*").order("impact_score", { ascending: false }).limit(100),
    sb.from("market_ai_recommendations").select("*").eq("status", "pending").order("confidence", { ascending: false }).limit(100),
    sb.from("market_product_priority").select("*").eq("day", today).order("rank", { ascending: true }).limit(50),
    sb.from("market_product_scores").select("*").order("composite_score", { ascending: false }).limit(100),
    sb.from("pinterest_competitor_patterns").select("*").order("avg_success", { ascending: false }).limit(40),
    sb.from("pinterest_competitor_opportunities").select("*").order("gap_score", { ascending: false }).limit(50),
    sb.from("market_gap_action_items").select("*").order("impact_score", { ascending: false }).limit(50),
    sb.from("pinterest_trend_signals").select("*").order("score", { ascending: false }).limit(60),
    sb.from("pinterest_pin_performance").select("pin_id,product_id,impressions,saves,outbound_clicks,ctr").order("impressions", { ascending: false }).limit(100),
    sb.from("pinterest_board_performance").select("*").order("revenue", { ascending: false }).limit(20),
    sb.from("pmin_keyword_trends").select("*").order("trend_score", { ascending: false }).limit(100),
    sb.from("ee_p2_image_dna").select("*").limit(100),
  ]);

  // Module 1 — Market Overview
  const trendList = (trends.data ?? []) as any[];
  const clusterList = (clusters.data ?? []) as any[];
  const opps = (opportunities.data ?? []) as any[];
  const trendVelocity = score(clusterList.map((c) => Number(c.velocity ?? 0) * 50));
  const marketScore = score([
    score(trendList.slice(0, 20).map((t) => Number(t.score ?? 0))),
    trendVelocity,
    score(opps.slice(0, 20).map((o) => Number(o.impact_score ?? 0))),
  ]);
  const emerging = clusterList.filter((c) => ["emerging", "rising"].includes(c.status));
  const declining = clusterList.filter((c) => ["declining", "peaked"].includes(c.status));

  // Module 7 — Seasonal calendar (next 90 days)
  const seasonalSignals = (seasonal.data ?? []) as any[];
  const seasonalCalendar = seasonalSignals
    .filter((s) => s.source === "seasonal" || s.category === "seasonal")
    .slice(0, 30);

  // Module 8 — Content gap detector (already in market_gap_action_items)
  const contentGaps = (gapActions.data ?? []) as any[];

  // Module 10 — Product Match Engine
  const pinPerfByProduct = new Map<string, { imp: number; clk: number; ctr: number }>();
  for (const p of (pinPerf.data ?? []) as any[]) {
    if (!p.product_id) continue;
    const cur = pinPerfByProduct.get(p.product_id) ?? { imp: 0, clk: 0, ctr: 0 };
    cur.imp += Number(p.impressions ?? 0);
    cur.clk += Number(p.outbound_clicks ?? 0);
    cur.ctr = Math.max(cur.ctr, Number(p.ctr ?? 0));
    pinPerfByProduct.set(p.product_id, cur);
  }
  const topProducts = ((priority.data ?? []) as any[]).map((p) => {
    const perf = pinPerfByProduct.get(p.product_id);
    return {
      product_id: p.product_id,
      rank: p.rank,
      composite_score: p.composite_score,
      pinterest_score: perf ? Math.min(100, Math.round((perf.ctr || 0) * 100 + Math.log10((perf.imp || 1) + 1) * 10)) : null,
      recommended_channels: p.recommended_channels,
      rationale: p.rationale,
    };
  });

  return {
    generated_at: new Date().toISOString(),
    data_freshness_minutes: 60,
    overview: {
      market_score: marketScore,
      us_opportunity_score: score(opps.slice(0, 10).map((o) => Number(o.impact_score ?? 0))),
      competition_level: clusterList.length > 30 ? "high" : clusterList.length > 15 ? "medium" : "low",
      demand_trend: trendVelocity > 40 ? "growing" : trendVelocity > 20 ? "stable" : "declining",
      market_confidence: Math.min(100, 40 + clusterList.length + opps.length),
      top_opportunities: opps.slice(0, 20),
      top_threats: declining.slice(0, 20),
      emerging_count: emerging.length,
      declining_count: declining.length,
    },
    trends: { clusters: clusterList, trending_products: trendList.slice(0, 50) },
    keywords: (keywordTrends.data ?? []),
    competitors: { patterns: competitorPatterns.data ?? [], opportunities: competitorOpps.data ?? [] },
    visual_trends: { dna_samples: visualDna.data ?? [] },
    categories: (products.data ?? []),
    seasonal: seasonalCalendar,
    content_gaps: contentGaps,
    us_market: { boards: boards.data ?? [] },
    product_match: topProducts,
    recommendations: recs.data ?? [],
    counts: {
      trends: trendList.length,
      clusters: clusterList.length,
      opportunities: opps.length,
      recommendations: (recs.data ?? []).length,
      gaps: contentGaps.length,
      keywords: (keywordTrends.data ?? []).length,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const data = await aggregate();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});