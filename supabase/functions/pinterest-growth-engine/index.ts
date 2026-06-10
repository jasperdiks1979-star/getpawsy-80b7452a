// Pinterest Growth Engine — autonomous daily orchestrator.
//
// Composes existing building blocks:
//   pinterest-creative-director  → variant generation + render + draft insert
//   pinterest_boards             → board intelligence (production-only)
//   pinterest_analytics_daily    → performance signals
//   pinterest_pin_queue          → publishing pipeline (auto-approve safe drafts)
//
// Actions (POST { action }):
//   "run"        — daily growth cycle (product pick → drafts → auto-approve)
//   "dashboard"  — KPIs for /admin/pinterest-growth-engine
//   "status"     — engine health + last run summary
//
// Safety guardrails (hard-enforced before any insert/approve):
//   ✓ Never use sandbox boards (is_sandbox=false AND is_blacklisted=false AND production_verified=true)
//   ✓ Never publish without pin_image_url
//   ✓ Never publish without destination_link
//   ✓ Never publish inactive products
//   ✓ Never publish visual duplicates (creative-director phash guard)
//   ✓ Never exceed per-board daily cap (default 3 pins/board/day)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  pickUsKeywords,
  pickUsState,
  detectNicheLite,
  US_SHARE_FLOOR,
  US_SHARE_TARGET,
} from "../_shared/pinterest-us-keywords.ts";
import {
  isPriorityCategory,
  PRIORITY_CATEGORY_FLOOR,
  countryWeight,
} from "../_shared/pinterest-priority-categories.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULTS = {
  productsPerRun: 8,
  variantsPerProduct: 3,
  perBoardDailyCap: 2, // V2: tightened from 3 → 2 to prevent board saturation.
  autoApproveScoreThreshold: 78,
  minMarginPct: 0.25,
  maxCategoryShare: 0.25, // V2: no single category may exceed 25% of a run.
};

// ===== V2 enforcement constants =====
// Generic / catch-all boards — demoted to last-resort only.
const GENERIC_BOARDS = new Set<string>([
  "cat essentials",
  "pet essentials",
  "dog essentials",
  "pet products",
  "cat products",
  "dog products",
]);
// Banned overlay/title CTA phrases (V2 phase 5).
const BANNED_OVERLAY_PHRASES = [
  "browse now",
  "learn more",
  "stack it",
  "browse litter",
  "shop now",
  "click here",
  "tap to shop",
  "see more",
];
const MAX_TITLE_WORDS = 5; // V2 phase 4

function wordCount(s: string | null | undefined): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}
function containsBannedPhrase(s: string | null | undefined): string | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  for (const p of BANNED_OVERLAY_PHRASES) if (lower.includes(p)) return p;
  return null;
}
function isGenericBoard(name: string | null | undefined): boolean {
  if (!name) return false;
  return GENERIC_BOARDS.has(name.trim().toLowerCase());
}
function categoryKey(c: string | null): string {
  return (c ?? "uncategorized").toLowerCase().trim();
}

// ===== US traffic intelligence =====
// Rolls up last-30d Pinterest-attributed visits from `visitor_activity`,
// excluding internal/dev traffic, returning US share per product and per board.
interface UsShares {
  byProduct: Map<string, number>;  // product_id → us share 0..1
  byBoard: Map<string, number>;    // board_id   → us share 0..1
  overall: number;                 // overall us share 0..1
  sampleSize: number;
}

async function computeUsShares(sb: ReturnType<typeof createClient>): Promise<UsShares> {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: rows } = await sb
    .from("visitor_activity")
    .select("country,product_id,page_path,utm_source,is_internal,created_at")
    .gte("created_at", since)
    .ilike("utm_source", "%pinterest%")
    .eq("is_internal", false)
    .limit(50_000);

  const productCounts = new Map<string, { us: number; total: number }>();
  const pagePathCounts = new Map<string, { us: number; total: number }>();
  let usAll = 0; let totAll = 0;

  for (const r of (rows ?? []) as Array<{ country: string | null; product_id: string | null; page_path: string | null }>) {
    const isUs = (r.country ?? "").toLowerCase().startsWith("united states") || (r.country ?? "").toUpperCase() === "US";
    totAll++; if (isUs) usAll++;
    if (r.product_id) {
      const cur = productCounts.get(r.product_id) ?? { us: 0, total: 0 };
      cur.total++; if (isUs) cur.us++;
      productCounts.set(r.product_id, cur);
    }
    if (r.page_path) {
      const cur = pagePathCounts.get(r.page_path) ?? { us: 0, total: 0 };
      cur.total++; if (isUs) cur.us++;
      pagePathCounts.set(r.page_path, cur);
    }
  }

  const byProduct = new Map<string, number>();
  for (const [pid, c] of productCounts) {
    if (c.total >= 3) byProduct.set(pid, c.us / c.total);
  }

  // Board-level US share: aggregate via pin_queue rows that hit those products.
  const productIds = [...productCounts.keys()];
  const byBoard = new Map<string, number>();
  if (productIds.length) {
    const { data: pq } = await sb
      .from("pinterest_pin_queue")
      .select("board_id,product_id")
      .in("product_id", productIds.slice(0, 1000))
      .not("board_id", "is", null)
      .limit(20_000);
    const boardAgg = new Map<string, { us: number; total: number }>();
    for (const r of (pq ?? []) as Array<{ board_id: string; product_id: string }>) {
      const pc = productCounts.get(r.product_id);
      if (!pc) continue;
      const cur = boardAgg.get(r.board_id) ?? { us: 0, total: 0 };
      cur.us += pc.us; cur.total += pc.total;
      boardAgg.set(r.board_id, cur);
    }
    for (const [bid, c] of boardAgg) {
      if (c.total >= 5) byBoard.set(bid, c.us / c.total);
    }
  }

  return {
    byProduct,
    byBoard,
    overall: totAll > 0 ? usAll / totAll : 0,
    sampleSize: totAll,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

interface Product {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  price: number;
  cost_price: number | null;
  compare_at_price: number | null;
  image_url: string | null;
  images: string[] | null;
  is_active: boolean;
  is_duplicate?: boolean | null;
}

function scoreProduct(p: Product, perfBoost: number, revenueBoost: number, usBoost: number): number {
  // 0–170 composite — biased toward revenue + ATC + margin + US share
  let s = 0;
  // image (0–20)
  const imgCount = (p.images?.length ?? 0) + (p.image_url ? 1 : 0);
  s += Math.min(imgCount, 5) * 4;
  // margin (0–25)
  const cost = p.cost_price ?? 0;
  const margin = cost > 0 ? (p.price - cost) / p.price : 0.4;
  s += Math.min(Math.max(margin, 0), 1) * 25;
  // price-band fit $25–$120 (0–10)
  if (p.price >= 25 && p.price <= 120) s += 10;
  else if (p.price >= 15 && p.price < 25) s += 5;
  else s += 2;
  // category presence (0–10)
  if (p.category) s += 10;
  // pinterest engagement (0–25)
  s += Math.min(perfBoost, 25);
  // revenue / ATC / purchase signal (0–50) — the dominant lever
  s += Math.min(revenueBoost, 50);
  // US share boost (0–30): heavily reward products that already convert US visitors.
  s += Math.min(Math.max(usBoost, 0), 30);
  return s;
}

async function selectProducts(sb: ReturnType<typeof createClient>, limit: number, usShares: UsShares) {
  // Pull active products with images and slug
  const { data, error } = await sb
    .from("products")
    .select("id, slug, name, category, price, cost_price, compare_at_price, image_url, images, is_active, is_duplicate")
    .eq("is_active", true)
    .not("slug", "is", null)
    .not("image_url", "is", null)
    .gt("price", 0)
    .limit(500);
  if (error) throw error;

  const products = ((data ?? []) as unknown as Product[]).filter((p) => !p.is_duplicate);

  // Performance boost — products that already earned saves/clicks in last 14d
  const since = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  const { data: perf } = await sb
    .from("pinterest_analytics_daily")
    .select("pin_id,impressions,outbound_clicks,saves")
    .gte("day", since)
    .limit(10_000);
  const { data: dims } = await sb
    .from("pinterest_pin_queue")
    .select("pinterest_pin_id, product_id")
    .not("pinterest_pin_id", "is", null)
    .limit(10_000);
  const pinToProduct = new Map<string, string>();
  for (const d of (dims ?? []) as { pinterest_pin_id: string; product_id: string }[]) {
    if (d.pinterest_pin_id && d.product_id) pinToProduct.set(d.pinterest_pin_id, d.product_id);
  }
  const perfByProduct = new Map<string, number>();
  for (const r of (perf ?? []) as { pin_id: string; impressions: number; outbound_clicks: number; saves: number }[]) {
    const pid = pinToProduct.get(r.pin_id);
    if (!pid) continue;
    const boost = Math.min(25, r.outbound_clicks * 2 + r.saves * 1.5 + r.impressions / 500);
    perfByProduct.set(pid, (perfByProduct.get(pid) ?? 0) + boost);
  }

  // Revenue / ATC / purchase signal (last 14d) from pinterest_revenue_funnel_daily.
  const { data: rev } = await sb
    .from("pinterest_revenue_funnel_daily")
    .select("product_id, product_views, add_to_carts, purchases, revenue_cents")
    .gte("day", since)
    .limit(20_000);
  const revByProduct = new Map<string, number>();
  for (const r of (rev ?? []) as { product_id: string | null; product_views: number; add_to_carts: number; purchases: number; revenue_cents: number }[]) {
    if (!r.product_id) continue;
    // Each $1 of attributed revenue = 0.5pt, each purchase = 5pt, each ATC = 1pt, each PV = 0.05pt.
    const boost = (r.revenue_cents / 100) * 0.5 + r.purchases * 5 + r.add_to_carts * 1 + r.product_views * 0.05;
    revByProduct.set(r.product_id, (revByProduct.get(r.product_id) ?? 0) + boost);
  }

  // Autopilot overrides — paused/exclude => skip, force_promote => bypass recency throttle + bonus.
  const nowIso = new Date().toISOString();
  const { data: overrides } = await sb
    .from("pinterest_autopilot_overrides")
    .select("product_id, action, expires_at")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(2000);
  const excluded = new Set<string>();
  const forcePromote = new Set<string>();
  for (const o of (overrides ?? []) as { product_id: string; action: string }[]) {
    if (o.action === "paused" || o.action === "exclude") excluded.add(o.product_id);
    else if (o.action === "force_promote") forcePromote.add(o.product_id);
  }

  // Exclude products already drafted/published in the last 5 days to avoid stuffing
  const since5 = new Date(Date.now() - 5 * 86400_000).toISOString();
  const { data: recent } = await sb
    .from("pinterest_pin_queue")
    .select("product_id")
    .gte("created_at", since5)
    .limit(5000);
  const recentlyUsed = new Set<string>((recent ?? []).map((r: { product_id: string }) => r.product_id).filter(Boolean));

  const scored = products
    .filter((p) => !excluded.has(p.id))
    .filter((p) => forcePromote.has(p.id) || !recentlyUsed.has(p.id))
    .map((p) => ({
      p,
      score:
        scoreProduct(
          p,
          Math.min(perfByProduct.get(p.id) ?? 0, 25),
          Math.min(revByProduct.get(p.id) ?? 0, 50),
          // usBoost: scale 0..1 share into 0..30 — products with no signal get 0.
          (usShares.byProduct.get(p.id) ?? 0) * 30,
        ) + (forcePromote.has(p.id) ? 40 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  // V2 Phase 1: enforce ≤25% concentration per category in the selected slate.
  const maxPerCat = Math.max(1, Math.ceil(limit * DEFAULTS.maxCategoryShare));
  const catCounts = new Map<string, number>();
  const picked: Product[] = [];
  const throttled: string[] = [];
  for (const { p } of scored) {
    if (picked.length >= limit) break;
    const key = categoryKey(p.category);
    const used = catCounts.get(key) ?? 0;
    if (used >= maxPerCat) { throttled.push(p.slug); continue; }
    picked.push(p);
    catCounts.set(key, used + 1);
  }
  const finalPicks = picked;

  return {
    products: finalPicks,
    forcePromoted: finalPicks.filter((p) => forcePromote.has(p.id)).map((p) => p.slug),
    excluded: [...excluded],
    categoryThrottled: throttled,
    categoryDistribution: Object.fromEntries(catCounts),
    usSharesByPickedProduct: Object.fromEntries(
      finalPicks.map((p) => [p.slug, Number(((usShares.byProduct.get(p.id) ?? 0) * 100).toFixed(1))]),
    ),
  };
}

async function callCreativeDirector(slug: string, count: number, usHints?: {
  us_focus?: boolean; us_keywords?: string[]; us_state?: string; niche?: string;
}): Promise<{ ok: boolean; drafts: number; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-creative-director`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ action: "run_full", slug, count, ...(usHints ?? {}) }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok && (j.ok ?? true), drafts: j.inserted ?? j.accepted ?? 0, error: j.error };
  } catch (e) {
    return { ok: false, drafts: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function autoApproveSafeDrafts(
  sb: ReturnType<typeof createClient>,
  perBoardCap: number,
  scoreThreshold: number,
  usShares: UsShares,
) {
  // Pull recent drafts on production boards
  const { data: boards } = await sb
    .from("pinterest_boards")
    .select("id,name,is_sandbox,is_blacklisted,production_verified")
    .eq("is_sandbox", false)
    .eq("is_blacklisted", false)
    .eq("production_verified", true);
  const prodIds = new Set<string>((boards ?? []).map((b: { id: string }) => b.id));
  const genericBoardIds = new Set<string>(
    (boards ?? [])
      .filter((b: { name: string }) => isGenericBoard(b.name))
      .map((b: { id: string }) => b.id),
  );
  // US filter: boards routing <FLOOR US traffic are demoted to last-resort.
  // Boards with no signal yet (not in shares map) are treated as neutral.
  const lowUsBoardIds = new Set<string>(
    [...prodIds].filter((id) => {
      const s = usShares.byBoard.get(id);
      return s !== undefined && s < US_SHARE_FLOOR;
    }),
  );

  const { data: draftsRaw } = await sb
    .from("pinterest_pin_queue")
    .select("id,board_id,board_name,product_id,product_slug,product_name,pin_image_url,destination_link,pin_title,overlay_text,meta")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(200);
  // Sort drafts so high-US-share boards are approved first within the per-board cap.
  const drafts = ((draftsRaw ?? []) as Array<{ board_id: string | null }>).slice().sort((a, b) => {
    const sa: number = a.board_id ? (usShares.byBoard.get(a.board_id) ?? 0) : 0;
    const sb2: number = b.board_id ? (usShares.byBoard.get(b.board_id) ?? 0) : 0;
    return sb2 - sa;
  });

  // Today's per-board count
  const startToday = new Date(`${todayIso()}T00:00:00Z`).toISOString();
  const { data: scheduledToday } = await sb
    .from("pinterest_pin_queue")
    .select("board_id")
    .in("status", ["ready_to_post", "queued", "posting", "posted"])
    .gte("scheduled_at", startToday);
  const byBoardToday = new Map<string, number>();
  for (const r of (scheduledToday ?? []) as { board_id: string }[]) {
    if (!r.board_id) continue;
    byBoardToday.set(r.board_id, (byBoardToday.get(r.board_id) ?? 0) + 1);
  }

  let approved = 0;
  let skippedSafety = 0;
  let skippedCap = 0;
  let skippedScore = 0;
  let skippedTitle = 0;
  let skippedOverlay = 0;
  let skippedGeneric = 0;
  let skippedLowUs = 0;
  const rejectedTitles: string[] = [];
  const rejectedOverlays: string[] = [];

  for (const d of drafts as Array<{
    id: string; board_id: string | null; board_name: string | null;
    product_id: string | null; product_slug: string | null; product_name: string | null;
    pin_image_url: string | null; destination_link: string | null;
    pin_title: string | null; overlay_text: string | null;
    meta: Record<string, unknown> | null;
  }>) {
    // Safety: must have image, link, production board, active product
    if (!d.pin_image_url || !d.destination_link) { skippedSafety++; continue; }
    if (!d.board_id || !prodIds.has(d.board_id)) { skippedSafety++; continue; }
    if (d.product_id) {
      const { data: prod } = await sb.from("products").select("is_active").eq("id", d.product_id).maybeSingle();
      if (!prod || !(prod as { is_active: boolean }).is_active) { skippedSafety++; continue; }
    }
    // V3 US filter: low-US-share boards are last-resort when other boards still have capacity.
    if (lowUsBoardIds.has(d.board_id)) {
      const altAvailable = [...prodIds].some(
        (id) => !lowUsBoardIds.has(id) && !genericBoardIds.has(id) && (byBoardToday.get(id) ?? 0) < perBoardCap,
      );
      if (altAvailable) {
        await sb.from("pinterest_pin_queue").update({
          status: "archived",
          rejection_reason: `v3-us: board us_share ${(usShares.byBoard.get(d.board_id) ?? 0).toFixed(2)} < ${US_SHARE_FLOOR}`,
        }).eq("id", d.id);
        skippedLowUs++;
        continue;
      }
    }
    // V2 Phase 2: demote generic boards — only allow if every non-generic board is at cap.
    if (genericBoardIds.has(d.board_id)) {
      const nonGenericAvailable = [...prodIds].some(
        (id) => !genericBoardIds.has(id) && (byBoardToday.get(id) ?? 0) < perBoardCap,
      );
      if (nonGenericAvailable) {
        await sb.from("pinterest_pin_queue").update({
          status: "archived",
          rejection_reason: "v2: generic board demoted (Cat Essentials et al.)",
        }).eq("id", d.id);
        skippedGeneric++;
        continue;
      }
    }
    // V2 Phase 4: title must be ≤5 words and not a SKU/long description.
    if (d.pin_title && wordCount(d.pin_title) > MAX_TITLE_WORDS) {
      await sb.from("pinterest_pin_queue").update({
        status: "archived",
        rejection_reason: `v2: title exceeds ${MAX_TITLE_WORDS} words (${wordCount(d.pin_title)})`,
      }).eq("id", d.id);
      rejectedTitles.push(d.pin_title);
      skippedTitle++;
      continue;
    }
    // V2 Phase 5: overlay must not contain banned CTA phrases, ≤6 words.
    const banned = containsBannedPhrase(d.overlay_text) ?? containsBannedPhrase(d.pin_title);
    if (banned || (d.overlay_text && wordCount(d.overlay_text) > 6)) {
      await sb.from("pinterest_pin_queue").update({
        status: "archived",
        rejection_reason: banned
          ? `v2: banned overlay phrase "${banned}"`
          : `v2: overlay exceeds 6 words (${wordCount(d.overlay_text)})`,
      }).eq("id", d.id);
      if (d.overlay_text) rejectedOverlays.push(d.overlay_text);
      skippedOverlay++;
      continue;
    }
    // Quality score from creative-director intelligence
    const intel = (d.meta?.intelligence as { scores?: { total?: number } } | undefined) ?? undefined;
    const total = intel?.scores?.total ?? 80; // default-pass if scorer skipped
    if (total < scoreThreshold) { skippedScore++; continue; }
    // Per-board cap
    const used = byBoardToday.get(d.board_id) ?? 0;
    if (used >= perBoardCap) { skippedCap++; continue; }
    // Approve — stamp US targeting metadata so the publisher can attach
    // US-focused keywords / state hint to the Pinterest API call.
    const seed = d.product_slug ?? d.product_id ?? d.id;
    const usKeywords = pickUsKeywords({
      name: d.product_name, slug: d.product_slug, category: null,
    });
    const usState = pickUsState(seed);
    const niche = detectNicheLite({ name: d.product_name, slug: d.product_slug, category: null });
    const boardUsShare = usShares.byBoard.get(d.board_id) ?? null;
    const productUsShare = d.product_id ? (usShares.byProduct.get(d.product_id) ?? null) : null;
    const usAudienceScore = Math.round(
      ((boardUsShare ?? usShares.overall) * 60 + (productUsShare ?? usShares.overall) * 40) * 100,
    );
    const nextMeta = {
      ...(d.meta ?? {}),
      us_focus: true,
      us_keywords: usKeywords,
      us_state_focus: usState,
      us_board_share: boardUsShare,
      us_product_share: productUsShare,
      niche_detected: niche,
    };
    const scheduled = new Date(Date.now() + (approved * 12 + 5) * 60_000).toISOString();
    const { error } = await sb
      .from("pinterest_pin_queue")
      .update({
        status: "ready_to_post",
        approved_at: new Date().toISOString(),
        scheduled_at: scheduled,
        meta: nextMeta,
        us_audience_score: usAudienceScore,
      })
      .eq("id", d.id);
    if (!error) {
      approved++;
      byBoardToday.set(d.board_id, used + 1);
    }
  }

  return {
    approved,
    skippedSafety,
    skippedScore,
    skippedCap,
    skippedTitle,
    skippedOverlay,
    skippedGeneric,
    skippedLowUs,
    boardsBelowUsFloor: lowUsBoardIds.size,
    rejectedTitleSamples: rejectedTitles.slice(0, 5),
    rejectedOverlaySamples: rejectedOverlays.slice(0, 5),
  };
}

async function retirePoorPerformers(sb: ReturnType<typeof createClient>) {
  // Archive draft variants tied to products whose pins consistently underperform.
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: losers } = await sb
    .from("pinterest_pin_verdicts")
    .select("pin_id")
    .eq("verdict", "loser")
    .gte("scored_at", since30)
    .limit(500);
  const loserPinIds = (losers ?? []).map((l: { pin_id: string }) => l.pin_id);
  if (!loserPinIds.length) return { retired: 0 };

  const { data: rows } = await sb
    .from("pinterest_pin_queue")
    .select("product_id")
    .in("pinterest_pin_id", loserPinIds);
  const productIds = [...new Set((rows ?? []).map((r: { product_id: string }) => r.product_id).filter(Boolean))];
  if (!productIds.length) return { retired: 0 };

  const { error, count } = await sb
    .from("pinterest_pin_queue")
    .update({ status: "archived", rejection_reason: "auto-retired: underperformer" }, { count: "exact" })
    .in("product_id", productIds)
    .eq("status", "draft");
  if (error) return { retired: 0, error: error.message };
  return { retired: count ?? 0 };
}

async function buildDashboard(sb: ReturnType<typeof createClient>) {
  const today = todayIso();
  const startToday = new Date(`${today}T00:00:00Z`).toISOString();
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

  // Pins published today
  const { count: publishedToday } = await sb
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "posted")
    .gte("posted_at", startToday);

  // Drafts in pipeline
  const { count: draftsCount } = await sb
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "draft");
  const { count: readyCount } = await sb
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "ready_to_post");

  // 7-day analytics aggregate
  const { data: ad7 } = await sb
    .from("pinterest_analytics_daily")
    .select("impressions,outbound_clicks,saves,day")
    .gte("day", since7);
  const agg7 = (ad7 ?? []).reduce(
    (a: { i: number; c: number; s: number }, r: { impressions: number; outbound_clicks: number; saves: number }) => ({
      i: a.i + (r.impressions || 0),
      c: a.c + (r.outbound_clicks || 0),
      s: a.s + (r.saves || 0),
    }),
    { i: 0, c: 0, s: 0 },
  );
  const ctr7 = agg7.i ? agg7.c / agg7.i : 0;

  // 30-day monthly trend (daily series)
  const { data: ad30 } = await sb
    .from("pinterest_analytics_daily")
    .select("day,impressions,outbound_clicks,saves")
    .gte("day", since30)
    .order("day", { ascending: true });
  const trend = new Map<string, { day: string; impressions: number; outbound_clicks: number; saves: number }>();
  for (const r of (ad30 ?? []) as { day: string; impressions: number; outbound_clicks: number; saves: number }[]) {
    const cur = trend.get(r.day) ?? { day: r.day, impressions: 0, outbound_clicks: 0, saves: 0 };
    cur.impressions += r.impressions || 0;
    cur.outbound_clicks += r.outbound_clicks || 0;
    cur.saves += r.saves || 0;
    trend.set(r.day, cur);
  }

  // Top boards (last 7d, by published pins)
  const start7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: byBoard } = await sb
    .from("pinterest_pin_queue")
    .select("board_name")
    .eq("status", "posted")
    .gte("posted_at", start7)
    .limit(2000);
  const boardCount = new Map<string, number>();
  for (const r of (byBoard ?? []) as { board_name: string }[]) {
    if (!r.board_name) continue;
    boardCount.set(r.board_name, (boardCount.get(r.board_name) ?? 0) + 1);
  }
  const topBoards = [...boardCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  // Top products (last 30d by clicks)
  const { data: dims } = await sb
    .from("pinterest_pin_queue")
    .select("pinterest_pin_id, product_slug, product_name")
    .not("pinterest_pin_id", "is", null)
    .limit(10_000);
  const pinMeta = new Map<string, { slug: string; name: string }>();
  for (const d of (dims ?? []) as { pinterest_pin_id: string; product_slug: string; product_name: string }[]) {
    pinMeta.set(d.pinterest_pin_id, { slug: d.product_slug, name: d.product_name });
  }
  const prodAgg = new Map<string, { slug: string; name: string; clicks: number; saves: number; impressions: number }>();
  for (const r of (ad30 ?? []) as { pin_id?: string; impressions: number; outbound_clicks: number; saves: number }[]) {
    const pin = (r as unknown as { pin_id?: string }).pin_id;
    if (!pin) continue;
    const m = pinMeta.get(pin);
    if (!m) continue;
    const cur = prodAgg.get(m.slug) ?? { slug: m.slug, name: m.name, clicks: 0, saves: 0, impressions: 0 };
    cur.clicks += r.outbound_clicks || 0;
    cur.saves += r.saves || 0;
    cur.impressions += r.impressions || 0;
    prodAgg.set(m.slug, cur);
  }
  const topProducts = [...prodAgg.values()]
    .sort((a, b) => b.clicks - a.clicks).slice(0, 10);

  // Revenue attribution (best-effort: orders with utm_source=pinterest in last 30d)
  const since30Iso = new Date(Date.now() - 30 * 86400_000).toISOString();
  let revenue30 = 0;
  let orders30 = 0;
  const { data: orders } = await sb
    .from("orders")
    .select("total, created_at, utm_source")
    .gte("created_at", since30Iso)
    .limit(5000);
  for (const o of (orders ?? []) as { total: number | string; utm_source: string | null }[]) {
    if ((o.utm_source ?? "").toLowerCase() === "pinterest") {
      revenue30 += Number(o.total) || 0;
      orders30++;
    }
  }

  // Active production boards
  const { count: prodBoards } = await sb
    .from("pinterest_boards")
    .select("id", { count: "exact", head: true })
    .eq("is_sandbox", false)
    .eq("is_blacklisted", false)
    .eq("production_verified", true);

  // ===== Revenue panels (from pinterest_revenue_funnel_daily) =====
  const { data: funnel30 } = await sb
    .from("pinterest_revenue_funnel_daily")
    .select("day,pin_id,product_id,product_slug,board_name,impressions,outbound_clicks,product_views,add_to_carts,checkouts,purchases,revenue_cents")
    .gte("day", since30)
    .limit(20_000);
  type FRow = {
    day: string; pin_id: string; product_id: string | null; product_slug: string | null; board_name: string | null;
    impressions: number; outbound_clicks: number; product_views: number; add_to_carts: number; checkouts: number; purchases: number; revenue_cents: number;
  };
  const f = (funnel30 ?? []) as FRow[];
  const sumRev = (rows: FRow[]) => rows.reduce(
    (a, r) => ({
      revenue: a.revenue + (r.revenue_cents || 0),
      purchases: a.purchases + (r.purchases || 0),
      checkouts: a.checkouts + (r.checkouts || 0),
      atc: a.atc + (r.add_to_carts || 0),
      pv: a.pv + (r.product_views || 0),
      clicks: a.clicks + (r.outbound_clicks || 0),
      impressions: a.impressions + (r.impressions || 0),
    }),
    { revenue: 0, purchases: 0, checkouts: 0, atc: 0, pv: 0, clicks: 0, impressions: 0 },
  );
  const totals30 = sumRev(f);
  const totals7 = sumRev(f.filter((r) => r.day >= since7));

  const byPin = new Map<string, { pin_id: string; product_slug: string | null; board_name: string | null; revenue: number; purchases: number; clicks: number; impressions: number }>();
  const byBoardRev = new Map<string, { board_name: string; revenue: number; purchases: number; clicks: number }>();
  const byProductRev = new Map<string, { product_id: string; product_slug: string | null; revenue: number; purchases: number; atc: number; pv: number; clicks: number; impressions: number }>();
  for (const r of f) {
    if (r.pin_id) {
      const cur = byPin.get(r.pin_id) ?? { pin_id: r.pin_id, product_slug: r.product_slug, board_name: r.board_name, revenue: 0, purchases: 0, clicks: 0, impressions: 0 };
      cur.revenue += r.revenue_cents; cur.purchases += r.purchases; cur.clicks += r.outbound_clicks; cur.impressions += r.impressions;
      byPin.set(r.pin_id, cur);
    }
    if (r.board_name) {
      const cur = byBoardRev.get(r.board_name) ?? { board_name: r.board_name, revenue: 0, purchases: 0, clicks: 0 };
      cur.revenue += r.revenue_cents; cur.purchases += r.purchases; cur.clicks += r.outbound_clicks;
      byBoardRev.set(r.board_name, cur);
    }
    if (r.product_id) {
      const cur = byProductRev.get(r.product_id) ?? { product_id: r.product_id, product_slug: r.product_slug, revenue: 0, purchases: 0, atc: 0, pv: 0, clicks: 0, impressions: 0 };
      cur.revenue += r.revenue_cents; cur.purchases += r.purchases; cur.atc += r.add_to_carts; cur.pv += r.product_views; cur.clicks += r.outbound_clicks; cur.impressions += r.impressions;
      byProductRev.set(r.product_id, cur);
    }
  }

  const top20Winners = [...byProductRev.values()]
    .map((p) => ({
      ...p,
      revenue_usd: Math.round(p.revenue) / 100,
      atc_rate: p.pv > 0 ? p.atc / p.pv : 0,
      conv_rate: p.pv > 0 ? p.purchases / p.pv : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.purchases - a.purchases)
    .slice(0, 20);

  // ROAS (organic — no ad spend): proxy = revenue per 1000 impressions + revenue per click.
  const rpm30 = totals30.impressions > 0 ? (totals30.revenue / 100) / (totals30.impressions / 1000) : 0;
  const rpc30 = totals30.clicks > 0 ? (totals30.revenue / 100) / totals30.clicks : 0;

  // US-share snapshot for the dashboard.
  const usShares = await computeUsShares(sb);
  const usByBoardTop = [...usShares.byBoard.entries()]
    .map(([id, share]) => ({ id, share: Number(share.toFixed(3)) }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 20);

  return {
    today: { published: publishedToday ?? 0 },
    pipeline: { drafts: draftsCount ?? 0, ready: readyCount ?? 0 },
    last7d: { impressions: agg7.i, clicks: agg7.c, saves: agg7.s, ctr: ctr7 },
    monthlyTrend: [...trend.values()],
    topBoards,
    topProducts,
    revenue30d: { revenue: Math.round(revenue30 * 100) / 100, orders: orders30 },
    productionBoards: prodBoards ?? 0,
    usTraffic: {
      overall_share: Number(usShares.overall.toFixed(3)),
      target: US_SHARE_TARGET,
      floor: US_SHARE_FLOOR,
      sample_size: usShares.sampleSize,
      board_count_tracked: usShares.byBoard.size,
      product_count_tracked: usShares.byProduct.size,
      top_us_boards: usByBoardTop,
    },
    revenue: {
      last7d: {
        revenue_usd: Math.round(totals7.revenue) / 100,
        purchases: totals7.purchases,
        checkouts: totals7.checkouts,
        add_to_carts: totals7.atc,
        product_views: totals7.pv,
        clicks: totals7.clicks,
        impressions: totals7.impressions,
        atc_rate: totals7.pv > 0 ? totals7.atc / totals7.pv : 0,
        conv_rate: totals7.pv > 0 ? totals7.purchases / totals7.pv : 0,
      },
      last30d: {
        revenue_usd: Math.round(totals30.revenue) / 100,
        purchases: totals30.purchases,
        checkouts: totals30.checkouts,
        add_to_carts: totals30.atc,
        product_views: totals30.pv,
        clicks: totals30.clicks,
        impressions: totals30.impressions,
        atc_rate: totals30.pv > 0 ? totals30.atc / totals30.pv : 0,
        conv_rate: totals30.pv > 0 ? totals30.purchases / totals30.pv : 0,
      },
      roas: {
        mode: "organic",
        revenue_per_1000_impressions_usd: Math.round(rpm30 * 100) / 100,
        revenue_per_click_usd: Math.round(rpc30 * 100) / 100,
        note: "Pinterest organic — no paid spend. Treat RPM/RPC as ROAS proxies.",
      },
      byBoard: [...byBoardRev.values()].map((b) => ({ ...b, revenue_usd: Math.round(b.revenue) / 100 })).sort((a, b) => b.revenue - a.revenue).slice(0, 20),
      byPin: [...byPin.values()].map((p) => ({ ...p, revenue_usd: Math.round(p.revenue) / 100 })).sort((a, b) => b.revenue - a.revenue).slice(0, 20),
      top20Winners,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const url = new URL(req.url);
    let action = url.searchParams.get("action") ?? "dashboard";
    let opts: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        const body = await req.json();
        action = body.action ?? action;
        opts = body ?? {};
      } catch { /* noop */ }
    }

    if (action === "dashboard" || action === "status") {
      const data = await buildDashboard(sb);
      return json({ ok: true, traceId, ...data });
    }

    if (action === "run") {
      const productsPerRun = Number(opts.productsPerRun ?? DEFAULTS.productsPerRun);
      const variantsPerProduct = Number(opts.variantsPerProduct ?? DEFAULTS.variantsPerProduct);
      const perBoardCap = Number(opts.perBoardDailyCap ?? DEFAULTS.perBoardDailyCap);
      const scoreThreshold = Number(opts.autoApproveScoreThreshold ?? DEFAULTS.autoApproveScoreThreshold);

      // Verify at least one production board exists — fail fast if not.
      const { count: prodBoards } = await sb
        .from("pinterest_boards")
        .select("id", { count: "exact", head: true })
        .eq("is_sandbox", false)
        .eq("is_blacklisted", false)
        .eq("production_verified", true);
      if (!prodBoards) {
        return json({ ok: false, traceId, error: "NO_PRODUCTION_BOARDS — safety halt" }, 412);
      }

      const usShares = await computeUsShares(sb);
      const selection = await selectProducts(sb, productsPerRun, usShares);
      const products = selection.products;
      const generation = [] as Array<{ slug: string; ok: boolean; drafts: number; error?: string }>;
      for (const p of products) {
        const r = await callCreativeDirector(p.slug, variantsPerProduct, {
          us_focus: true,
          us_keywords: pickUsKeywords(p),
          us_state: pickUsState(p.slug),
          niche: detectNicheLite(p),
        });
        generation.push({ slug: p.slug, ...r });
      }

      const approval = await autoApproveSafeDrafts(sb, perBoardCap, scoreThreshold, usShares);
      const retire = await retirePoorPerformers(sb);

      const report = {
        ok: true,
        traceId,
        ranAt: new Date().toISOString(),
        version: "v3-us",
        productsSelected: products.length,
        productSlugs: products.map((p) => p.slug),
        forcePromoted: selection.forcePromoted,
        excludedProductCount: selection.excluded.length,
        categoryThrottled: selection.categoryThrottled,
        categoryDistribution: selection.categoryDistribution,
        usSharesByPickedProduct: selection.usSharesByPickedProduct,
        usIntelligence: {
          overallUsShare: Number(usShares.overall.toFixed(3)),
          sampleSize: usShares.sampleSize,
          target: US_SHARE_TARGET,
          floor: US_SHARE_FLOOR,
          boardsTracked: usShares.byBoard.size,
          productsTracked: usShares.byProduct.size,
        },
        generation,
        totalDraftsGenerated: generation.reduce((a, g) => a + (g.drafts || 0), 0),
        approval,
        retire,
        config: {
          productsPerRun,
          variantsPerProduct,
          perBoardCap,
          scoreThreshold,
          maxCategoryShare: DEFAULTS.maxCategoryShare,
          maxTitleWords: MAX_TITLE_WORDS,
          maxOverlayWords: 6,
          bannedOverlayPhrases: BANNED_OVERLAY_PHRASES,
          demotedGenericBoards: [...GENERIC_BOARDS],
          usShareFloor: US_SHARE_FLOOR,
          usShareTarget: US_SHARE_TARGET,
        },
      };

      // Persist run summary (non-blocking)
      await sb.from("pinterest_evolution_log").insert({
        decision_type: "growth_engine_run",
        niche_key: "engine",
        rationale: `selected ${products.length} products, generated ${report.totalDraftsGenerated} drafts, approved ${approval.approved}`,
        metrics: report,
      }).then(() => null, () => null);

      return json(report);
    }

    return json({ ok: false, traceId, error: `unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ ok: false, traceId, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});