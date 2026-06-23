// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ───────────────────────────────────────────────────────── utils
function pct(arr: number[], values: number[]): number[] {
  // min/max normalization to 0..100
  const valid = arr.filter((v) => Number.isFinite(v));
  if (!valid.length) return values.map(() => 0);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min || 1;
  return values.map((v) => {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, ((v - min) / span) * 100));
  });
}

function tierOf(rank: number, total: number): "A" | "B" | "C" | "D" {
  const p = rank / Math.max(total, 1);
  if (p < 0.05) return "A";
  if (p < 0.20) return "B";
  if (p < 0.50) return "C";
  return "D";
}

// Active catalog definition
const ACTIVE_FILTER = (q: any) =>
  q.eq("is_active", true);

// ───────────────────────────────────────────────────────── data gather
async function gatherCatalog() {
  // products
  const { data: products, error: pErr } = await admin
    .from("products")
    .select("id, slug, name, category, price, cost_price, margin_percent, stock, us_stock, eu_stock, variant_stock, created_at")
    .eq("is_active", true)
    .limit(2000);
  if (pErr) throw pErr;

  const ids = (products ?? []).map((p: any) => p.id);

  // intelligence
  const { data: intel } = await admin
    .from("product_intelligence")
    .select("product_id, opportunity_score, conversion_score, trend_score, merchant_feed_quality_score, keyword_score, seo_title, seo_description, pinterest_topics, primary_board")
    .in("product_id", ids);
  const intelMap = new Map((intel ?? []).map((r: any) => [r.product_id, r]));

  // pinterest momentum from pinterest_pin_performance (product_id is text)
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: pins } = await admin
    .from("pinterest_pin_performance")
    .select("product_id, impressions, clicks, saves, ctr, performance_score, updated_at")
    .gte("updated_at", since)
    .limit(20000);
  const pinAgg = new Map<string, { imp: number; clk: number; sav: number; ctr: number; score: number; n: number }>();
  for (const r of pins ?? []) {
    const k = String((r as any).product_id ?? "");
    if (!k) continue;
    const cur = pinAgg.get(k) ?? { imp: 0, clk: 0, sav: 0, ctr: 0, score: 0, n: 0 };
    cur.imp += Number((r as any).impressions ?? 0);
    cur.clk += Number((r as any).clicks ?? 0);
    cur.sav += Number((r as any).saves ?? 0);
    cur.ctr += Number((r as any).ctr ?? 0);
    cur.score += Number((r as any).performance_score ?? 0);
    cur.n += 1;
    pinAgg.set(k, cur);
  }

  // video coverage: cinematic_v3_jobs completed OR pinterest_video_assets
  const { data: v3 } = await admin
    .from("cinematic_v3_jobs")
    .select("product_id, status")
    .in("product_id", ids);
  const videoSet = new Set<string>();
  for (const r of v3 ?? []) {
    if ((r as any).status === "complete" || (r as any).status === "completed") {
      videoSet.add(String((r as any).product_id));
    }
  }
  const { data: pv } = await admin
    .from("pinterest_video_assets")
    .select("product_id")
    .in("product_id", ids)
    .limit(20000);
  for (const r of pv ?? []) videoSet.add(String((r as any).product_id));

  return { products: products ?? [], intelMap, pinAgg, videoSet };
}

// ───────────────────────────────────────────────────────── compute
function inventoryRaw(p: any): number {
  const us = Number(p.us_stock ?? 0);
  const eu = Number(p.eu_stock ?? 0);
  const total = Number(p.effective_stock ?? p.stock ?? us + eu);
  if (total <= 0) return 0; // OOS heavily penalized
  // weight US > EU, with variant breadth bonus
  const variants = Array.isArray(p.variant_stock) ? p.variant_stock.length : (p.variant_stock ? Object.keys(p.variant_stock).length : 0);
  return Math.min(1000, us * 1.2 + eu * 0.6 + variants * 5 + Math.min(total, 50));
}

function ageRaw(p: any): number {
  const created = new Date(p.created_at).getTime();
  const days = (Date.now() - created) / (24 * 3600 * 1000);
  // sweet spot 30..180 days
  if (days < 14) return 10;
  if (days <= 180) return 100 - Math.abs(105 - days) * 0.3;
  if (days <= 365) return 70;
  return 40;
}

function seoRaw(intel: any): number {
  if (!intel) return 0;
  let s = 0;
  const t = String(intel.seo_title ?? "");
  const d = String(intel.seo_description ?? "");
  if (t.length >= 30 && t.length <= 65) s += 50;
  else if (t.length > 0) s += 25;
  if (d.length >= 120 && d.length <= 160) s += 30;
  else if (d.length > 0) s += 15;
  s += Math.min(20, Number(intel.keyword_score ?? 0) * 0.2);
  return s;
}

function marginRaw(p: any, medianMargin: number): number | null {
  const price = Number(p.price ?? 0);
  const cost = Number(p.cost_price ?? 0);
  if (price > 0 && cost > 0 && cost < price) {
    return ((price - cost) / price) * 100;
  }
  return null; // signal missing → fill with median
}

function pinterestRaw(agg: { imp: number; clk: number; sav: number; ctr: number; score: number; n: number } | undefined): number {
  if (!agg || agg.n === 0) return 0;
  // composite raw: weighted impressions/clicks/saves with recency baked in by 30d window
  const ctrAvg = agg.ctr / agg.n;
  return agg.imp * 0.0005 + agg.clk * 0.05 + agg.sav * 0.5 + ctrAvg * 10 + (agg.score / agg.n) * 0.3;
}

function computeAll(ctx: Awaited<ReturnType<typeof gatherCatalog>>) {
  const { products, intelMap, pinAgg, videoSet } = ctx;

  // Raw values
  const raws = products.map((p: any) => {
    const intel: any = intelMap.get(p.id) ?? null;
    const pin = pinAgg.get(String(p.id));
    return {
      p,
      intel,
      raw_pin: pinterestRaw(pin),
      raw_conv: Number(intel?.conversion_score ?? 0),
      raw_margin: marginRaw(p, 0),
      raw_opp: Number(intel?.opportunity_score ?? 0),
      raw_inv: inventoryRaw(p),
      raw_age: ageRaw(p),
      raw_video: videoSet.has(String(p.id)) ? 100 : 0,
      raw_seo: seoRaw(intel),
    };
  });

  // Margin median fallback
  const marginValues = raws.map((r) => r.raw_margin).filter((v): v is number => v !== null);
  marginValues.sort((a, b) => a - b);
  const medianMargin = marginValues.length ? marginValues[Math.floor(marginValues.length / 2)] : 30;
  for (const r of raws) if (r.raw_margin === null) r.raw_margin = medianMargin;

  // Normalize each input across full population
  const pop = {
    pin: raws.map((r) => r.raw_pin),
    conv: raws.map((r) => r.raw_conv),
    margin: raws.map((r) => r.raw_margin as number),
    opp: raws.map((r) => r.raw_opp),
    inv: raws.map((r) => r.raw_inv),
    age: raws.map((r) => r.raw_age),
    video: raws.map((r) => r.raw_video),
    seo: raws.map((r) => r.raw_seo),
  };
  const n = {
    pin: pct(pop.pin, pop.pin),
    conv: pct(pop.conv, pop.conv),
    margin: pct(pop.margin, pop.margin),
    opp: pct(pop.opp, pop.opp),
    inv: pct(pop.inv, pop.inv),
    age: pct(pop.age, pop.age),
    video: pop.video, // already 0/100
    seo: pct(pop.seo, pop.seo),
  };

  // Weighted score
  const scored = raws.map((r, i) => {
    const components = {
      pinterest: n.pin[i],
      conversion: n.conv[i],
      margin: n.margin[i],
      opportunity: n.opp[i],
      inventory: n.inv[i],
      age: n.age[i],
      video: n.video[i],
      seo: n.seo[i],
    };
    const score =
      components.pinterest * 0.30 +
      components.conversion * 0.20 +
      components.margin * 0.20 +
      components.opportunity * 0.10 +
      components.inventory * 0.10 +
      components.age * 0.05 +
      components.video * 0.03 +
      components.seo * 0.02;
    return {
      product_id: r.p.id,
      slug: r.p.slug,
      name: r.p.name,
      category: r.p.category,
      price: r.p.price,
      cost_price: r.p.cost_price,
      margin_percent: r.raw_margin,
      score: Math.round(score * 100) / 100,
      components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      raw: {
        pinterest: Math.round(r.raw_pin * 100) / 100,
        conversion: r.raw_conv,
        margin_percent: r.raw_margin,
        opportunity: r.raw_opp,
        inventory: r.raw_inv,
        age: Math.round(r.raw_age),
        video: r.raw_video > 0,
        seo: r.raw_seo,
      },
      has_pinterest_data: r.raw_pin > 0,
      has_video: r.raw_video > 0,
      has_cost: Number(r.p.cost_price ?? 0) > 0,
      legacy_opportunity: Number(r.intel?.opportunity_score ?? 0),
      legacy_conversion: Number(r.intel?.conversion_score ?? 0),
      legacy_trend: Number(r.intel?.trend_score ?? 0),
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // Diversification (category caps)
  const caps = [
    { topN: 25, max: 0.20 },
    { topN: 50, max: 0.20 },
    { topN: 100, max: 0.15 },
    { topN: 250, max: 0.12 },
  ];
  const diversificationLog: any[] = [];
  for (const cap of caps) {
    const limit = Math.max(1, Math.floor(cap.topN * cap.max));
    let pass = true;
    let guard = 0;
    while (pass && guard < 200) {
      guard += 1;
      pass = false;
      const inWindow = scored.slice(0, cap.topN);
      const counts = new Map<string, number>();
      for (const r of inWindow) {
        const c = String(r.category ?? "uncategorized");
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      for (const [cat, count] of counts) {
        if (count > limit) {
          // find the lowest-ranked offender inside the window
          const offenderIdx = [...inWindow]
            .map((r, idx) => ({ r, idx }))
            .filter(({ r }) => String(r.category ?? "uncategorized") === cat)
            .sort((a, b) => a.r.score - b.r.score)[0]?.idx;
          if (offenderIdx === undefined) continue;
          // find next product outside window from underrepresented category
          const replacement = scored.slice(cap.topN).findIndex(
            (r) => String(r.category ?? "uncategorized") !== cat,
          );
          if (replacement >= 0) {
            const absRepIdx = cap.topN + replacement;
            const removed = scored[offenderIdx];
            const promoted = scored[absRepIdx];
            scored.splice(absRepIdx, 1);
            scored.splice(offenderIdx, 1);
            scored.splice(offenderIdx, 0, promoted);
            scored.push(removed);
            diversificationLog.push({
              window: cap.topN,
              category: cat,
              demoted: removed.slug,
              promoted: promoted.slug,
            });
            pass = true;
            break;
          }
        }
      }
    }
  }

  // Assign tiers based on final rank
  const total = scored.length;
  scored.forEach((r: any, idx: number) => {
    r.rank = idx + 1;
    r.tier = tierOf(idx, total);
  });

  return { scored, diversificationLog, medianMargin };
}

async function persist(scored: any[]) {
  // Batch upserts to product_intelligence and products.margin_percent
  const now = new Date().toISOString();
  const chunks = (arr: any[], size: number) => {
    const out = [] as any[][];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  // products.margin_percent — only update where we have a real margin (cost present)
  const marginUpdates = scored.filter((r) => r.has_cost);
  for (const batch of chunks(marginUpdates, 100)) {
    await Promise.all(
      batch.map((r) =>
        admin.from("products").update({ margin_percent: r.margin_percent }).eq("id", r.product_id),
      ),
    );
  }

  // product_intelligence upsert
  const piRows = scored.map((r) => ({
    product_id: r.product_id,
    revenue_priority_score_v2: r.score,
    revenue_tier: r.tier,
    pinterest_momentum_score: r.components.pinterest,
    score_components_v2: {
      rank: r.rank,
      components: r.components,
      raw: r.raw,
      flags: {
        has_pinterest_data: r.has_pinterest_data,
        has_video: r.has_video,
        has_cost: r.has_cost,
      },
    },
    last_v2_computed_at: now,
  }));

  for (const batch of chunks(piRows, 100)) {
    const { error } = await admin
      .from("product_intelligence")
      .upsert(batch, { onConflict: "product_id" });
    if (error) throw error;
  }
}

function buildReport(scored: any[], diversificationLog: any[], medianMargin: number) {
  const total = scored.length;
  const dist = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of scored) (dist as any)[r.tier] += 1;

  const bucket = (v: number) => Math.min(9, Math.floor(v / 10));
  const histo = new Array(10).fill(0);
  for (const r of scored) histo[bucket(r.score)] += 1;

  const catMap = new Map<string, number>();
  for (const r of scored) {
    const c = String(r.category ?? "uncategorized");
    catMap.set(c, (catMap.get(c) ?? 0) + 1);
  }

  const slim = (r: any) => ({
    rank: r.rank, slug: r.slug, name: r.name, category: r.category,
    score: r.score, tier: r.tier,
    pinterest: r.components.pinterest, conversion: r.components.conversion,
    margin: r.components.margin, opportunity: r.components.opportunity,
    inventory: r.components.inventory, video: r.components.video,
    margin_percent: r.margin_percent, price: r.price,
    has_pinterest_data: r.has_pinterest_data, has_video: r.has_video, has_cost: r.has_cost,
  });

  const top50 = scored.slice(0, 50).map(slim);
  const top100 = scored.slice(0, 100).map(slim);
  const bottom100 = scored.slice(-100).map(slim);

  // Most improved/declined vs legacy proxy (legacy_opportunity rank)
  const legacyRanked = [...scored].sort((a, b) => (b.legacy_opportunity || 0) - (a.legacy_opportunity || 0));
  const legacyRank = new Map(legacyRanked.map((r, i) => [r.product_id, i + 1]));
  const deltas = scored.map((r) => ({
    ...slim(r),
    legacy_rank: legacyRank.get(r.product_id) ?? null,
    delta: (legacyRank.get(r.product_id) ?? r.rank) - r.rank,
  }));
  const improved = [...deltas].sort((a, b) => b.delta - a.delta).slice(0, 25);
  const declined = [...deltas].sort((a, b) => a.delta - b.delta).slice(0, 25);

  const pinWinners = [...scored].sort((a, b) => b.components.pinterest - a.components.pinterest).slice(0, 25).map(slim);
  const pinLosers = scored.filter((r) => !r.has_pinterest_data).slice(0, 25).map(slim);
  const inventoryRisks = scored.filter((r) => r.components.inventory < 10).slice(0, 50).map(slim);
  const marginLeaders = [...scored].sort((a, b) => (b.margin_percent || 0) - (a.margin_percent || 0)).slice(0, 25).map(slim);
  const missingVideos = scored.filter((r) => !r.has_video).slice(0, 50).map(slim);
  const missingPinterest = scored.filter((r) => !r.has_pinterest_data).slice(0, 50).map(slim);
  const missingCost = scored.filter((r) => !r.has_cost).slice(0, 50).map(slim);

  return {
    generated_at: new Date().toISOString(),
    version: "RPS_V2.0.0",
    store: "GetPawsy",
    catalog: { active_products: total, median_margin_pct: Math.round(medianMargin * 10) / 10 },
    tier_distribution: dist,
    score_histogram: histo.map((count, i) => ({ bucket: `${i * 10}-${i * 10 + 9}`, count })),
    category_distribution: [...catMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    top_50: top50,
    top_100: top100,
    bottom_100: bottom100,
    most_improved: improved,
    most_declined: declined,
    pinterest_winners: pinWinners,
    pinterest_losers: pinLosers,
    inventory_risks: inventoryRisks,
    margin_leaders: marginLeaders,
    missing_videos: missingVideos,
    missing_pinterest_data: missingPinterest,
    missing_cost_data: missingCost,
    diversification_log: diversificationLog,
    recommended_actions: [
      missingCost.length > 0 ? `Backfill cost_price on ${missingCost.length} products to unlock real margin scoring.` : null,
      missingPinterest.length > 0 ? `${missingPinterest.length} products have no Pinterest traction — queue them in Pinterest Autopilot.` : null,
      missingVideos.length > 0 ? `${missingVideos.length} products lack video assets — schedule Cinematic V3 generation.` : null,
      inventoryRisks.length > 0 ? `${inventoryRisks.length} products at inventory risk — verify CJ stock sync.` : null,
    ].filter(Boolean),
  };
}

// ───────────────────────────────────────────────────────── handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: require an authenticated admin
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ ok: false, message: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action ?? new URL(req.url).searchParams.get("action") ?? "report";

    const ctx = await gatherCatalog();
    const { scored, diversificationLog, medianMargin } = computeAll(ctx);

    if (action === "compute_all") {
      await persist(scored);
      return new Response(JSON.stringify({ ok: true, traceId: crypto.randomUUID(), persisted: scored.length, report: buildReport(scored, diversificationLog, medianMargin) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "validate" || action === "report") {
      return new Response(JSON.stringify({ ok: true, traceId: crypto.randomUUID(), report: buildReport(scored, diversificationLog, medianMargin) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: false, message: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("revenue-priority-v2 error:", e);
    return new Response(JSON.stringify({ ok: false, message: e?.message ?? "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});