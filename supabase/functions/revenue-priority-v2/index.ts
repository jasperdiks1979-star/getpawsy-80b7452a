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

// Percentile-rank normalization (0..100). Stable for skewed distributions.
function percentileRank(arr: number[], values: number[]): number[] {
  const sorted = arr.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!sorted.length) return values.map(() => 50);
  return values.map((v) => {
    if (!Number.isFinite(v)) return 50;
    // binary search lower bound
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] < v) lo = mid + 1; else hi = mid;
    }
    let hi2 = sorted.length;
    let lo2 = lo;
    while (lo2 < hi2) {
      const mid = (lo2 + hi2) >>> 1;
      if (sorted[mid] <= v) lo2 = mid + 1; else hi2 = mid;
    }
    const rank = (lo + lo2) / 2;
    return Math.max(0, Math.min(100, (rank / sorted.length) * 100));
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
    .select("id, slug, name, category, price, cost_price, margin_percent, stock, effective_stock, us_stock, eu_stock, variant_stock, created_at, image_url, images, description, pinterest_ready, pinterest_eligible, pinterest_status, pinterest_disabled, pinterest_category, is_duplicate, dedupe_key, stock_sync_status")
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

// ───────────────────────────────────────────────────────── V2.1 calibration
const PRIORITY_CATEGORIES = [
  "cat-litter-box","litter-box","cat-litter-boxes",
  "cat-tree","cat-trees",
  "dog-bed","dog-beds","orthopedic-dog-bed",
  "pet-fountain","pet-fountains","water-fountain",
];
const GENERIC_BUCKETS = ["pet-supplies","misc","uncategorized","other","general"];
const GENERIC_NAME_RX = /\b(pet|dog|cat)\s+(supplies|accessor|product|item|stuff|gear)\b/i;

function isPriorityCat(cat: any): boolean {
  const c = String(cat ?? "").toLowerCase().trim();
  if (!c) return false;
  return PRIORITY_CATEGORIES.some((p) => c === p || c.includes(p));
}
function isGenericBucket(cat: any): boolean {
  const c = String(cat ?? "").toLowerCase().trim();
  return !c || GENERIC_BUCKETS.includes(c);
}
function isGenericName(name: any): boolean {
  const n = String(name ?? "").trim();
  if (!n || n.length < 12) return true;
  if (GENERIC_NAME_RX.test(n)) return true;
  const words = n.split(/\s+/).length;
  if (words < 3) return true;
  return false;
}

function computeAllV21(ctx: Awaited<ReturnType<typeof gatherCatalog>>) {
  const { products, intelMap, pinAgg, videoSet } = ctx;

  const raws = products.map((p: any) => {
    const intel: any = intelMap.get(p.id) ?? null;
    const pin = pinAgg.get(String(p.id));
    return {
      p, intel,
      raw_pin: pinterestRaw(pin),
      raw_conv_present: intel?.conversion_score !== null && intel?.conversion_score !== undefined,
      raw_conv: Number(intel?.conversion_score ?? 0),
      raw_margin: marginRaw(p, 0),
      raw_opp_present: intel?.opportunity_score !== null && intel?.opportunity_score !== undefined,
      raw_opp: Number(intel?.opportunity_score ?? 0),
      raw_inv: inventoryRaw(p),
      raw_age: ageRaw(p),
      raw_video: videoSet.has(String(p.id)),
      raw_seo: seoRaw(intel),
      has_pinterest_data: !!(pin && pin.n > 0),
    };
  });

  const marginValues = raws.map((r) => r.raw_margin).filter((v): v is number => v !== null);
  marginValues.sort((a, b) => a - b);
  const medianMargin = marginValues.length ? marginValues[Math.floor(marginValues.length / 2)] : 30;
  for (const r of raws) if (r.raw_margin === null) r.raw_margin = medianMargin;

  // Percentile normalize over present-only populations (so missing = neutral 50, not hard 0)
  const pinPresent = raws.filter((r) => r.has_pinterest_data).map((r) => r.raw_pin);
  const convPresent = raws.filter((r) => r.raw_conv_present && r.raw_conv > 0).map((r) => r.raw_conv);
  const oppPresent = raws.filter((r) => r.raw_opp_present && r.raw_opp > 0).map((r) => r.raw_opp);
  const marginPop = raws.map((r) => r.raw_margin as number);
  const invPop = raws.map((r) => r.raw_inv);
  const agePop = raws.map((r) => r.raw_age);
  const seoPop = raws.map((r) => r.raw_seo);

  const n_pin = raws.map((r) =>
    r.has_pinterest_data ? percentileRank(pinPresent, [r.raw_pin])[0] : 50,
  );
  const n_conv = raws.map((r) =>
    r.raw_conv_present && r.raw_conv > 0 ? percentileRank(convPresent, [r.raw_conv])[0] : 50,
  );
  const n_opp = raws.map((r) =>
    r.raw_opp_present && r.raw_opp > 0 ? percentileRank(oppPresent, [r.raw_opp])[0] : 50,
  );
  const n_margin = percentileRank(marginPop, marginPop);
  const n_inv = percentileRank(invPop, invPop);
  const n_age = percentileRank(agePop, agePop);
  const n_seo = percentileRank(seoPop, seoPop);
  const n_video = raws.map((r) => (r.raw_video ? 80 : 50)); // neutral when missing
  // content readiness = blend(seo, age)
  const n_content = raws.map((_, i) => Math.round(n_seo[i] * 0.6 + n_age[i] * 0.4));
  // PMF / evergreen = blend(opportunity, age) + priority cat boost downstream
  const n_pmf = raws.map((r, i) => Math.round(n_opp[i] * 0.6 + n_age[i] * 0.4));

  // duplicate detection by normalized first-6-words name signature
  const sigCount = new Map<string, number>();
  const sigOf = (name: string) =>
    String(name ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, "").split(/\s+/).slice(0, 6).join(" ");
  for (const r of raws) {
    const s = sigOf(r.p.name);
    if (s) sigCount.set(s, (sigCount.get(s) ?? 0) + 1);
  }

  const scored = raws.map((r, i) => {
    const components = {
      pinterest: n_pin[i],
      conversion: n_conv[i],
      margin: n_margin[i],
      inventory: n_inv[i],
      pmf: n_pmf[i],
      content: n_content[i],
      video: n_video[i],
    };
    // V2.1 weights: 20/20/20/15/10/10/5
    let score =
      components.pinterest * 0.20 +
      components.conversion * 0.20 +
      components.margin * 0.20 +
      components.inventory * 0.15 +
      components.pmf * 0.10 +
      components.content * 0.10 +
      components.video * 0.05;

    // ── penalties
    const penalties: string[] = [];
    const genericName = isGenericName(r.p.name);
    const genericCat = isGenericBucket(r.p.category);
    const oos = r.raw_inv <= 0;
    const dup = (sigCount.get(sigOf(r.p.name)) ?? 0) > 1;
    if (genericName) { score -= 8; penalties.push("generic_name"); }
    if (genericCat)  { score -= 6; penalties.push("generic_category"); }
    if (oos)         { score -= 20; penalties.push("out_of_stock"); }
    if (dup)         { score -= 4; penalties.push("duplicate_signature"); }

    // ── boosts
    const boosts: string[] = [];
    if (r.has_pinterest_data && n_pin[i] >= 70) { score += 6; boosts.push("proven_pinterest"); }
    if (isPriorityCat(r.p.category))            { score += 8; boosts.push("priority_niche"); }
    const price = Number(r.p.price ?? 0);
    if (price >= 60 && r.raw_inv > 0 && n_inv[i] >= 50) { score += 4; boosts.push("high_ticket_in_stock"); }
    if (r.raw_video && r.raw_seo >= 60)         { score += 3; boosts.push("creative_ready"); }

    score = Math.max(0, Math.min(100, score));

    // data confidence: fraction of strong signals present
    const signals = [r.has_pinterest_data, r.raw_conv_present && r.raw_conv > 0, Number(r.p.cost_price ?? 0) > 0, r.raw_video, r.raw_opp_present && r.raw_opp > 0, r.raw_seo > 0];
    const confidence = Math.round((signals.filter(Boolean).length / signals.length) * 100);

    return {
      product_id: r.p.id,
      slug: r.p.slug,
      name: r.p.name,
      category: r.p.category,
      price: r.p.price,
      cost_price: r.p.cost_price,
      margin_percent: r.raw_margin,
      score: Math.round(score * 100) / 100,
      data_confidence: confidence,
      components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      penalties, boosts,
      has_pinterest_data: r.has_pinterest_data,
      has_video: r.raw_video,
      has_cost: Number(r.p.cost_price ?? 0) > 0,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const total = scored.length;
  scored.forEach((r: any, idx: number) => { r.rank = idx + 1; r.tier = tierOf(idx, total); });

  return { scored, medianMargin };
}

function buildV21Report(scored: any[], medianMargin: number) {
  const total = scored.length;
  const dist = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of scored) (dist as any)[r.tier] += 1;

  const histo = new Array(10).fill(0);
  for (const r of scored) histo[Math.min(9, Math.floor(r.score / 10))] += 1;

  const bands = {
    "80-100": scored.filter((r) => r.score >= 80).length,
    "60-79":  scored.filter((r) => r.score >= 60 && r.score < 80).length,
    "40-59":  scored.filter((r) => r.score >= 40 && r.score < 60).length,
    "0-39":   scored.filter((r) => r.score < 40).length,
  };

  const catMap = new Map<string, number>();
  for (const r of scored) {
    const c = String(r.category ?? "uncategorized");
    catMap.set(c, (catMap.get(c) ?? 0) + 1);
  }

  const slim = (r: any) => ({
    rank: r.rank, slug: r.slug, name: r.name, category: r.category,
    score: r.score, tier: r.tier, data_confidence: r.data_confidence,
    pinterest: r.components.pinterest, conversion: r.components.conversion,
    margin: r.components.margin, inventory: r.components.inventory,
    pmf: r.components.pmf, content: r.components.content, video: r.components.video,
    penalties: r.penalties, boosts: r.boosts,
    margin_percent: r.margin_percent, price: r.price,
    has_pinterest_data: r.has_pinterest_data, has_video: r.has_video, has_cost: r.has_cost,
  });

  return {
    generated_at: new Date().toISOString(),
    version: "RPS_V2.1.0-preview",
    store: "GetPawsy",
    catalog: { active_products: total, median_margin_pct: Math.round(medianMargin * 10) / 10 },
    tier_distribution: dist,
    score_bands: bands,
    score_histogram: histo.map((count, i) => ({ bucket: `${i * 10}-${i * 10 + 9}`, count })),
    category_distribution: [...catMap.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    top_50: scored.slice(0, 50).map(slim),
    bottom_50: scored.slice(-50).map(slim),
    missing_pinterest_data: scored.filter((r) => !r.has_pinterest_data).length,
    missing_videos: scored.filter((r) => !r.has_video).length,
    missing_cost_data: scored.filter((r) => !r.has_cost).length,
    penalty_counts: {
      generic_name: scored.filter((r) => r.penalties.includes("generic_name")).length,
      generic_category: scored.filter((r) => r.penalties.includes("generic_category")).length,
      out_of_stock: scored.filter((r) => r.penalties.includes("out_of_stock")).length,
      duplicate_signature: scored.filter((r) => r.penalties.includes("duplicate_signature")).length,
    },
    boost_counts: {
      proven_pinterest: scored.filter((r) => r.boosts.includes("proven_pinterest")).length,
      priority_niche: scored.filter((r) => r.boosts.includes("priority_niche")).length,
      high_ticket_in_stock: scored.filter((r) => r.boosts.includes("high_ticket_in_stock")).length,
      creative_ready: scored.filter((r) => r.boosts.includes("creative_ready")).length,
    },
  };
}

function buildCompareReport(v2Scored: any[], v21Scored: any[]) {
  const v2Rank = new Map(v2Scored.map((r, i) => [r.product_id, i + 1]));
  const v21Rank = new Map(v21Scored.map((r, i) => [r.product_id, i + 1]));

  const merged = v21Scored.map((r: any) => {
    const v2r = v2Rank.get(r.product_id);
    const old = v2Scored.find((x) => x.product_id === r.product_id);
    return {
      slug: r.slug, name: r.name, category: r.category,
      v2_rank: v2r ?? null, v2_score: old?.score ?? null,
      v21_rank: r.rank, v21_score: r.score, v21_tier: r.tier,
      delta_rank: (v2r ?? r.rank) - r.rank,
      delta_score: Math.round(((r.score - (old?.score ?? 0)) * 10)) / 10,
      penalties: r.penalties, boosts: r.boosts,
    };
  });

  const movers_up = [...merged].sort((a, b) => b.delta_rank - a.delta_rank).slice(0, 25);
  const movers_down = [...merged].sort((a, b) => a.delta_rank - b.delta_rank).slice(0, 25);

  // distribution targets
  const total = v21Scored.length;
  const got = {
    a: v21Scored.filter((r) => r.score >= 80).length / total,
    b: v21Scored.filter((r) => r.score >= 60 && r.score < 80).length / total,
    c: v21Scored.filter((r) => r.score >= 40 && r.score < 60).length / total,
    d: v21Scored.filter((r) => r.score < 40).length / total,
  };
  const target = { a: 0.05, b: 0.15, c: 0.30, d: 0.50 };
  const within = (a: number, b: number, tol = 0.07) => Math.abs(a - b) <= tol;
  const ok =
    within(got.a, target.a) && within(got.b, target.b) &&
    within(got.c, target.c, 0.10) && within(got.d, target.d, 0.10);

  const recommendation = ok
    ? "SAFE TO ACTIVATE — distribution within tolerance of target shape."
    : "HOLD — distribution still drifts from target; review penalties/boosts before activation.";

  return {
    generated_at: new Date().toISOString(),
    version: "RPS_COMPARE_V2_vs_V2.1",
    distribution_target: target,
    distribution_actual: got,
    distribution_pass: ok,
    movers_up, movers_down,
    top_50_v21: v21Scored.slice(0, 50).map((r) => ({
      rank: r.rank, slug: r.slug, name: r.name, category: r.category, score: r.score, tier: r.tier,
    })),
    bottom_50_v21: v21Scored.slice(-50).map((r) => ({
      rank: r.rank, slug: r.slug, name: r.name, category: r.category, score: r.score, tier: r.tier,
    })),
    recommendation,
  };
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

// ───────────────────────────────────────────────────────── V2.1 remediation
function sigOfName(name: any): string {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, "").split(/\s+/).slice(0, 6).join(" ");
}

function pinterestReadiness(p: any, intel: any, hasPin: boolean, hasVideo: boolean) {
  const reasons: string[] = [];
  let score = 0;
  // Eligibility (35)
  if (p.pinterest_disabled) reasons.push("disabled");
  else if (p.pinterest_eligible || p.pinterest_ready) score += 35;
  else reasons.push("not_eligible_flag");
  // Asset (20)
  const hasImg = !!(p.image_url || (Array.isArray(p.images) && p.images.length));
  if (hasImg) score += 20; else reasons.push("no_image");
  // Board / category mapping (10)
  if (p.pinterest_category || intel?.primary_board) score += 10; else reasons.push("no_board_mapping");
  // Copy (10)
  if (intel?.pinterest_topics?.length || intel?.seo_title) score += 10; else reasons.push("no_copy");
  // Stock (10)
  const stock = Number(p.effective_stock ?? p.stock ?? 0) > 0 || Number(p.us_stock ?? 0) > 0 || Number(p.eu_stock ?? 0) > 0 || p.stock_sync_status === "ok";
  if (stock) score += 10; else reasons.push("out_of_stock");
  // Proven traction (10)
  if (hasPin) score += 10; else reasons.push("no_pinterest_traction");
  // Video bonus (5)
  if (hasVideo) score += 5;
  return { score: Math.min(100, score), blockers: reasons };
}

function creativeReadiness(p: any, intel: any, hasVideo: boolean) {
  const reasons: string[] = [];
  let score = 0;
  // Image (25)
  const imgs = Array.isArray(p.images) ? p.images.length : 0;
  if (p.image_url) score += 15; else reasons.push("no_image");
  if (imgs >= 3) score += 10; else if (imgs >= 1) score += 5; else reasons.push("few_images");
  // Description (20)
  const desc = String(p.description ?? "");
  if (desc.length >= 400) score += 20;
  else if (desc.length >= 120) score += 10;
  else reasons.push("thin_description");
  // SEO copy (15)
  const seo = seoRaw(intel);
  if (seo >= 70) score += 15; else if (seo >= 40) score += 8; else reasons.push("weak_seo_copy");
  // Video (25)
  if (hasVideo) score += 25; else reasons.push("no_video_asset");
  // Pinterest copy (10)
  if (intel?.pinterest_topics?.length || intel?.pinterest_description) score += 10; else reasons.push("no_pinterest_copy");
  // Category clarity (5)
  if (p.category && !["pet-supplies","misc","uncategorized","other","general"].includes(String(p.category).toLowerCase())) score += 5; else reasons.push("generic_category");
  return { score: Math.min(100, score), missing: reasons };
}

function buildRemediationReport(ctx: Awaited<ReturnType<typeof gatherCatalog>>, v21Scored: any[]) {
  const { products, intelMap, pinAgg, videoSet } = ctx;
  const scoreByPid = new Map(v21Scored.map((r) => [r.product_id, r]));

  // 1. Out-of-stock products (full list)
  const oos = products
    .filter((p: any) => inventoryRaw(p) <= 0)
    .map((p: any) => {
      const s = scoreByPid.get(p.id);
      return {
        product_id: p.id, slug: p.slug, name: p.name, category: p.category,
        price: p.price, us_stock: p.us_stock ?? 0, eu_stock: p.eu_stock ?? 0,
        effective_stock: p.effective_stock ?? p.stock ?? 0,
        stock_sync_status: p.stock_sync_status, last_sync: (p as any).last_stock_sync_at ?? null,
        v21_score: s?.score ?? null, v21_tier: s?.tier ?? null,
        recommended_action: p.stock_sync_status === "discontinued"
          ? "Mark inactive / replace"
          : p.stock_sync_status === "no_data" ? "Trigger CJ stock sync"
          : "Verify supplier inventory",
      };
    });

  // 2. Duplicate clusters
  const sigGroups = new Map<string, any[]>();
  for (const p of products) {
    const s = sigOfName(p.name);
    if (!s) continue;
    const arr = sigGroups.get(s) ?? [];
    arr.push(p);
    sigGroups.set(s, arr);
  }
  const duplicate_clusters = [...sigGroups.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([signature, arr]) => {
      const enriched = arr.map((p: any) => {
        const s = scoreByPid.get(p.id);
        return {
          product_id: p.id, slug: p.slug, name: p.name, category: p.category,
          price: p.price, dedupe_key: p.dedupe_key, is_duplicate: p.is_duplicate,
          v21_score: s?.score ?? null,
        };
      }).sort((a, b) => (b.v21_score ?? 0) - (a.v21_score ?? 0));
      return {
        signature,
        cluster_size: enriched.length,
        keep_candidate: enriched[0]?.slug ?? null,
        members: enriched,
      };
    })
    .sort((a, b) => b.cluster_size - a.cluster_size);

  // 3 + 4 + 5. Per-product readiness
  const per_product = products.map((p: any) => {
    const intel = intelMap.get(p.id);
    const hasPin = !!pinAgg.get(String(p.id));
    const hasVideo = videoSet.has(String(p.id));
    const pin = pinterestReadiness(p, intel, hasPin, hasVideo);
    const cre = creativeReadiness(p, intel, hasVideo);
    const s = scoreByPid.get(p.id);
    return {
      product_id: p.id, slug: p.slug, name: p.name, category: p.category,
      pinterest_readiness: pin.score, pinterest_blockers: pin.blockers,
      creative_readiness: cre.score, creative_missing: cre.missing,
      activation_ready: pin.score >= 70 && cre.score >= 70,
      v21_score: s?.score ?? null, v21_tier: s?.tier ?? null,
      has_pinterest_data: hasPin, has_video: hasVideo,
    };
  });

  // creative_ready diagnosis: V2.1 boost requires raw_video AND raw_seo >= 60
  const creative_ready_diag = per_product.map((r, i) => {
    const p: any = products[i];
    const intel = intelMap.get(p.id);
    const seo = seoRaw(intel);
    return {
      slug: r.slug, name: r.name,
      has_video: r.has_video, seo_raw: Math.round(seo),
      reason: !r.has_video && seo < 60 ? "no_video_and_weak_seo"
        : !r.has_video ? "missing_video"
        : seo < 60 ? "weak_seo"
        : "qualifies",
    };
  });
  const qualifies = creative_ready_diag.filter((d) => d.reason === "qualifies").length;

  // 6. Activation dashboard
  const total = per_product.length;
  const pinReady = per_product.filter((r) => r.pinterest_readiness >= 70).length;
  const creReady = per_product.filter((r) => r.creative_readiness >= 70).length;
  const both = per_product.filter((r) => r.activation_ready).length;

  const tierCounts = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of v21Scored) (tierCounts as any)[r.tier] += 1;

  return {
    generated_at: new Date().toISOString(),
    version: "RPS_V2.1_REMEDIATION",
    persist: false,
    catalog_size: total,

    out_of_stock: {
      total: oos.length,
      by_status: oos.reduce((acc: any, r) => { acc[r.stock_sync_status || "unknown"] = (acc[r.stock_sync_status || "unknown"] || 0) + 1; return acc; }, {}),
      products: oos,
    },

    duplicate_clusters: {
      total_clusters: duplicate_clusters.length,
      total_products_in_clusters: duplicate_clusters.reduce((a, c) => a + c.cluster_size, 0),
      clusters: duplicate_clusters,
    },

    creative_ready_diagnosis: {
      qualifies,
      missing_video: creative_ready_diag.filter((d) => d.reason === "missing_video").length,
      weak_seo: creative_ready_diag.filter((d) => d.reason === "weak_seo").length,
      both_missing: creative_ready_diag.filter((d) => d.reason === "no_video_and_weak_seo").length,
      detail: creative_ready_diag.slice(0, 200),
      root_cause: qualifies === 0
        ? "V2.1 'creative_ready' boost requires has_video AND raw_seo>=60 simultaneously. Either video coverage is too sparse or SEO scoring threshold is too high relative to current copy quality."
        : "Boost is firing for at least some products.",
    },

    pinterest_readiness: {
      ready: pinReady,
      not_ready: total - pinReady,
      avg_score: Math.round(per_product.reduce((a, r) => a + r.pinterest_readiness, 0) / Math.max(1, total)),
      top_blockers: tallyReasons(per_product.flatMap((r) => r.pinterest_blockers)),
      products: per_product.map((r) => ({ slug: r.slug, name: r.name, score: r.pinterest_readiness, blockers: r.pinterest_blockers })),
    },

    creative_readiness: {
      ready: creReady,
      not_ready: total - creReady,
      avg_score: Math.round(per_product.reduce((a, r) => a + r.creative_readiness, 0) / Math.max(1, total)),
      top_missing: tallyReasons(per_product.flatMap((r) => r.creative_missing)),
      products: per_product.map((r) => ({ slug: r.slug, name: r.name, score: r.creative_readiness, missing: r.creative_missing })),
    },

    activation_dashboard: {
      catalog: total,
      pinterest_ready_pct: Math.round((pinReady / Math.max(1, total)) * 100),
      creative_ready_pct: Math.round((creReady / Math.max(1, total)) * 100),
      fully_activation_ready: both,
      fully_activation_ready_pct: Math.round((both / Math.max(1, total)) * 100),
      v21_tier_distribution: tierCounts,
      go_no_go: both >= Math.floor(total * 0.10)
        ? "GO — enough activation-ready inventory to flip flag safely."
        : "NO-GO — fewer than 10% of catalog is activation-ready. Close gaps before flipping revenue_priority_v2_active.",
      blocking_issues: [
        oos.length > 0 ? `${oos.length} out-of-stock products in active catalog` : null,
        duplicate_clusters.length > 0 ? `${duplicate_clusters.length} duplicate name clusters` : null,
        qualifies === 0 ? "creative_ready boost never fires (no product passes video + seo gate)" : null,
      ].filter(Boolean),
    },
  };
}

function tallyReasons(arr: string[]) {
  const m = new Map<string, number>();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
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

    if (action === "compute_all_v21") {
      const v21 = computeAllV21(ctx);
      await persist(v21.scored);
      return new Response(JSON.stringify({ ok: true, traceId: crypto.randomUUID(), persisted: v21.scored.length, report: buildV21Report(v21.scored, v21.medianMargin) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "validate" || action === "report") {
      return new Response(JSON.stringify({ ok: true, traceId: crypto.randomUUID(), report: buildReport(scored, diversificationLog, medianMargin) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "report_v21") {
      const v21 = computeAllV21(ctx);
      return new Response(JSON.stringify({ ok: true, traceId: crypto.randomUUID(), report: buildV21Report(v21.scored, v21.medianMargin) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "compare_v21") {
      const v21 = computeAllV21(ctx);
      const v21Report = buildV21Report(v21.scored, v21.medianMargin);
      const v2Report = buildReport(scored, diversificationLog, medianMargin);
      const compare = buildCompareReport(scored, v21.scored);
      return new Response(JSON.stringify({ ok: true, traceId: crypto.randomUUID(), report: { compare, v2: v2Report, v21: v21Report } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "remediation_report") {
      const v21 = computeAllV21(ctx);
      const report = buildRemediationReport(ctx, v21.scored);
      return new Response(JSON.stringify({ ok: true, traceId: crypto.randomUUID(), report }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: false, message: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("revenue-priority-v2 error:", e);
    return new Response(JSON.stringify({ ok: false, message: e?.message ?? "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});