// ─────────────────────────────────────────────────────────────────────────────
// pinterest-growth-ai
// ─────────────────────────────────────────────────────────────────────────────
// Revenue-optimization brain that REUSES existing engines. No new tables, no
// new dashboard. Reads production signals from existing tables, produces the
// Growth AI snapshot consumed by PinterestHealthPage, then:
//   • Logs every recommendation to pinterest_evolution_log (decision_type='growth_ai').
//   • Persists the snapshot to pinterest_ops_snapshots (existing table).
//   • Triggers pinterest-creative-factory for the #1 winner product (Winner
//     Multiplier) when not in dry-run mode.
//
// Modes:
//   GET                       → snapshot only (read-only)
//   POST {dry_run:true}       → compute + log + persist, but no engine calls
//   POST {} or POST {run:1}   → full execution (default)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Snap = {
  generatedAt: string;
  baseline: {
    avgCtr: number;
    avgRevenuePerPin: number;
    pinsWithRevenue30d: number;
    totalRevenue30dCents: number;
    totalImpressions30d: number;
    totalClicks30d: number;
  };
  topRevenueProducts: Array<{ product_slug: string; revenue_cents: number; purchases: number; clicks: number }>;
  topOrganicProducts: Array<{ product_slug: string; saves: number; clicks: number; impressions: number }>;
  topCtrProducts: Array<{ product_slug: string; ctr: number; impressions: number; clicks: number }>;
  topBoards: Array<{ board_name: string; revenue_cents: number; clicks: number; ctr: number }>;
  bestHoursUtc: Array<{ hour: number; ctr: number; samples: number }>;
  bestWeekdays: Array<{ weekday: number; ctr: number; samples: number }>;
  topHeadlines: Array<{ headline: string; count: number; avgScore: number }>;
  topHooks: Array<{ hook: string; count: number; avgScore: number }>;
  topCTAs: Array<{ cta: string; count: number; avgScore: number }>;
  growthVelocity: { weekOverWeekClicksPct: number; weekOverWeekRevenuePct: number };
  estimatedWeeklyOrganicTraffic: number;
  estimatedMonthlyRevenueCents: number;
  aiConfidence: number; // 0..1
  nextRecommendedOptimization: string;
  winnerMultiplier: { triggered: boolean; product_slug: string | null; variants_requested: number };
  loserBlocklistCandidates: Array<{ product_slug: string; reason: string }>;
  decisionsLogged: number;
};

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round(((a - b) / b) * 1000) / 10;
}

async function compute(sb: any): Promise<Snap> {
  const now = Date.now();
  const since30 = new Date(now - 30 * 86400_000).toISOString().slice(0, 10);
  const since7 = new Date(now - 7 * 86400_000).toISOString().slice(0, 10);
  const since14 = new Date(now - 14 * 86400_000).toISOString().slice(0, 10);
  const since7d_iso = new Date(now - 7 * 86400_000).toISOString();

  // ── 1. Funnel rows (30d) — single source of truth for revenue intelligence
  const { data: funnel } = await sb
    .from("pinterest_revenue_funnel_daily")
    .select("day, board_name, product_slug, pin_id, impressions, outbound_clicks, saves, product_views, add_to_carts, purchases, revenue_cents")
    .gte("day", since30)
    .limit(20000);
  const rows = funnel ?? [];

  let tImpr = 0, tClicks = 0, tRev = 0;
  const byProduct: Record<string, { rev: number; clicks: number; saves: number; impr: number; purchases: number }> = {};
  const byBoard: Record<string, { rev: number; clicks: number; impr: number }> = {};
  const byPin: Record<string, { rev: number; clicks: number; impr: number }> = {};
  for (const r of rows) {
    const impr = Number(r.impressions || 0);
    const clk = Number(r.outbound_clicks || 0);
    const rev = Number(r.revenue_cents || 0);
    tImpr += impr; tClicks += clk; tRev += rev;
    const pk = r.product_slug || "(unknown)";
    byProduct[pk] = byProduct[pk] || { rev: 0, clicks: 0, saves: 0, impr: 0, purchases: 0 };
    byProduct[pk].rev += rev; byProduct[pk].clicks += clk;
    byProduct[pk].saves += Number(r.saves || 0); byProduct[pk].impr += impr;
    byProduct[pk].purchases += Number(r.purchases || 0);
    const bk = r.board_name || "(unassigned)";
    byBoard[bk] = byBoard[bk] || { rev: 0, clicks: 0, impr: 0 };
    byBoard[bk].rev += rev; byBoard[bk].clicks += clk; byBoard[bk].impr += impr;
    if (r.pin_id) {
      byPin[r.pin_id] = byPin[r.pin_id] || { rev: 0, clicks: 0, impr: 0 };
      byPin[r.pin_id].rev += rev; byPin[r.pin_id].clicks += clk; byPin[r.pin_id].impr += impr;
    }
  }
  const pinsWithRevenue30d = Object.values(byPin).filter((p) => p.rev > 0).length;
  const avgCtr = tImpr ? tClicks / tImpr : 0;
  const avgRevenuePerPin = pinsWithRevenue30d ? tRev / pinsWithRevenue30d : 0;

  // ── 2. Top product rankings
  const productList = Object.entries(byProduct);
  const topRevenueProducts = productList
    .sort((a, b) => b[1].rev - a[1].rev)
    .slice(0, 10)
    .map(([product_slug, v]) => ({
      product_slug,
      revenue_cents: v.rev,
      purchases: v.purchases,
      clicks: v.clicks,
    }));
  const topOrganicProducts = productList
    .sort((a, b) => b[1].saves + b[1].clicks - (a[1].saves + a[1].clicks))
    .slice(0, 10)
    .map(([product_slug, v]) => ({ product_slug, saves: v.saves, clicks: v.clicks, impressions: v.impr }));
  const topCtrProducts = productList
    .filter(([, v]) => v.impr >= 500)
    .map(([product_slug, v]) => ({ product_slug, ctr: v.impr ? v.clicks / v.impr : 0, impressions: v.impr, clicks: v.clicks }))
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 10);

  const topBoards = Object.entries(byBoard)
    .sort((a, b) => b[1].rev - a[1].rev || b[1].clicks - a[1].clicks)
    .slice(0, 8)
    .map(([board_name, v]) => ({
      board_name,
      revenue_cents: v.rev,
      clicks: v.clicks,
      ctr: v.impr ? v.clicks / v.impr : 0,
    }));

  // ── 3. Best publishing hour/weekday — join funnel with queue.posted_at
  const pinIds = Array.from(new Set(rows.map((r: any) => r.pin_id).filter(Boolean))).slice(0, 5000);
  const postedAtByPin = new Map<string, string>();
  if (pinIds.length) {
    for (let i = 0; i < pinIds.length; i += 500) {
      const slice = pinIds.slice(i, i + 500);
      const { data: q } = await sb
        .from("pinterest_pin_queue")
        .select("remote_pin_id, posted_at")
        .in("remote_pin_id", slice as any)
        .not("posted_at", "is", null);
      for (const row of q ?? []) {
        if (row.remote_pin_id && row.posted_at) postedAtByPin.set(row.remote_pin_id, row.posted_at);
      }
    }
  }
  const byHour: Record<number, { impr: number; clk: number }> = {};
  const byDow: Record<number, { impr: number; clk: number }> = {};
  for (const r of rows) {
    const at = r.pin_id ? postedAtByPin.get(r.pin_id) : null;
    if (!at) continue;
    const d = new Date(at);
    const h = d.getUTCHours(); const w = d.getUTCDay();
    byHour[h] = byHour[h] || { impr: 0, clk: 0 };
    byDow[w] = byDow[w] || { impr: 0, clk: 0 };
    byHour[h].impr += Number(r.impressions || 0); byHour[h].clk += Number(r.outbound_clicks || 0);
    byDow[w].impr += Number(r.impressions || 0); byDow[w].clk += Number(r.outbound_clicks || 0);
  }
  const bestHoursUtc = Object.entries(byHour)
    .map(([h, v]) => ({ hour: Number(h), ctr: v.impr ? v.clk / v.impr : 0, samples: v.impr }))
    .filter((x) => x.samples >= 100)
    .sort((a, b) => b.ctr - a.ctr).slice(0, 6);
  const bestWeekdays = Object.entries(byDow)
    .map(([w, v]) => ({ weekday: Number(w), ctr: v.impr ? v.clk / v.impr : 0, samples: v.impr }))
    .filter((x) => x.samples >= 100)
    .sort((a, b) => b.ctr - a.ctr).slice(0, 7);

  // ── 4. Headline / hook / CTA winners (CI scores)
  const { data: ci } = await sb
    .from("pcie2_ci_scores")
    .select("headline, hook, cta, overall_score, created_at")
    .gte("created_at", new Date(now - 30 * 86400_000).toISOString())
    .limit(3000);
  const acc = (key: "headline" | "hook" | "cta") => {
    const m: Record<string, { count: number; sum: number }> = {};
    for (const r of ci ?? []) {
      const k = String((r as any)[key] ?? "").trim();
      if (!k) continue;
      m[k] = m[k] || { count: 0, sum: 0 };
      m[k].count += 1; m[k].sum += Number(r.overall_score || 0);
    }
    return Object.entries(m)
      .filter(([, v]) => v.count >= 2)
      .map(([k, v]) => ({ k, count: v.count, avg: v.sum / v.count }))
      .sort((a, b) => b.avg - a.avg).slice(0, 6);
  };
  const topHeadlines = acc("headline").map((x) => ({ headline: x.k, count: x.count, avgScore: Math.round(x.avg * 10) / 10 }));
  const topHooks = acc("hook").map((x) => ({ hook: x.k, count: x.count, avgScore: Math.round(x.avg * 10) / 10 }));
  const topCTAs = acc("cta").map((x) => ({ cta: x.k, count: x.count, avgScore: Math.round(x.avg * 10) / 10 }));

  // ── 5. Growth velocity (7d vs prior 7d)
  let cur = { clk: 0, rev: 0 }; let prev = { clk: 0, rev: 0 };
  for (const r of rows) {
    const d = String(r.day);
    if (d >= since7) { cur.clk += Number(r.outbound_clicks || 0); cur.rev += Number(r.revenue_cents || 0); }
    else if (d >= since14) { prev.clk += Number(r.outbound_clicks || 0); prev.rev += Number(r.revenue_cents || 0); }
  }
  const growthVelocity = {
    weekOverWeekClicksPct: pct(cur.clk, prev.clk),
    weekOverWeekRevenuePct: pct(cur.rev, prev.rev),
  };

  // ── 6. Forecast
  const weeklyClicks = Math.round((tClicks / 30) * 7);
  const monthlyRevenueCents = tRev; // last 30d as forward proxy
  const aiConfidence = Math.min(1, Math.max(0.15, pinsWithRevenue30d / 30));

  // ── 7. Winner multiplier candidate
  const winnerEntry = topRevenueProducts[0];
  const winnerThreshold = avgRevenuePerPin * 2;
  const winner = winnerEntry && winnerEntry.revenue_cents > 0
    ? { product_slug: winnerEntry.product_slug, variants: 5, beatsThreshold: winnerEntry.revenue_cents >= winnerThreshold }
    : null;

  // ── 8. Loser candidates (≥1000 impressions, ≤0 clicks, no revenue)
  const loserBlocklistCandidates = productList
    .filter(([, v]) => v.impr >= 1000 && v.clicks <= 1 && v.rev === 0)
    .slice(0, 5)
    .map(([product_slug, v]) => ({ product_slug, reason: `${v.impr} impr · ${v.clicks} clicks · 0 revenue (30d)` }));

  // ── 9. Next recommended optimization
  let next = "Collect 7 more days of post-attribution data before next major shift.";
  if (winner?.beatsThreshold) next = `Multiply winner '${winner.product_slug}' with 5 image variants targeting top board '${topBoards[0]?.board_name ?? "—"}'.`;
  else if (bestHoursUtc[0]) next = `Shift publishing toward UTC hour ${bestHoursUtc[0].hour} (CTR ${(bestHoursUtc[0].ctr * 100).toFixed(2)}%).`;
  else if (loserBlocklistCandidates[0]) next = `Blocklist underperformer '${loserBlocklistCandidates[0].product_slug}' and reallocate creative budget.`;

  return {
    generatedAt: new Date().toISOString(),
    baseline: {
      avgCtr,
      avgRevenuePerPin,
      pinsWithRevenue30d,
      totalRevenue30dCents: tRev,
      totalImpressions30d: tImpr,
      totalClicks30d: tClicks,
    },
    topRevenueProducts,
    topOrganicProducts,
    topCtrProducts,
    topBoards,
    bestHoursUtc,
    bestWeekdays,
    topHeadlines,
    topHooks,
    topCTAs,
    growthVelocity,
    estimatedWeeklyOrganicTraffic: weeklyClicks,
    estimatedMonthlyRevenueCents: monthlyRevenueCents,
    aiConfidence,
    nextRecommendedOptimization: next,
    winnerMultiplier: { triggered: false, product_slug: winner?.product_slug ?? null, variants_requested: winner?.variants ?? 0 },
    loserBlocklistCandidates,
    decisionsLogged: 0,
  };
}

async function execute(sb: any, snap: Snap, dryRun: boolean): Promise<Snap> {
  let logged = 0;

  // Always persist the daily snapshot (existing table, no schema change).
  await sb.from("pinterest_ops_snapshots").insert({
    snapshot_date: new Date().toISOString().slice(0, 10),
    taken_at: new Date().toISOString(),
    metrics: { source: "pinterest-growth-ai", snapshot: snap },
  });

  // Log the top recommendation row.
  await sb.from("pinterest_evolution_log").insert({
    decision_type: "growth_ai_recommendation",
    target_dimension: "account",
    rationale: snap.nextRecommendedOptimization,
    metrics: {
      baseline: snap.baseline,
      growthVelocity: snap.growthVelocity,
      estimatedWeeklyOrganicTraffic: snap.estimatedWeeklyOrganicTraffic,
      estimatedMonthlyRevenueCents: snap.estimatedMonthlyRevenueCents,
      aiConfidence: snap.aiConfidence,
    },
  });
  logged += 1;

  // Winner multiplier — only fire if not dry-run and a winner clears the threshold.
  if (!dryRun && snap.winnerMultiplier.product_slug && snap.topRevenueProducts[0]?.revenue_cents > 0) {
    try {
      await sb.functions.invoke("pinterest-creative-factory", {
        body: {
          source: "growth_ai_winner_multiplier",
          product_slug: snap.winnerMultiplier.product_slug,
          count: snap.winnerMultiplier.variants_requested,
          seo_mode: true,
          trending_keywords: snap.topHeadlines.slice(0, 3).map((h) => h.headline),
        },
      });
      snap.winnerMultiplier.triggered = true;
      await sb.from("pinterest_evolution_log").insert({
        decision_type: "growth_ai_winner_multiplier",
        target_dimension: `product:${snap.winnerMultiplier.product_slug}`,
        rationale: `Winner exceeds 2× avg revenue/pin — requested ${snap.winnerMultiplier.variants_requested} variants via creative-factory.`,
        metrics: { top: snap.topRevenueProducts[0], avgRevenuePerPin: snap.baseline.avgRevenuePerPin },
      });
      logged += 1;
    } catch (e) {
      console.warn("[growth-ai] winner multiplier invoke failed:", e);
    }
  }

  // Loser blocklist recommendations
  for (const loser of snap.loserBlocklistCandidates) {
    await sb.from("pinterest_evolution_log").insert({
      decision_type: "growth_ai_loser_flag",
      target_dimension: `product:${loser.product_slug}`,
      rationale: loser.reason,
      metrics: {},
    });
    logged += 1;
  }

  snap.decisionsLogged = logged;
  return snap;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  try {
    const url = new URL(req.url);
    const snapshotOnly = req.method === "GET" || url.searchParams.get("snapshot") === "1";
    let dryRun = false;
    if (!snapshotOnly && req.method === "POST") {
      try {
        const body = await req.json();
        dryRun = !!body?.dry_run;
      } catch { /* empty body */ }
    }
    const base = await compute(sb);
    const snap = snapshotOnly ? base : await execute(sb, base, dryRun);
    return new Response(
      JSON.stringify({ ok: true, mode: snapshotOnly ? "snapshot" : dryRun ? "dry_run" : "execute", snapshot: snap }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[growth-ai]", e);
    return new Response(
      JSON.stringify({ ok: false, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});