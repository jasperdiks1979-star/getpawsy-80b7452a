// Pinterest Revenue Engine V4 — self-healing 6-hourly optimization loop.
//
// Actions (POST { action }):
//   "loop"             — full cycle (snapshot → score boards → tier products → expand keywords → generate titles → regen losers → trigger growth-engine)
//   "snapshot_us"      — write today's row to pinterest_us_share_daily
//   "score_boards"     — recompute pinterest_boards.health_score / tier / us_share_30d / clicks_30d
//   "tier_products"    — recompute pinterest_product_tiers from pinterest_revenue_scores
//   "expand_keywords"  — generate ~50 long-tail keywords/product (top 20 winners) via Lovable AI
//   "generate_titles"  — generate 10 ≤5-word title variants/product (top 20 winners) via Lovable AI
//   "regen_losers_top50" — call pinterest-creative-director for 50 worst-CTR live pins (4 AI-lifestyle variants each)
//   "dashboard"        — V4 dashboard payload for /admin/pinterest-revenue-engine

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { countryWeight, isPriorityCategory } from "../_shared/pinterest-priority-categories.ts";
import { detectNicheLite } from "../_shared/pinterest-us-keywords.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

function jsonResp(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

// ===== Phase 1: US/CA/AU daily snapshot =====
async function snapshotUs(sb: ReturnType<typeof createClient>) {
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { data: rows } = await sb
    .from("visitor_activity")
    .select("country, page_path, utm_source, is_internal, activity_type, product_id")
    .gte("created_at", since)
    .ilike("utm_source", "%pinterest%")
    .eq("is_internal", false)
    .limit(20_000);
  let us = 0, ca = 0, au = 0, other = 0, total = 0;
  let weighted = 0;
  const usByProduct = new Map<string, number>();
  for (const r of (rows ?? []) as Array<{ country: string | null; product_id: string | null }>) {
    total++;
    const c = (r.country ?? "").trim().toUpperCase();
    if (c === "US" || c.startsWith("UNITED STATES")) { us++; if (r.product_id) usByProduct.set(r.product_id, (usByProduct.get(r.product_id) ?? 0) + 1); }
    else if (c === "CA" || c.startsWith("CANADA")) ca++;
    else if (c === "AU" || c.startsWith("AUSTRALIA")) au++;
    else other++;
    weighted += countryWeight(r.country);
  }
  const usShare = total ? us / total : 0;
  const tier1 = total ? (us + ca + au) / total : 0;
  const topUsProducts = [...usByProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([product_id, n]) => ({ product_id, us_clicks: n }));

  // Top US boards via pinterest_pin_queue join (last 14d posted pins → board_id by US click count).
  const { data: pins } = await sb
    .from("pinterest_pin_queue")
    .select("pinterest_pin_id, board_id, board_name")
    .eq("status", "posted")
    .gte("posted_at", new Date(Date.now() - 14 * 86400_000).toISOString())
    .not("board_id", "is", null)
    .limit(5000);
  const pinToBoard = new Map<string, { id: string; name: string | null }>();
  for (const p of (pins ?? []) as { pinterest_pin_id: string | null; board_id: string; board_name: string | null }[]) {
    if (p.pinterest_pin_id) pinToBoard.set(p.pinterest_pin_id, { id: p.board_id, name: p.board_name });
  }
  const boardUs = new Map<string, { name: string | null; us: number; total: number }>();
  for (const r of (rows ?? []) as Array<{ country: string | null; page_path: string | null }>) {
    const m = (r.page_path ?? "").match(/pin\/([^/?#]+)/);
    if (!m) continue;
    const board = pinToBoard.get(m[1]);
    if (!board) continue;
    const cur = boardUs.get(board.id) ?? { name: board.name, us: 0, total: 0 };
    cur.total++;
    if ((r.country ?? "").toUpperCase() === "US" || (r.country ?? "").toLowerCase().startsWith("united states")) cur.us++;
    boardUs.set(board.id, cur);
  }
  const topUsBoards = [...boardUs.entries()]
    .filter(([_, v]) => v.total >= 5)
    .map(([id, v]) => ({ board_id: id, board_name: v.name, us_share: v.us / v.total, sample: v.total }))
    .sort((a, b) => b.us_share - a.us_share)
    .slice(0, 10);

  await sb.from("pinterest_us_share_daily").upsert({
    day: todayIso(),
    total_clicks: total,
    us_clicks: us, ca_clicks: ca, au_clicks: au, other_clicks: other,
    us_share: usShare,
    tier1_share: tier1,
    weighted_score: total ? weighted / total : 0,
    top_us_boards: topUsBoards,
    top_us_products: topUsProducts,
    computed_at: new Date().toISOString(),
  }, { onConflict: "day" });
  return { total, us, ca, au, other, us_share: usShare, tier1_share: tier1, top_us_boards: topUsBoards.length };
}

// ===== Phase 7: Board health score =====
async function scoreBoards(sb: ReturnType<typeof createClient>) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  // Aggregate per board from pinterest_revenue_scores via board_name (no board_id on funnel).
  const { data: rev } = await sb
    .from("pinterest_revenue_scores")
    .select("board_name, impressions, outbound_clicks, saves, purchases, revenue_cents")
    .gte("day", since)
    .limit(20_000);
  const agg = new Map<string, { i: number; c: number; s: number; r: number; p: number }>();
  for (const r of (rev ?? []) as { board_name: string | null; impressions: number; outbound_clicks: number; saves: number; purchases: number; revenue_cents: number }[]) {
    if (!r.board_name) continue;
    const cur = agg.get(r.board_name) ?? { i: 0, c: 0, s: 0, r: 0, p: 0 };
    cur.i += r.impressions; cur.c += r.outbound_clicks; cur.s += r.saves; cur.r += r.revenue_cents; cur.p += r.purchases;
    agg.set(r.board_name, cur);
  }
  // US shares per board (last 30d) — reuse logic from snapshot.
  const { data: snap } = await sb.from("pinterest_us_share_daily").select("top_us_boards").order("day", { ascending: false }).limit(7);
  const usShareByBoardId = new Map<string, number>();
  for (const row of (snap ?? []) as { top_us_boards: Array<{ board_id: string; us_share: number }> }[]) {
    for (const b of row.top_us_boards ?? []) {
      if (!usShareByBoardId.has(b.board_id)) usShareByBoardId.set(b.board_id, b.us_share);
    }
  }
  // Update boards.
  const { data: boards } = await sb.from("pinterest_boards").select("id, name, is_blacklisted, is_sandbox, production_verified");
  let updated = 0;
  for (const b of (boards ?? []) as { id: string; name: string; is_blacklisted: boolean; is_sandbox: boolean; production_verified: boolean }[]) {
    const m = agg.get(b.name);
    const clicks = m?.c ?? 0;
    const saves = m?.s ?? 0;
    const impressions = m?.i ?? 0;
    const revenue = m?.r ?? 0;
    const usShare = usShareByBoardId.get(b.id) ?? null;
    const ctr = impressions ? clicks / impressions : 0;
    // Health composite 0–100: 40% CTR (normalized to 5%=full), 30% US share, 20% revenue presence, 10% volume.
    const ctrPart = Math.min(40, ctr * 800);
    const usPart = (usShare ?? 0) * 30;
    const revPart = revenue > 0 ? Math.min(20, Math.log10(1 + revenue / 100) * 6) : 0;
    const volPart = Math.min(10, Math.log10(1 + impressions) * 2.5);
    const health = Math.round(ctrPart + usPart + revPart + volPart);
    const tier = b.is_blacklisted || b.is_sandbox || !b.production_verified ? "blacklisted"
      : health >= 60 ? "top" : health >= 30 ? "mid" : "low";
    await sb.from("pinterest_boards").update({
      health_score: health, tier, us_share_30d: usShare,
      clicks_30d: clicks, saves_30d: saves, revenue_cents_30d: revenue,
      last_scored_at: new Date().toISOString(),
    }).eq("id", b.id);
    updated++;
  }
  return { boards_scored: updated };
}

// ===== Phase 3: Product tiers (winner/neutral/loser) =====
async function tierProducts(sb: ReturnType<typeof createClient>) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data: rows } = await sb
    .from("pinterest_revenue_scores")
    .select("product_id, product_slug, impressions, outbound_clicks, saves, add_to_carts, purchases, revenue_cents")
    .gte("day", since)
    .not("product_id", "is", null)
    .limit(20_000);
  const agg = new Map<string, { slug: string | null; i: number; c: number; s: number; atc: number; p: number; r: number }>();
  for (const r of (rows ?? []) as { product_id: string; product_slug: string | null; impressions: number; outbound_clicks: number; saves: number; add_to_carts: number; purchases: number; revenue_cents: number }[]) {
    const cur = agg.get(r.product_id) ?? { slug: r.product_slug, i: 0, c: 0, s: 0, atc: 0, p: 0, r: 0 };
    cur.i += r.impressions; cur.c += r.outbound_clicks; cur.s += r.saves; cur.atc += r.add_to_carts; cur.p += r.purchases; cur.r += r.revenue_cents;
    agg.set(r.product_id, cur);
  }
  let winners = 0, neutrals = 0, losers = 0, untested = 0;
  for (const [product_id, v] of agg.entries()) {
    const ctr = v.i ? v.c / v.i : 0;
    // Score: revenue dominates, then ATC, then outbound clicks, then saves.
    const score = (v.r / 100) * 1.0 + v.p * 20 + v.atc * 4 + v.c * 1.5 + v.s * 0.6 + ctr * 500;
    let tier: "winner" | "neutral" | "loser" | "untested";
    let reason: string;
    if (v.i < 200) { tier = "untested"; reason = `insufficient impressions (${v.i})`; untested++; }
    else if (v.r >= 500 || v.p >= 1 || (ctr >= 0.015 && v.c >= 20)) { tier = "winner"; reason = `rev=$${(v.r/100).toFixed(2)} ctr=${(ctr*100).toFixed(2)}%`; winners++; }
    else if (v.i >= 800 && v.c <= 2) { tier = "loser"; reason = `${v.i} impressions, ${v.c} clicks`; losers++; }
    else { tier = "neutral"; reason = "mid-band"; neutrals++; }
    await sb.from("pinterest_product_tiers").upsert({
      product_id, product_slug: v.slug, tier, score: Math.round(score), reason,
      impressions_30d: v.i, outbound_clicks_30d: v.c, add_to_carts_30d: v.atc,
      purchases_30d: v.p, revenue_cents_30d: v.r, computed_at: new Date().toISOString(),
    }, { onConflict: "product_id" });
  }
  return { winners, neutrals, losers, untested, total: agg.size };
}

// ===== Phase 5: Long-tail keyword expansion via Lovable AI =====
async function aiGenerate(systemPrompt: string, userPrompt: string, maxItems = 50): Promise<string[]> {
  if (!LOVABLE_API_KEY) return [];
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return [];
    const j = await res.json();
    const txt = j?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(txt);
    const arr = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed.keywords) ? parsed.keywords : Array.isArray(parsed.titles) ? parsed.titles : [];
    return arr.filter((x: unknown) => typeof x === "string").slice(0, maxItems);
  } catch { return []; }
}

async function expandKeywords(sb: ReturnType<typeof createClient>, topN = 20) {
  // Pick top-N winners by score that have <30 keywords in the bank.
  const { data: tiers } = await sb
    .from("pinterest_product_tiers")
    .select("product_id, product_slug")
    .eq("tier", "winner")
    .order("score", { ascending: false })
    .limit(topN);
  let totalInserted = 0;
  for (const t of (tiers ?? []) as { product_id: string; product_slug: string }[]) {
    const { count } = await sb.from("pinterest_keyword_bank").select("id", { count: "exact", head: true }).eq("product_id", t.product_id);
    if ((count ?? 0) >= 30) continue;
    const { data: prod } = await sb.from("products").select("name, category, slug").eq("id", t.product_id).maybeSingle();
    if (!prod) continue;
    const p = prod as { name: string; category: string | null; slug: string };
    const niche = detectNicheLite({ name: p.name, slug: p.slug, category: p.category });
    const sysP = "You are a Pinterest US-audience SEO strategist. Generate long-tail keywords ONLY. No hashtags. No emojis. US English. Each keyword 3-7 words.";
    const userP = `Product: "${p.name}" (niche: ${niche}). Generate 50 long-tail Pinterest search keywords that US pet parents would type. Mix: state modifiers (Texas, California, Florida), apartment/small-space modifiers, family modifiers, indoor modifiers, luxury modifiers, problem-solving phrases. Return JSON {"keywords": ["..."]}`;
    const kws = await aiGenerate(sysP, userP, 50);
    if (!kws.length) continue;
    for (const k of kws) {
      const kw = k.toLowerCase().trim();
      if (kw.length < 5 || kw.length > 80) continue;
      await sb.from("pinterest_keyword_bank").upsert({
        product_id: t.product_id, product_slug: t.product_slug, niche, keyword: kw,
        source: "ai_expander", score: 60,
      }, { onConflict: "product_id,keyword" });
      totalInserted++;
    }
  }
  return { products_expanded: (tiers ?? []).length, keywords_inserted: totalInserted };
}

// ===== Phase 4: 10 title variants per winner =====
async function generateTitles(sb: ReturnType<typeof createClient>, topN = 20) {
  const { data: tiers } = await sb
    .from("pinterest_product_tiers")
    .select("product_id, product_slug")
    .eq("tier", "winner")
    .order("score", { ascending: false })
    .limit(topN);
  let inserted = 0;
  for (const t of (tiers ?? []) as { product_id: string; product_slug: string }[]) {
    const { count } = await sb.from("pinterest_title_variants").select("id", { count: "exact", head: true }).eq("product_id", t.product_id);
    if ((count ?? 0) >= 8) continue;
    const { data: prod } = await sb.from("products").select("name, category, slug").eq("id", t.product_id).maybeSingle();
    if (!prod) continue;
    const p = prod as { name: string; category: string | null; slug: string };
    const niche = detectNicheLite({ name: p.name, slug: p.slug, category: p.category });
    const sysP = "You are a Pinterest US-audience copywriter. Generate pin titles ONLY. Each title MUST be 3-5 words. No CTAs. No 'Shop Now', 'Click Here', 'Browse'. No emojis. Title Case.";
    const userP = `Product: "${p.name}" (niche: ${niche}). Generate 10 Pinterest pin titles, each 3-5 words. Mix: apartment/small-space variants, family variants, indoor variants, luxury variants, state-specific (Texas, California). Return JSON {"titles": ["..."]}`;
    const titles = await aiGenerate(sysP, userP, 10);
    for (const title of titles) {
      const wc = title.trim().split(/\s+/).filter(Boolean).length;
      if (wc < 3 || wc > 5) continue;
      await sb.from("pinterest_title_variants").upsert({
        product_id: t.product_id, product_slug: t.product_slug, niche, title: title.trim(), word_count: wc,
      }, { onConflict: "product_id,title" });
      inserted++;
    }
  }
  return { products_titled: (tiers ?? []).length, titles_inserted: inserted };
}

// ===== Regenerate top 50 worst-CTR live pins via creative-director =====
async function regenLosersTop50(sb: ReturnType<typeof createClient>) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data: scored } = await sb
    .from("pinterest_revenue_scores")
    .select("pin_id, product_slug, impressions, outbound_clicks, classification")
    .gte("day", since)
    .gte("impressions", 200)
    .order("ctr", { ascending: true })
    .limit(50);
  const slugs = [...new Set(((scored ?? []) as { product_slug: string | null }[]).map((s) => s.product_slug).filter(Boolean))] as string[];
  let triggered = 0;
  for (const slug of slugs.slice(0, 50)) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/pinterest-creative-director`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ action: "run_full", slug, count: 4, us_focus: true }),
      });
      triggered++;
    } catch { /* swallow */ }
  }
  return { regen_triggered: triggered, candidate_slugs: slugs.length };
}

// ===== Dashboard =====
async function buildDashboard(sb: ReturnType<typeof createClient>) {
  const [snap, boards, tiers, kw, titles] = await Promise.all([
    sb.from("pinterest_us_share_daily").select("*").order("day", { ascending: false }).limit(30),
    sb.from("pinterest_boards").select("id, name, health_score, tier, us_share_30d, clicks_30d, saves_30d, revenue_cents_30d").order("health_score", { ascending: false, nullsFirst: false }).limit(30),
    sb.from("pinterest_product_tiers").select("product_id, product_slug, tier, score, impressions_30d, outbound_clicks_30d, revenue_cents_30d").order("score", { ascending: false }).limit(50),
    sb.from("pinterest_keyword_bank").select("id", { count: "exact", head: true }),
    sb.from("pinterest_title_variants").select("id", { count: "exact", head: true }),
  ]);
  const snapRows = (snap.data ?? []) as Array<{ day: string; us_share: number; tier1_share: number; total_clicks: number }>;
  return {
    ok: true,
    version: "v4",
    us_share_today: snapRows[0]?.us_share ?? null,
    us_share_7d_avg: snapRows.slice(0, 7).reduce((a, r) => a + (r.us_share ?? 0), 0) / Math.max(1, Math.min(7, snapRows.length)),
    tier1_share_today: snapRows[0]?.tier1_share ?? null,
    us_share_history: snapRows,
    boards: boards.data ?? [],
    products: tiers.data ?? [],
    tier_counts: {
      winner: (tiers.data ?? []).filter((t: { tier: string }) => t.tier === "winner").length,
      neutral: (tiers.data ?? []).filter((t: { tier: string }) => t.tier === "neutral").length,
      loser: (tiers.data ?? []).filter((t: { tier: string }) => t.tier === "loser").length,
    },
    keyword_bank_size: kw.count ?? 0,
    title_variant_count: titles.count ?? 0,
  };
}

// ===== Full loop =====
async function fullLoop(sb: ReturnType<typeof createClient>) {
  const started = Date.now();
  const snap = await snapshotUs(sb);
  const scoreB = await scoreBoards(sb);
  const tier = await tierProducts(sb);
  const kw = await expandKeywords(sb, 20);
  const tit = await generateTitles(sb, 20);
  // Trigger growth-engine run so new tiers/categories are immediately reflected.
  let growth: unknown = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-growth-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ action: "run" }),
    });
    growth = await res.json().catch(() => ({}));
  } catch (e) { growth = { error: String(e) }; }
  return {
    ok: true, version: "v4", elapsed_ms: Date.now() - started,
    snapshot: snap, boards: scoreB, products: tier, keywords: kw, titles: tit, growth_engine: growth,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "loop";
    if (action === "snapshot_us") return jsonResp(200, { ok: true, ...(await snapshotUs(sb)) });
    if (action === "score_boards") return jsonResp(200, { ok: true, ...(await scoreBoards(sb)) });
    if (action === "tier_products") return jsonResp(200, { ok: true, ...(await tierProducts(sb)) });
    if (action === "expand_keywords") return jsonResp(200, { ok: true, ...(await expandKeywords(sb, body.topN ?? 20)) });
    if (action === "generate_titles") return jsonResp(200, { ok: true, ...(await generateTitles(sb, body.topN ?? 20)) });
    if (action === "regen_losers_top50") return jsonResp(200, { ok: true, ...(await regenLosersTop50(sb)) });
    if (action === "dashboard") return jsonResp(200, await buildDashboard(sb));
    if (action === "loop") return jsonResp(200, await fullLoop(sb));
    return jsonResp(400, { ok: false, error: `unknown action: ${action}` });
  } catch (e) {
    return jsonResp(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});