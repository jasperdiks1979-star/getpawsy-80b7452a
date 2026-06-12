// Pinterest Ops Dashboard — aggregates real-time metrics for the live admin view.
// Also supports ?snapshot=1 to persist a daily snapshot to pinterest_ops_snapshots.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function buildMetrics(sb: ReturnType<typeof createClient>) {
  const now = new Date();
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

  // --- Performance (analytics last 7d) ---
  const day7 = new Date(now.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
  const { data: analytics } = await sb
    .from("pinterest_analytics_daily")
    .select("pin_id, impressions, outbound_clicks, saves, ctr")
    .gte("day", day7)
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

  // --- Top performers (join with dimensions for slug/board) ---
  const topPinIds = [...pinAgg.entries()]
    .sort((a, b) => b[1].clicks - a[1].clicks)
    .slice(0, 50)
    .map(([k]) => k);
  const { data: dims } = await sb
    .from("pinterest_pin_dimensions")
    .select("pin_id, product_slug, board_id, hook_variant, copy_variant, cta_variant")
    .in("pin_id", topPinIds.length ? topPinIds : ["__none__"]);
  const dimMap = new Map<string, any>();
  for (const d of dims ?? []) dimMap.set((d as any).pin_id, d);

  const productAgg = new Map<string, number>();
  const boardAgg = new Map<string, number>();
  const headlineAgg = new Map<string, number>();
  const overlayAgg = new Map<string, number>();
  for (const [pid, m] of pinAgg) {
    const d = dimMap.get(pid) || {};
    if (d.product_slug) productAgg.set(d.product_slug, (productAgg.get(d.product_slug) ?? 0) + m.clicks);
    if (d.board_id) boardAgg.set(d.board_id, (boardAgg.get(d.board_id) ?? 0) + m.clicks);
    if (d.hook_variant) headlineAgg.set(d.hook_variant, (headlineAgg.get(d.hook_variant) ?? 0) + m.clicks);
    if (d.copy_variant) overlayAgg.set(d.copy_variant, (overlayAgg.get(d.copy_variant) ?? 0) + m.clicks);
  }
  const top = (m: Map<string, number>, n = 10) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, clicks]) => ({ key, clicks }));

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
    publishing: { queued, publishing, postedToday, posted7d, governorBlocked: rejected24h, failed },
    performance: { impressions, outboundClicks, saves, ctr, saveRate },
    diversity: {
      boardDiversity, topBoardShare, top3BoardShare,
      duplicateDensity, totalActivePins: totalActive, uniqueBoards,
      slugsAboveCap,
    },
    governor,
    coverage: {
      zero: buckets.zero, low: buckets.low, healthy: buckets.healthy, aboveCap: buckets.aboveCap,
      totalProducts: products?.length ?? 0,
    },
    revenue: {
      topProducts: top(productAgg),
      topBoards: top(boardAgg),
      topHeadlines: top(headlineAgg),
      topOverlays: top(overlayAgg),
    },
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
    const metrics = await buildMetrics(sb);
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