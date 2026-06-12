// Pinterest Ops Dashboard — aggregates real-time metrics for the live admin view.
// Also supports ?snapshot=1 to persist a daily snapshot to pinterest_ops_snapshots.
// Date filtering: ?range=today|7d|30d|custom (+ from=&to= ISO dates for custom).
// Revenue estimation: outbound_clicks * REVENUE_PER_CLICK_USD (default $0.35).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REVENUE_PER_CLICK_USD = Number(Deno.env.get("PINTEREST_REVENUE_PER_CLICK") ?? "0.35");

function classifyRejection(r: string | null): string {
  if (!r) return "other";
  const s = r.toLowerCase();
  if (s.startsWith("banned_phrase")) return "banned_phrase";
  if (s.includes("duplicate_image") || s.includes("duplicate_destination") || s.includes("creative_fingerprint"))
    return "duplicate_image";
  if (s.includes("headline") || s.includes("title_repeat") || s.includes("copy_repeat")) return "duplicate_headline";
  if (s.includes("overlay")) return "duplicate_overlay";
  if (s.includes("cta") || s.includes("generic_cta_phrase")) return "duplicate_cta";
  if (s.includes("board_cap") || s.includes("board-cap")) return "board_cap";
  if (s.includes("slug_cap") || s.includes("slug-cap") || s.includes("slug_not_allowed")) return "slug_cap";
  if (s.includes("category_mismatch") || s.includes("species_mismatch") || s.includes("creative_mismatch"))
    return "category_mismatch";
  return "other";
}

function resolveRange(url: URL): { rangeKey: string; sinceDate: Date; sinceDay: string; days: number } {
  const now = new Date();
  const rangeKey = (url.searchParams.get("range") || "7d").toLowerCase();
  let days = 7;
  let sinceDate = new Date(now.getTime() - 7 * 86400_000);
  if (rangeKey === "today") {
    days = 1;
    sinceDate = new Date(now); sinceDate.setUTCHours(0, 0, 0, 0);
  } else if (rangeKey === "30d") {
    days = 30;
    sinceDate = new Date(now.getTime() - 30 * 86400_000);
  } else if (rangeKey === "custom") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from) sinceDate = new Date(from);
    if (to) {
      const t = new Date(to);
      days = Math.max(1, Math.round((t.getTime() - sinceDate.getTime()) / 86400_000));
    } else {
      days = Math.max(1, Math.round((now.getTime() - sinceDate.getTime()) / 86400_000));
    }
  }
  return { rangeKey, sinceDate, sinceDay: sinceDate.toISOString().slice(0, 10), days };
}

async function buildMetrics(sb: ReturnType<typeof createClient>, url: URL) {
  const now = new Date();
  const range = resolveRange(url);
  const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
  const last7 = new Date(now.getTime() - 7 * 86400_000);
  const last24h = new Date(now.getTime() - 24 * 3600_000);

  // --- Publishing counts ---
  const counts = async (filter: (q: any) => any) => {
    const { count } = await filter(
      sb.from("pinterest_pin_queue").select("id", { head: true, count: "exact" }),
    );
    return count ?? 0;
  };

  const [queued, publishing, postedToday, posted7d, failed, rejected24h] = await Promise.all([
    counts((q) => q.eq("status", "queued")),
    counts((q) => q.eq("status", "publishing")),
    counts((q) => q.in("status", ["posted", "published"]).gte("posted_at", startOfDay.toISOString())),
    counts((q) => q.in("status", ["posted", "published"]).gte("posted_at", last7.toISOString())),
    counts((q) => q.eq("status", "failed")),
    counts((q) => q.eq("status", "rejected").gte("updated_at", last24h.toISOString())),
  ]);

  // --- Governor rejection breakdown (24h) ---
  const { data: recentRejects } = await sb
    .from("pinterest_pin_queue")
    .select("rejection_reason")
    .eq("status", "rejected")
    .gte("updated_at", last24h.toISOString())
    .limit(5000);
  const governor = {
    banned_phrase: 0, duplicate_headline: 0, duplicate_overlay: 0, duplicate_cta: 0,
    duplicate_image: 0, board_cap: 0, slug_cap: 0, category_mismatch: 0, other: 0,
  } as Record<string, number>;
  for (const r of recentRejects ?? []) {
    governor[classifyRejection((r as any).rejection_reason)]++;
  }

  // --- Active pins / board diversity / slug coverage ---
  const { data: active } = await sb
    .from("pinterest_pin_queue")
    .select("product_slug, board_id")
    .in("status", ["posted", "published"])
    .gte("posted_at", new Date(now.getTime() - 30 * 86400_000).toISOString())
    .limit(20000);

  const slugCounts = new Map<string, number>();
  const boardCounts = new Map<string, number>();
  const slugBoard = new Map<string, Set<string>>();
  for (const row of active ?? []) {
    const slug = (row as any).product_slug || "_unknown";
    const board = (row as any).board_id || "_unassigned";
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
    boardCounts.set(board, (boardCounts.get(board) ?? 0) + 1);
    if (!slugBoard.has(slug)) slugBoard.set(slug, new Set());
    slugBoard.get(slug)!.add(board);
  }
  const totalActive = active?.length ?? 0;
  const uniqueBoards = boardCounts.size;
  const boardDiversity = totalActive > 0 ? (uniqueBoards / totalActive) * 100 : 0;
  const sortedBoards = [...boardCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topBoardShare = totalActive > 0 && sortedBoards[0] ? (sortedBoards[0][1] / totalActive) * 100 : 0;
  const top3BoardShare =
    totalActive > 0
      ? (sortedBoards.slice(0, 3).reduce((s, [, c]) => s + c, 0) / totalActive) * 100
      : 0;

  // duplicate density = % of pins on slugs that exceed the 8-per-slug cap
  let overCapPins = 0;
  let slugsAboveCap = 0;
  for (const [, c] of slugCounts) {
    if (c > 8) { slugsAboveCap++; overCapPins += c - 8; }
  }
  const duplicateDensity = totalActive > 0 ? (overCapPins / totalActive) * 100 : 0;

  // --- Product coverage buckets ---
  const { data: products } = await sb
    .from("products")
    .select("slug")
    .eq("is_active", true)
    .limit(5000);
  const buckets = { zero: 0, low: 0, healthy: 0, aboveCap: 0 };
  for (const p of products ?? []) {
    const c = slugCounts.get((p as any).slug) ?? 0;
    if (c === 0) buckets.zero++;
    else if (c <= 2) buckets.low++;
    else if (c <= 8) buckets.healthy++;
    else buckets.aboveCap++;
  }

  // --- Performance (analytics in selected range) ---
  const day7 = new Date(now.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
  const { data: analytics } = await sb
    .from("pinterest_analytics_daily")
    .select("pin_id, impressions, outbound_clicks, saves, ctr")
    .gte("day", range.sinceDay)
    .limit(50000);
  let impressions = 0, outboundClicks = 0, saves = 0;
  const pinAgg = new Map<string, { impressions: number; clicks: number; saves: number }>();
  for (const a of analytics ?? []) {
    const i = (a as any).impressions ?? 0;
    const c = (a as any).outbound_clicks ?? 0;
    const s = (a as any).saves ?? 0;
    impressions += i; outboundClicks += c; saves += s;
    const pid = (a as any).pin_id as string;
    if (!pid) continue;
    const cur = pinAgg.get(pid) ?? { impressions: 0, clicks: 0, saves: 0 };
    cur.impressions += i; cur.clicks += c; cur.saves += s;
    pinAgg.set(pid, cur);
  }
  const ctr = impressions > 0 ? (outboundClicks / impressions) * 100 : 0;
  const saveRate = impressions > 0 ? (saves / impressions) * 100 : 0;

  // --- Join performance with full dimension catalog (all pins, not just top 50) ---
  const allPinIds = [...pinAgg.keys()];
  const dimMap = new Map<string, any>();
  // page through dimensions in chunks of 1000 to cover entire performance window
  for (let i = 0; i < allPinIds.length; i += 1000) {
    const slice = allPinIds.slice(i, i + 1000);
    const { data: dims } = await sb
      .from("pinterest_pin_dimensions")
      .select("pin_id, product_slug, board_id, category_key, hook_variant, copy_variant, cta_variant")
      .in("pin_id", slice);
    for (const d of dims ?? []) dimMap.set((d as any).pin_id, d);
  }

  type Agg = { impressions: number; clicks: number; saves: number; pins: Set<string> };
  const emptyAgg = (): Agg => ({ impressions: 0, clicks: 0, saves: 0, pins: new Set() });
  const productAgg = new Map<string, Agg>();
  const boardAgg = new Map<string, Agg>();
  const categoryAgg = new Map<string, Agg>();
  const headlineAgg = new Map<string, Agg>();
  const overlayAgg = new Map<string, Agg>();
  const ctaAgg = new Map<string, Agg>();
  const comboAgg = new Map<string, Agg>(); // hook|overlay|cta winning combos

  const bump = (m: Map<string, Agg>, key: string | undefined | null, pin: string, mt: { impressions: number; clicks: number; saves: number }) => {
    if (!key) return;
    const cur = m.get(key) ?? emptyAgg();
    cur.impressions += mt.impressions; cur.clicks += mt.clicks; cur.saves += mt.saves;
    cur.pins.add(pin);
    m.set(key, cur);
  };
  for (const [pid, mt] of pinAgg) {
    const d = dimMap.get(pid) || {};
    bump(productAgg, d.product_slug, pid, mt);
    bump(boardAgg, d.board_id, pid, mt);
    bump(categoryAgg, d.category_key, pid, mt);
    bump(headlineAgg, d.hook_variant, pid, mt);
    bump(overlayAgg, d.copy_variant, pid, mt);
    bump(ctaAgg, d.cta_variant, pid, mt);
    const combo = [d.hook_variant, d.copy_variant, d.cta_variant].filter(Boolean).join(" | ");
    if (combo) bump(comboAgg, combo, pid, mt);
  }
  const rankAgg = (m: Map<string, Agg>, n = 20) =>
    [...m.entries()]
      .map(([key, a]) => ({
        key,
        impressions: a.impressions,
        clicks: a.clicks,
        saves: a.saves,
        pins: a.pins.size,
        ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
        saveRate: a.impressions > 0 ? (a.saves / a.impressions) * 100 : 0,
        revenue: a.clicks * REVENUE_PER_CLICK_USD,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, n);

  const topProductsFull = rankAgg(productAgg, 20);
  const topBoardsFull = rankAgg(boardAgg, 20);
  const topCategoriesFull = rankAgg(categoryAgg, 20);
  const topHeadlinesFull = rankAgg(headlineAgg, 20);
  const topOverlaysFull = rankAgg(overlayAgg, 20);
  const topCtasFull = rankAgg(ctaAgg, 20);
  const topCombos = rankAgg(comboAgg, 20);

  // Backwards-compatible "top" shape used by older dashboards (key + clicks)
  const top = (rows: { key: string; clicks: number }[], n = 10) => rows.slice(0, n).map((r) => ({ key: r.key, clicks: r.clicks }));

  // --- Opportunity Finder ---
  // products with high CTR + low pin count, high saves + low impressions, clicks but no expansion, revenue but limited coverage
  const opportunities = {
    highCtrLowPins: topProductsFull
      .filter((p) => p.ctr >= 1.0 && (slugCounts.get(p.key) ?? 0) <= 2)
      .slice(0, 20),
    highSavesLowImpressions: topProductsFull
      .filter((p) => p.saves >= 5 && p.impressions < 1000)
      .sort((a, b) => b.saves - a.saves)
      .slice(0, 20),
    clicksNoExpansion: topProductsFull
      .filter((p) => p.clicks >= 5 && (slugCounts.get(p.key) ?? 0) < 4)
      .slice(0, 20),
    revenueLimitedCoverage: topProductsFull
      .filter((p) => p.revenue >= 1 && (slugCounts.get(p.key) ?? 0) < 6)
      .slice(0, 20),
  };

  // --- Coverage detail: which products have 0, 1-2, >8 pins ---
  const coverageDetail = {
    zero: [] as string[],
    low: [] as string[],
    aboveCap: [] as string[],
  };
  for (const p of products ?? []) {
    const slug = (p as any).slug as string;
    const c = slugCounts.get(slug) ?? 0;
    if (c === 0) coverageDetail.zero.push(slug);
    else if (c <= 2) coverageDetail.low.push(slug);
    else if (c > 8) coverageDetail.aboveCap.push(slug);
  }
  const productsWithClicks = topProductsFull.filter((p) => p.clicks > 0).length;
  const productsWithRevenue = topProductsFull.filter((p) => p.revenue > 0).length;

  // --- Next-up queue (next 20) ---
  const { data: nextQueue } = await sb
    .from("pinterest_pin_queue")
    .select("id, product_slug, board_id, scheduled_at, status")
    .in("status", ["queued", "publishing"])
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(20);

  // --- Alerts ---
  const alerts: { level: "red" | "amber"; code: string; message: string }[] = [];
  if (totalActive > 0 && boardDiversity < 25)
    alerts.push({ level: "red", code: "low_board_diversity", message: `Board diversity ${boardDiversity.toFixed(1)}% (<25%)` });
  if (top3BoardShare > 60)
    alerts.push({ level: "red", code: "top3_concentration", message: `Top 3 boards hold ${top3BoardShare.toFixed(1)}% (>60%)` });
  if (slugsAboveCap > 0)
    alerts.push({ level: "red", code: "slug_cap_exceeded", message: `${slugsAboveCap} slug(s) above 8-pin cap` });
  if (governor.banned_phrase > 0)
    alerts.push({ level: "red", code: "banned_phrase", message: `${governor.banned_phrase} banned-phrase blocks in 24h` });

  // --- Trend (last 7 snapshots) ---
  const { data: snaps } = await sb
    .from("pinterest_ops_snapshots")
    .select("snapshot_date, metrics")
    .gte("snapshot_date", day7)
    .order("snapshot_date", { ascending: true });
  const trend = (snaps ?? []).map((s: any) => ({
    date: s.snapshot_date,
    posted: s.metrics?.publishing?.postedToday ?? 0,
    impressions: s.metrics?.performance?.impressions ?? 0,
    clicks: s.metrics?.performance?.outboundClicks ?? 0,
    ctr: s.metrics?.performance?.ctr ?? 0,
    boardDiversity: s.metrics?.diversity?.boardDiversity ?? 0,
    duplicateDensity: s.metrics?.diversity?.duplicateDensity ?? 0,
  }));

  return {
    generated_at: now.toISOString(),
    range: { key: range.rangeKey, since: range.sinceDate.toISOString(), days: range.days, revenuePerClick: REVENUE_PER_CLICK_USD },
    publishing: { queued, publishing, postedToday, posted7d, governorBlocked: rejected24h, failed },
    performance: {
      impressions, outboundClicks, saves, ctr, saveRate,
      estimatedRevenue: outboundClicks * REVENUE_PER_CLICK_USD,
      revenuePerPin: totalActive > 0 ? (outboundClicks * REVENUE_PER_CLICK_USD) / totalActive : 0,
    },
    diversity: {
      boardDiversity, topBoardShare, top3BoardShare,
      duplicateDensity, totalActivePins: totalActive, uniqueBoards,
      slugsAboveCap,
    },
    governor,
    coverage: {
      zero: buckets.zero, low: buckets.low, healthy: buckets.healthy, aboveCap: buckets.aboveCap,
      totalProducts: products?.length ?? 0,
      productsWithClicks, productsWithRevenue,
      detail: coverageDetail,
    },
    revenue: {
      topProducts: top(topProductsFull),
      topBoards: top(topBoardsFull),
      topHeadlines: top(topHeadlinesFull),
      topOverlays: top(topOverlaysFull),
    },
    drilldowns: {
      products: topProductsFull,
      boards: topBoardsFull,
      categories: topCategoriesFull,
      headlines: topHeadlinesFull,
      overlays: topOverlaysFull,
      ctas: topCtasFull,
      combos: topCombos,
    },
    opportunities,
    nextQueue: nextQueue ?? [],
    alerts,
    trend,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const url = new URL(req.url);
    const metrics = await buildMetrics(sb, url);
    if (url.searchParams.get("snapshot") === "1") {
      const today = new Date().toISOString().slice(0, 10);
      await sb.from("pinterest_ops_snapshots").upsert(
        { snapshot_date: today, taken_at: new Date().toISOString(), metrics },
        { onConflict: "snapshot_date" },
      );
    }
    return new Response(JSON.stringify({ ok: true, metrics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});