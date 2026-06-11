// Pinterest Revenue Brain — Phase 5
// Surgical extension. Reuses Spy / Growth / Brain / Competitor Intel / Product Tiers.
// Actions: score | forecast | trends | mine_opportunities | auto_promote | run_full | report
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Json = Record<string, unknown>;

const WEIGHTS = {
  competitor_success: 0.15,
  engagement: 0.12,
  margin: 0.12,
  price_competitiveness: 0.08,
  reviews: 0.08,
  demand: 0.10,
  trend_momentum: 0.12,
  saturation_inverse: 0.06,
  current_traffic: 0.05,
  inventory: 0.04,
  conversion_rate: 0.08,
} as const;

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

async function loadProducts(limit?: number) {
  let q = supa.from("products").select("id, slug, name, price, margin_percent, is_active, image_url, stock").eq("is_active", true).not("image_url", "is", null).order("price", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function loadCompetitorIndex() {
  const { data } = await supa.from("pinterest_competitor_opportunities").select("product_id, competitor_gap_score");
  const map = new Map<string, number>();
  for (const r of data ?? []) map.set(r.product_id as string, Number(r.competitor_gap_score ?? 0));
  return map;
}

async function loadEngagementIndex() {
  const { data } = await supa.from("pinterest_pin_performance").select("product_id, impressions, clicks, saves").not("product_id", "is", null);
  const agg = new Map<string, { imp: number; clk: number; sv: number }>();
  for (const r of data ?? []) {
    const pid = r.product_id as string;
    const cur = agg.get(pid) ?? { imp: 0, clk: 0, sv: 0 };
    cur.imp += Number(r.impressions ?? 0);
    cur.clk += Number(r.clicks ?? 0);
    cur.sv += Number(r.saves ?? 0);
    agg.set(pid, cur);
  }
  return agg;
}

async function loadTierIndex() {
  const { data } = await supa.from("pinterest_product_tiers").select("product_id, revenue_bucket, hidden_opportunity, score, clicks_30d, impressions_30d, revenue_cents_30d, purchases_30d").limit(5000);
  const map = new Map<string, Record<string, unknown>>();
  for (const r of data ?? []) map.set(r.product_id as string, r as Record<string, unknown>);
  return map;
}

async function loadPdpStats() {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await supa.from("pinterest_pdp_conversion_stats").select("product_id, views, atc, checkout, purchases").gte("day", since.slice(0, 10));
  const agg = new Map<string, { views: number; atc: number; co: number; pu: number }>();
  for (const r of data ?? []) {
    const pid = r.product_id as string;
    const cur = agg.get(pid) ?? { views: 0, atc: 0, co: 0, pu: 0 };
    cur.views += Number(r.views ?? 0);
    cur.atc += Number(r.atc ?? 0);
    cur.co += Number(r.checkout ?? 0);
    cur.pu += Number(r.purchases ?? 0);
    agg.set(pid, cur);
  }
  return agg;
}

async function loadReviewIndex() {
  const { data } = await supa.from("product_reviews").select("product_id, rating");
  const m = new Map<string, { n: number; sum: number }>();
  for (const r of data ?? []) {
    const pid = r.product_id as string;
    const cur = m.get(pid) ?? { n: 0, sum: 0 };
    cur.n += 1;
    cur.sum += Number(r.rating ?? 0);
    m.set(pid, cur);
  }
  return m;
}

async function computeTrendIntel() {
  // Internal proxy: keyword bank deltas (last 14d vs prior 14d clicks/impressions).
  const now = Date.now();
  const since30 = new Date(now - 30 * 86400_000).toISOString();
  const { data: kw } = await supa.from("pinterest_keyword_bank").select("keyword, impressions_30d, clicks_30d, updated_at").gte("updated_at", since30).limit(2000);
  const rows: { keyword: string; source: string; velocity: number; direction: string; seasonality_score: number; growth_rate: number; computed_at: string }[] = [];
  for (const k of kw ?? []) {
    const imp = Number((k as Record<string, unknown>).impressions_30d ?? 0);
    const clk = Number((k as Record<string, unknown>).clicks_30d ?? 0);
    const ctr = imp > 0 ? clk / imp : 0;
    const velocity = clamp(ctr * 10, -1, 1);
    const direction = velocity > 0.15 ? "rising" : velocity < -0.05 ? "declining" : "stable";
    rows.push({
      keyword: String((k as Record<string, unknown>).keyword ?? "").toLowerCase().slice(0, 120),
      source: "internal",
      velocity,
      direction,
      seasonality_score: 0,
      growth_rate: velocity,
      computed_at: new Date().toISOString(),
    });
  }
  if (rows.length) await supa.from("pinterest_trend_intelligence").upsert(rows, { onConflict: "keyword,source" });
  return rows.length;
}

function priceCompetitiveness(price: number | null): number {
  if (!price || price <= 0) return 0.4;
  if (price <= 15) return 1;
  if (price <= 35) return 0.85;
  if (price <= 60) return 0.7;
  if (price <= 100) return 0.5;
  return 0.3;
}

function demandScore(tier: Record<string, unknown> | undefined): number {
  const clicks = Number(tier?.clicks_30d ?? 0);
  return clamp(Math.log10(1 + clicks) / 3);
}

function saturationInverse(tier: Record<string, unknown> | undefined): number {
  const imp = Number(tier?.impressions_30d ?? 0);
  // Higher impressions ⇒ already saturated ⇒ lower opportunity inverse.
  return clamp(1 - Math.log10(1 + imp) / 5);
}

function inventoryScore(stock: number | null): number {
  const s = Number(stock ?? 0);
  if (s <= 0) return 0.1;
  if (s < 5) return 0.4;
  if (s < 25) return 0.8;
  return 1;
}

function reviewScore(r: { n: number; sum: number } | undefined): number {
  if (!r || r.n === 0) return 0.45;
  const avg = r.sum / r.n;
  const trust = clamp(r.n / 25);
  return clamp((avg / 5) * 0.7 + trust * 0.3);
}

async function scoreAll(dry: boolean, limit?: number) {
  const [products, comp, eng, tiers, pdp, reviews] = await Promise.all([
    loadProducts(limit),
    loadCompetitorIndex(),
    loadEngagementIndex(),
    loadTierIndex(),
    loadPdpStats(),
    loadReviewIndex(),
  ]);
  // Trend momentum: avg internal velocity over all keywords (single value applied uniformly; per-product later).
  const { data: trendRows } = await supa.from("pinterest_trend_intelligence").select("velocity").limit(2000);
  const avgVel = (trendRows ?? []).reduce((s, r) => s + Number(r.velocity ?? 0), 0) / Math.max(1, (trendRows ?? []).length);
  const trendBase = clamp((avgVel + 1) / 2);

  const scoreRows: Json[] = [];
  const forecastRows: Json[] = [];
  let opportunities = 0;
  const now = new Date().toISOString();

  for (const p of products) {
    const pid = p.id as string;
    const tier = tiers.get(pid);
    const e = eng.get(pid);
    const r = reviews.get(pid);
    const pdpS = pdp.get(pid);

    const competitor_success = clamp(Number(comp.get(pid) ?? 0) / 100);
    const engagement = e && e.imp > 0 ? clamp((e.clk + e.sv * 2) / Math.max(e.imp, 1) * 30) : 0.2;
    const margin = clamp(Number(p.margin_percent ?? 0.3));
    const price_competitiveness = priceCompetitiveness(Number(p.price));
    const reviewsS = reviewScore(r);
    const demand = demandScore(tier);
    const trend_momentum = trendBase;
    const saturation_inverse = saturationInverse(tier);
    const current_traffic = clamp(Math.log10(1 + Number(tier?.clicks_30d ?? 0)) / 3);
    const inventory = inventoryScore(Number(p.stock ?? 0));
    const cvr = pdpS && pdpS.views > 0 ? pdpS.pu / pdpS.views : 0.025;
    const conversion_rate = clamp(cvr * 20);

    const components = { competitor_success, engagement, margin, price_competitiveness, reviews: reviewsS, demand, trend_momentum, saturation_inverse, current_traffic, inventory, conversion_rate };
    const raw =
      WEIGHTS.competitor_success * competitor_success +
      WEIGHTS.engagement * engagement +
      WEIGHTS.margin * margin +
      WEIGHTS.price_competitiveness * price_competitiveness +
      WEIGHTS.reviews * reviewsS +
      WEIGHTS.demand * demand +
      WEIGHTS.trend_momentum * trend_momentum +
      WEIGHTS.saturation_inverse * saturation_inverse +
      WEIGHTS.current_traffic * current_traffic +
      WEIGHTS.inventory * inventory +
      WEIGHTS.conversion_rate * conversion_rate;
    const score = Math.round(raw * 1000);

    const bestseller_p = clamp(sigmoid((Number(tier?.purchases_30d ?? 0) - 2) * 1.2));
    const viral_p = clamp(engagement * 0.6 + trend_momentum * 0.4);
    const repeat_p = clamp(reviewsS * 0.5 + margin * 0.3 + (pdpS && pdpS.pu > 1 ? 0.2 : 0));

    let bucket = "neutral";
    if (score >= 800) bucket = "winner";
    else if (score >= 700 && competitor_success > 0.5 && saturation_inverse > 0.5) bucket = "high_opp";
    else if (score >= 500) bucket = "watch";
    else if (score < 250) bucket = "skip";
    if (bucket === "high_opp" || (score >= 700 && competitor_success > 0.7)) opportunities += 1;

    scoreRows.push({
      product_id: pid,
      product_slug: p.slug,
      score_0_1000: score,
      components,
      bestseller_p,
      viral_p,
      repeat_p,
      tier: bucket,
      computed_at: now,
      updated_at: now,
    });

    // forecasts
    const dailyClicks = Math.max(1, Number(tier?.clicks_30d ?? 0) / 30);
    const trendBoost = score >= 700 ? 1.35 : score >= 500 ? 1.1 : 0.85;
    const atcRate = pdpS && pdpS.views > 0 ? pdpS.atc / pdpS.views : 0.06;
    const coRate = pdpS && pdpS.views > 0 ? pdpS.co / pdpS.views : 0.035;
    const cvrRate = pdpS && pdpS.views > 0 ? pdpS.pu / pdpS.views : 0.025;
    const aov = Number(p.price ?? 35);
    for (const horizon of [7, 30, 90]) {
      const sessions = Math.round(dailyClicks * horizon * trendBoost);
      const atc = Math.round(sessions * atcRate);
      const checkouts = Math.round(sessions * coRate);
      const purchases = Math.round(sessions * cvrRate);
      const revenue_cents = Math.round(purchases * aov * 100);
      const confidence = clamp(Math.log10(1 + Number(tier?.clicks_30d ?? 0)) / 3);
      forecastRows.push({ product_id: pid, horizon, sessions, atc, checkouts, purchases, revenue_cents, confidence, computed_at: now });
    }
  }

  if (!dry) {
    // Chunked upserts
    for (let i = 0; i < scoreRows.length; i += 500) {
      await supa.from("pinterest_revenue_opportunity_scores").upsert(scoreRows.slice(i, i + 500), { onConflict: "product_id" });
    }
    for (let i = 0; i < forecastRows.length; i += 500) {
      await supa.from("pinterest_revenue_forecasts").upsert(forecastRows.slice(i, i + 500), { onConflict: "product_id,horizon" });
    }
  }

  scoreRows.sort((a, b) => Number(b.score_0_1000) - Number(a.score_0_1000));
  return { products_scanned: products.length, scores_written: scoreRows.length, forecasts_written: forecastRows.length, opportunities, top: scoreRows.slice(0, 20) };
}

async function autoPromote(dry: boolean) {
  const { data: top } = await supa
    .from("pinterest_revenue_opportunity_scores")
    .select("product_id, product_slug, score_0_1000, tier")
    .gte("score_0_1000", 700)
    .order("score_0_1000", { ascending: false })
    .limit(25);
  let promoted = 0;
  const promotedIds: string[] = [];
  for (const t of top ?? []) {
    promotedIds.push(t.product_id as string);
    if (dry) continue;
    // Bump priority on any queued or draft pins for this product
    await supa.from("pinterest_pin_queue").update({ priority: 95 }).eq("product_id", t.product_id).in("status", ["queued", "draft"]);
    // Delegate to creative director for 10 image drafts + 3 video drafts
    try {
      await supa.functions.invoke("pinterest-creative-director", {
        body: { action: "run_full", product_id: t.product_id, count: 10, video_count: 3, source: "revenue_brain", seo_mode: true },
      });
      promoted += 1;
    } catch (_) { /* swallow per-product errors */ }
  }
  return { promoted, candidates: promotedIds };
}

async function runFull(dry: boolean, limit?: number) {
  const started = new Date().toISOString();
  const trends = await computeTrendIntel();
  const score = await scoreAll(dry, limit);
  const promote = await autoPromote(dry);
  const finished = new Date().toISOString();
  const run = {
    started_at: started,
    finished_at: finished,
    mode: dry ? "dry_run" : "cron",
    products_scanned: score.products_scanned,
    scores_written: dry ? 0 : score.scores_written,
    forecasts_written: dry ? 0 : score.forecasts_written,
    opportunities_found: score.opportunities,
    drafts_promoted: promote.promoted,
    top_products: score.top.slice(0, 20),
    health: { trends_written: trends, ok: true },
    errors: 0,
  };
  if (!dry) await supa.from("pinterest_revenue_brain_runs").insert(run);
  return { ...run, top_products: score.top.slice(0, 20) };
}

async function report() {
  const [{ data: top }, { data: forecasts7 }, { data: forecasts30 }, { data: forecasts90 }, { data: lastRun }] = await Promise.all([
    supa.from("pinterest_revenue_opportunity_scores").select("*").order("score_0_1000", { ascending: false }).limit(100),
    supa.from("pinterest_revenue_forecasts").select("sessions, purchases, revenue_cents").eq("horizon", 7),
    supa.from("pinterest_revenue_forecasts").select("sessions, purchases, revenue_cents").eq("horizon", 30),
    supa.from("pinterest_revenue_forecasts").select("sessions, purchases, revenue_cents").eq("horizon", 90),
    supa.from("pinterest_revenue_brain_runs").select("*").order("started_at", { ascending: false }).limit(1),
  ]);
  const sum = (rows: { sessions: number | null; purchases: number | null; revenue_cents: number | null }[] | null) =>
    (rows ?? []).reduce((acc, r) => ({
      sessions: acc.sessions + Number(r.sessions ?? 0),
      purchases: acc.purchases + Number(r.purchases ?? 0),
      revenue_cents: acc.revenue_cents + Number(r.revenue_cents ?? 0),
    }), { sessions: 0, purchases: 0, revenue_cents: 0 });
  return {
    top_winners: (top ?? []).slice(0, 20),
    top100: top ?? [],
    totals: { d7: sum(forecasts7), d30: sum(forecasts30), d90: sum(forecasts90) },
    last_run: lastRun?.[0] ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = (body.action ?? new URL(req.url).searchParams.get("action") ?? "run_full") as string;
    const dry = Boolean(body.dry_run);
    const limit = body.limit ? Number(body.limit) : undefined;

    let result: unknown;
    switch (action) {
      case "trends": result = { trends_written: await computeTrendIntel() }; break;
      case "score": result = await scoreAll(dry, limit); break;
      case "auto_promote": result = await autoPromote(dry); break;
      case "report": result = await report(); break;
      case "run_full":
      default: result = await runFull(dry, limit); break;
    }
    return new Response(JSON.stringify({ ok: true, action, ...((result ?? {}) as Json) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});