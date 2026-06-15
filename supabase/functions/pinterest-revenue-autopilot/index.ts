// Pinterest Revenue Autopilot
//
// Nightly orchestrator that turns Pinterest from a publishing engine into a
// revenue-optimization engine. Computes per-product revenue scores, classifies
// products into 5 tiers (superstar/winner/average/weak/dead), allocates
// publishing budget by tier (40/30/20/8/2) with a 20% discovery reserve,
// ranks boards by revenue performance, and writes an immutable daily report
// snapshot. Safe to call manually (POST {}) at any time.
//
// Reads: pinterest_revenue_attribution_v3, pinterest_analytics_daily,
//        pinterest_pin_queue, pinterest_boards, products
// Writes: pinterest_revenue_product_tiers, pinterest_board_performance,
//         pinterest_revenue_daily_reports
//
// No AI Gateway calls. Pure SQL aggregation + scoring.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Winner score weights (revenue dominates, impressions barely count)
const W = {
  revenue: 10.0,
  purchases: 4.0,
  add_to_carts: 1.5,
  clicks: 0.8,
  saves: 0.2,
  impressions: 0.005,
};

// Tier budget allocation (Phase 3)
const TIER_ALLOCATION = {
  superstar: 0.40,
  winner: 0.30,
  average: 0.20,
  weak: 0.08,
  dead: 0.02,
} as const;
// Phase 5: 20% of every run reserved for new-product discovery (overrides above)
const DISCOVERY_RESERVE = 0.20;

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function scoreOf(r: {
  revenue_cents: number;
  purchases: number;
  add_to_carts: number;
  clicks: number;
  saves: number;
  impressions: number;
}) {
  return (
    (r.revenue_cents / 100) * W.revenue +
    r.purchases * W.purchases +
    r.add_to_carts * W.add_to_carts +
    r.clicks * W.clicks +
    r.saves * W.saves +
    r.impressions * W.impressions
  );
}

function classify(score: number, hasData: boolean): keyof typeof TIER_ALLOCATION | "discovery" {
  if (!hasData) return "discovery";
  if (score >= 200) return "superstar";
  if (score >= 60) return "winner";
  if (score >= 10) return "average";
  if (score > 0) return "weak";
  return "dead";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const startedAt = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();

  // ---------------------------------------------------------------
  // 1. PULL ATTRIBUTION (per-pin revenue, 30-day window)
  // ---------------------------------------------------------------
  const { data: attribRows, error: attribErr } = await supabase
    .from("pinterest_revenue_attribution_v3")
    .select(
      "pin_id, product_id, product_slug, board, category, impressions, clicks, saves, product_views, add_to_carts, checkouts, purchases, revenue_cents",
    )
    .eq("window_days", 30);

  if (attribErr) return json({ ok: false, stage: "attribution_read", error: attribErr.message }, 500);

  // ---------------------------------------------------------------
  // 2. AGGREGATE PER PRODUCT
  // ---------------------------------------------------------------
  type Agg = {
    product_id: string;
    product_slug: string | null;
    category: string | null;
    impressions: number;
    clicks: number;
    saves: number;
    product_views: number;
    add_to_carts: number;
    checkouts: number;
    purchases: number;
    revenue_cents: number;
  };
  const perProduct = new Map<string, Agg>();
  const perBoard = new Map<string, Agg & { board: string }>();

  for (const r of attribRows ?? []) {
    if (r.product_id) {
      const cur = perProduct.get(r.product_id) ?? {
        product_id: r.product_id,
        product_slug: r.product_slug,
        category: r.category,
        impressions: 0, clicks: 0, saves: 0, product_views: 0,
        add_to_carts: 0, checkouts: 0, purchases: 0, revenue_cents: 0,
      };
      cur.impressions += r.impressions ?? 0;
      cur.clicks += r.clicks ?? 0;
      cur.saves += r.saves ?? 0;
      cur.product_views += r.product_views ?? 0;
      cur.add_to_carts += r.add_to_carts ?? 0;
      cur.checkouts += r.checkouts ?? 0;
      cur.purchases += r.purchases ?? 0;
      cur.revenue_cents += Number(r.revenue_cents ?? 0);
      perProduct.set(r.product_id, cur);
    }
    if (r.board) {
      const cur = perBoard.get(r.board) ?? {
        board: r.board,
        product_id: "", product_slug: null, category: null,
        impressions: 0, clicks: 0, saves: 0, product_views: 0,
        add_to_carts: 0, checkouts: 0, purchases: 0, revenue_cents: 0,
      };
      cur.impressions += r.impressions ?? 0;
      cur.clicks += r.clicks ?? 0;
      cur.saves += r.saves ?? 0;
      cur.product_views += r.product_views ?? 0;
      cur.add_to_carts += r.add_to_carts ?? 0;
      cur.purchases += r.purchases ?? 0;
      cur.revenue_cents += Number(r.revenue_cents ?? 0);
      perBoard.set(r.board, cur);
    }
  }

  // ---------------------------------------------------------------
  // 3. PULL ACTIVE PRODUCTS (so dead products without attribution still get scored)
  // ---------------------------------------------------------------
  const { data: activeProducts } = await supabase
    .from("products")
    .select("id, slug, category")
    .eq("is_active", true)
    .eq("is_duplicate", false)
    .limit(2000);

  // ---------------------------------------------------------------
  // 4. CLASSIFY PRODUCTS
  // ---------------------------------------------------------------
  type TierRow = {
    product_id: string;
    product_slug: string | null;
    category_key: string | null;
    tier: string;
    score: number;
    publish_weight: number;
    impressions_30d: number;
    clicks_30d: number;
    saves_30d: number;
    product_views_30d: number;
    add_to_carts_30d: number;
    purchases_30d: number;
    revenue_cents_30d: number;
    computed_at: string;
  };
  const tierRows: TierRow[] = [];
  const tierCounts: Record<string, number> = {
    superstar: 0, winner: 0, average: 0, weak: 0, dead: 0, discovery: 0,
  };

  for (const p of activeProducts ?? []) {
    const a = perProduct.get(p.id);
    const score = a ? scoreOf(a) : 0;
    const tier = classify(score, !!a);
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    const weight =
      tier === "superstar" ? 8 :
      tier === "winner" ? 4 :
      tier === "average" ? 2 :
      tier === "weak" ? 0.8 :
      tier === "dead" ? 0.2 :
      /* discovery */ 1;
    tierRows.push({
      product_id: p.id,
      product_slug: p.slug ?? null,
      category_key: (p.category as string | null) ?? null,
      tier,
      score: Number(score.toFixed(2)),
      publish_weight: weight,
      impressions_30d: a?.impressions ?? 0,
      clicks_30d: a?.clicks ?? 0,
      saves_30d: a?.saves ?? 0,
      product_views_30d: a?.product_views ?? 0,
      add_to_carts_30d: a?.add_to_carts ?? 0,
      purchases_30d: a?.purchases ?? 0,
      revenue_cents_30d: a?.revenue_cents ?? 0,
      computed_at: new Date().toISOString(),
    });
  }

  // Upsert tier rows
  if (tierRows.length) {
    const { error: upErr } = await supabase
      .from("pinterest_revenue_product_tiers")
      .upsert(tierRows, { onConflict: "product_id" });
    if (upErr) return json({ ok: false, stage: "tier_upsert", error: upErr.message }, 500);
  }

  // ---------------------------------------------------------------
  // 5. BOARD PERFORMANCE
  // ---------------------------------------------------------------
  const { data: boardsRows } = await supabase
    .from("pinterest_boards")
    .select("id, name");
  const boardIdByName = new Map<string, string>((boardsRows ?? []).map((b) => [b.name as string, b.id as string]));

  const boardArr = [...perBoard.values()];
  boardArr.sort((a, b) => b.revenue_cents - a.revenue_cents || b.purchases - a.purchases || b.clicks - a.clicks);
  const boardUpserts = boardArr.map((b, i) => {
    const ctr = b.impressions > 0 ? b.clicks / b.impressions : 0;
    const purchase_rate = b.clicks > 0 ? b.purchases / b.clicks : 0;
    const classification =
      i < Math.max(3, Math.ceil(boardArr.length * 0.2)) ? "top" :
      i < Math.ceil(boardArr.length * 0.6) ? "average" : "weak";
    const publish_weight =
      classification === "top" ? 3 :
      classification === "average" ? 1 :
      0.3; // never zero — Phase 8 diversity rule
    return {
      board_name: b.board,
      board_id: boardIdByName.get(b.board) ?? null,
      impressions_30d: b.impressions,
      clicks_30d: b.clicks,
      saves_30d: b.saves,
      purchases_30d: b.purchases,
      revenue_cents_30d: b.revenue_cents,
      ctr: Number(ctr.toFixed(5)),
      purchase_rate: Number(purchase_rate.toFixed(5)),
      rank: i + 1,
      publish_weight,
      classification,
      computed_at: new Date().toISOString(),
    };
  });
  if (boardUpserts.length) {
    const { error: bErr } = await supabase
      .from("pinterest_board_performance")
      .upsert(boardUpserts, { onConflict: "board_name" });
    if (bErr) return json({ ok: false, stage: "board_upsert", error: bErr.message }, 500);
  }

  // ---------------------------------------------------------------
  // 6. TODAY'S PUBLISHING + AGGREGATE TOTALS
  // ---------------------------------------------------------------
  const todayStart = new Date(today + "T00:00:00Z").toISOString();
  const { count: pinsPublishedToday } = await supabase
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "posted")
    .gte("posted_at", todayStart);

  let totalImpr = 0, totalClicks = 0, totalSaves = 0, totalViews = 0,
      totalAtc = 0, totalCheckouts = 0, totalPurch = 0, totalRev = 0;
  for (const r of attribRows ?? []) {
    totalImpr += r.impressions ?? 0;
    totalClicks += r.clicks ?? 0;
    totalSaves += r.saves ?? 0;
    totalViews += r.product_views ?? 0;
    totalAtc += r.add_to_carts ?? 0;
    totalCheckouts += r.checkouts ?? 0;
    totalPurch += r.purchases ?? 0;
    totalRev += Number(r.revenue_cents ?? 0);
  }

  // Top products/boards/losers
  const sortedProducts = [...tierRows].sort((a, b) => b.revenue_cents_30d - a.revenue_cents_30d);
  const topProducts = sortedProducts.slice(0, 10).map((p) => ({
    product_id: p.product_id,
    slug: p.product_slug,
    tier: p.tier,
    revenue_cents: p.revenue_cents_30d,
    purchases: p.purchases_30d,
    clicks: p.clicks_30d,
    score: p.score,
  }));
  const biggestLosers = sortedProducts
    .filter((p) => p.impressions_30d > 200 && p.purchases_30d === 0)
    .slice(0, 10)
    .map((p) => ({
      product_id: p.product_id,
      slug: p.product_slug,
      tier: p.tier,
      impressions: p.impressions_30d,
      clicks: p.clicks_30d,
    }));
  const topBoards = boardUpserts.slice(0, 10).map((b) => ({
    board: b.board_name,
    revenue_cents: b.revenue_cents_30d,
    purchases: b.purchases_30d,
    clicks: b.clicks_30d,
    ctr: b.ctr,
    classification: b.classification,
  }));

  // ---------------------------------------------------------------
  // 7. DAILY REPORT SNAPSHOT (immutable per date)
  // ---------------------------------------------------------------
  const reportRow = {
    report_date: today,
    pinterest_visitors: totalClicks,
    product_views: totalViews,
    add_to_carts: totalAtc,
    checkouts: totalCheckouts,
    purchases: totalPurch,
    revenue_cents: totalRev,
    pins_published: pinsPublishedToday ?? 0,
    superstar_count: tierCounts.superstar,
    winner_count: tierCounts.winner,
    average_count: tierCounts.average,
    weak_count: tierCounts.weak,
    dead_count: tierCounts.dead,
    top_products: topProducts,
    top_boards: topBoards,
    biggest_losers: biggestLosers,
    allocation: {
      tier_weights: TIER_ALLOCATION,
      discovery_reserve: DISCOVERY_RESERVE,
      tier_counts: tierCounts,
    },
  };
  const { error: repErr } = await supabase
    .from("pinterest_revenue_daily_reports")
    .upsert(reportRow, { onConflict: "report_date" });
  if (repErr) return json({ ok: false, stage: "report_upsert", error: repErr.message }, 500);

  return json({
    ok: true,
    ran_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    window_days: 30,
    products_classified: tierRows.length,
    tier_counts: tierCounts,
    boards_ranked: boardUpserts.length,
    report_date: today,
    totals: {
      visitors: totalClicks,
      product_views: totalViews,
      add_to_carts: totalAtc,
      purchases: totalPurch,
      revenue_cents: totalRev,
      pins_published_today: pinsPublishedToday ?? 0,
    },
    top_products: topProducts.slice(0, 5),
    top_boards: topBoards.slice(0, 5),
    allocation: { tier_weights: TIER_ALLOCATION, discovery_reserve: DISCOVERY_RESERVE },
    ai_calls_attempted: 0,
  });
});