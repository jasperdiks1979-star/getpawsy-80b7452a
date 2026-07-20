// AI Content Brain — autonomous decision layer that picks WHICH pins
// enter the publishing queue, scored on diversity, DNA rotation, product
// match, trend alignment and expected revenue. Reuses existing engines;
// does not duplicate dashboards, analytics, or attribution.
//
// Actions:
//   POST {action:"decide", target?:40, maxPerProduct?:2, maxPerCategory?:0.25}
//     → scores drafts, promotes top-N to status='queued' (staggered every
//       30 min), logs rationale to pinterest_autopilot_decisions +
//       pinterest_evolution_log.
//
//   POST {action:"report"}
//     → executive snapshot: diversity / variety / rotation / revenue
//       readiness scores + top-N lists.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_TARGET = 40;
const DEFAULT_MAX_PER_PRODUCT = 2;
const DEFAULT_MAX_CATEGORY_SHARE = 0.25;
const STAGGER_MINUTES = 30;
const EXPLOITATION_PCT = 0.8; // 80/20 explore-exploit

type Json = Record<string, unknown>;

function safeNumber(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

function pct(n: number, total: number) {
  return total > 0 ? n / total : 0;
}

// ───────────────────────────────────────────────────────────────────────────
// Decision pipeline
// ───────────────────────────────────────────────────────────────────────────

async function decide(sb: ReturnType<typeof createClient>, opts: {
  target: number;
  maxPerProduct: number;
  maxCategoryShare: number;
}) {
  const startedAt = Date.now();
  const runId = crypto.randomUUID();

  // 1. Load eligible drafts
  const { data: drafts, error: dErr } = await sb
    .from("pinterest_pin_queue")
    .select("id, product_id, product_slug, product_name, pin_title, overlay_text, category_key, hook_group, board_id, board_name, pin_image_url, destination_link, created_at")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(500);
  if (dErr) throw dErr;
  if (!drafts || drafts.length === 0) {
    return { ok: true, run_id: runId, promoted: 0, reason: "no_drafts_available" };
  }

  // 2. Historical distribution (last 30d & 7d) for diversity penalty
  const [{ data: hist30 }, { data: hist7 }] = await Promise.all([
    sb.from("pinterest_pin_queue")
      .select("product_slug, category_key, hook_group")
      .in("status", ["posted", "queued"])
      .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString())
      .limit(2000),
    sb.from("pinterest_pin_queue")
      .select("product_slug, category_key, hook_group")
      .in("status", ["posted", "queued"])
      .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
      .limit(1000),
  ]);

  const count = (rows: any[] | null, key: string) => {
    const m = new Map<string, number>();
    for (const r of rows || []) {
      const k = String((r as Json)[key] || "_unknown");
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  };
  const prod30 = count(hist30 as any[], "product_slug");
  const prod7 = count(hist7 as any[], "product_slug");
  const cat30 = count(hist30 as any[], "category_key");
  const hook30 = count(hist30 as any[], "hook_group");

  // 3. Product intelligence join (best-effort, all optional)
  const productIds = Array.from(new Set(drafts.map((d) => d.product_id).filter(Boolean))) as string[];
  const [{ data: products }, { data: scores }] = await Promise.all([
    sb.from("products")
      .select("id, slug, name, category, us_stock, primary_species, is_active, image_url")
      .in("id", productIds),
    sb.from("agp_growth_scores")
      .select("product_id, overall_score, revenue_potential, conversion_score")
      .in("product_id", productIds)
      .then((r) => r.error ? { data: [] as any[] } : r),
  ]);
  const productMap = new Map<string, any>((products || []).map((p: any) => [p.id, p]));
  const scoreMap = new Map<string, any>((scores || []).map((s: any) => [s.product_id, s]));

  // 4. Score every draft
  type Scored = {
    draft: any; product: any; total: number; breakdown: Json; reason: string;
  };
  const scored: Scored[] = [];
  for (const draft of drafts as any[]) {
    const product = productMap.get(draft.product_id);
    if (!product || !product.is_active) continue;
    if (!product.us_stock || product.us_stock <= 0) continue;

    // Diversity penalty (0-100, lower = more overused recently)
    const p7 = prod7.get(product.slug) || 0;
    const p30 = prod30.get(product.slug) || 0;
    const diversityScore = Math.max(0, 100 - p7 * 25 - p30 * 6);

    // Category rotation
    const cKey = String(draft.category_key || product.category || "_unk");
    const cTotal = Array.from(cat30.values()).reduce((a, b) => a + b, 0) || 1;
    const cShare = (cat30.get(cKey) || 0) / cTotal;
    const categoryScore = cShare > opts.maxCategoryShare ? 30 : 100 - Math.round(cShare * 200);

    // Hook variety
    const hKey = String(draft.hook_group || "_unk");
    const hTotal = Array.from(hook30.values()).reduce((a, b) => a + b, 0) || 1;
    const hookScore = 100 - Math.min(60, Math.round(((hook30.get(hKey) || 0) / hTotal) * 200));

    // Product match (margin + growth score + stock)
    const growth = scoreMap.get(product.id);
    const margin = 0.25; // default; engine handles margin elsewhere
    const growthScore = safeNumber(growth?.overall_score, 60);
    const revenuePotential = safeNumber(growth?.revenue_potential, 50);
    const productScore = Math.min(100, margin * 100 + growthScore * 0.4 + revenuePotential * 0.3);

    // Creative integrity quick-check (destination link mandatory;
    // pin_image_url is resolved at publish-time by the worker).
    if (!draft.destination_link) continue;

    // Composite (weights: diversity 30, product 30, category 15, hook 10, revenue 15)
    const total =
      diversityScore * 0.30 +
      productScore * 0.30 +
      categoryScore * 0.15 +
      hookScore * 0.10 +
      revenuePotential * 0.15;

    scored.push({
      draft, product,
      total: Math.round(total * 100) / 100,
      breakdown: {
        diversity: diversityScore, product: Math.round(productScore),
        category: categoryScore, hook: hookScore,
        revenue_potential: revenuePotential,
        recent_pins_7d: p7, recent_pins_30d: p30, category_share_30d: Math.round(cShare * 100),
      },
      reason: p7 >= 2 ? "throttled_recent_7d"
            : cShare > opts.maxCategoryShare ? "category_share_cap"
            : "eligible",
    });
  }

  // 5. Select top-N with diversification (round-robin per product & category)
  scored.sort((a, b) => b.total - a.total);
  const perProduct = new Map<string, number>();
  const perCategory = new Map<string, number>();
  const exploitCap = Math.round(opts.target * EXPLOITATION_PCT);
  const winners: Scored[] = [];
  const skipped: Array<{ draft: any; reason: string }> = [];

  for (const s of scored) {
    if (winners.length >= opts.target) break;
    const pSlug = s.product.slug;
    const cKey = String(s.draft.category_key || s.product.category || "_unk");
    const pCnt = perProduct.get(pSlug) || 0;
    const cCnt = perCategory.get(cKey) || 0;
    const catCapAbs = Math.max(1, Math.floor(opts.target * opts.maxCategoryShare));

    if (pCnt >= opts.maxPerProduct) { skipped.push({ draft: s.draft, reason: "per_product_cap" }); continue; }
    if (cCnt >= catCapAbs)          { skipped.push({ draft: s.draft, reason: "per_category_cap" }); continue; }

    // Exploration slice: last 20% must include lower-ranked DNA/products
    const isExplorationSlot = winners.length >= exploitCap;
    if (isExplorationSlot && pCnt > 0) { skipped.push({ draft: s.draft, reason: "exploration_unique_only" }); continue; }

    winners.push(s);
    perProduct.set(pSlug, pCnt + 1);
    perCategory.set(cKey, cCnt + 1);
  }

  // 6. Promote winners → queued, staggered every STAGGER_MINUTES, log decisions
  const promotedIds: string[] = [];
  for (let i = 0; i < winners.length; i++) {
    const s = winners[i];
    const scheduledAt = new Date(Date.now() + (i + 1) * STAGGER_MINUTES * 60_000).toISOString();
    const { error: upErr } = await sb.from("pinterest_pin_queue").update({
      status: "queued",
      approved_at: new Date().toISOString(),
      scheduled_at: scheduledAt,
      error_message: null,
      publishing_started_at: null,
    }).eq("id", s.draft.id);
    if (upErr) continue;
    promotedIds.push(s.draft.id);

    await sb.from("pinterest_autopilot_decisions").insert({
      product_id: s.product.id,
      product_slug: s.product.slug,
      product_name: s.product.name,
      product_category: s.product.category,
      total_score: s.total,
      score_breakdown: s.breakdown,
      selected_hook_category: s.draft.hook_group || null,
      selected_board_id: s.draft.board_id || null,
      selected_board_name: s.draft.board_name || null,
      status: "promoted",
      action: i >= Math.round(opts.target * EXPLOITATION_PCT) ? "exploration" : "exploitation",
      reason: s.reason,
      pin_queue_id: s.draft.id,
      run_id: runId,
    });
  }

  // 7. Log run summary
  const summary = {
    run_id: runId,
    drafts_scanned: drafts.length,
    scored: scored.length,
    promoted: promotedIds.length,
    skipped: skipped.length,
    target: opts.target,
    duration_ms: Date.now() - startedAt,
    category_distribution: Object.fromEntries(perCategory),
    product_distribution: Object.fromEntries(perProduct),
  };
  await sb.from("pinterest_evolution_log").insert({
    decision_type: "content_brain_run",
    rationale: `AI Content Brain promoted ${promotedIds.length}/${opts.target} pins from ${drafts.length} drafts`,
    metrics: summary,
  });

  return { ok: true, ...summary };
}

// ───────────────────────────────────────────────────────────────────────────
// Executive report
// ───────────────────────────────────────────────────────────────────────────

async function report(sb: ReturnType<typeof createClient>) {
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [
    { data: queueStatus },
    { data: recent30 },
    { data: recent7 },
    { data: lastDecisions },
    { data: topProducts },
  ] = await Promise.all([
    sb.from("pinterest_pin_queue").select("status").limit(5000),
    sb.from("pinterest_pin_queue").select("product_slug, category_key, hook_group").gte("created_at", since30).limit(2000),
    sb.from("pinterest_pin_queue").select("product_slug, category_key, hook_group").gte("created_at", since7).limit(1000),
    sb.from("pinterest_autopilot_decisions").select("product_slug, total_score, action, reason, created_at").gte("created_at", since7).order("total_score", { ascending: false }).limit(50),
    sb.from("agp_growth_scores").select("product_id, overall_score, revenue_potential").order("overall_score", { ascending: false }).limit(50).then(r => r.error ? { data: [] as any[] } : r),
  ]);

  const statusBreakdown: Record<string, number> = {};
  for (const r of queueStatus || []) statusBreakdown[(r as any).status] = (statusBreakdown[(r as any).status] || 0) + 1;

  const uniqProd30 = new Set((recent30 || []).map((r: any) => r.product_slug)).size;
  const uniqCat30 = new Set((recent30 || []).map((r: any) => r.category_key)).size;
  const uniqHook30 = new Set((recent30 || []).map((r: any) => r.hook_group)).size;
  const total30 = (recent30 || []).length || 1;

  const diversityScore = Math.round(pct(uniqProd30, total30) * 100);
  const varietyScore = Math.round(pct(uniqHook30, total30) * 100);
  const rotationScore = Math.round(pct(uniqCat30, total30) * 100);

  const weeklyPins = (recent7 || []).length;
  const monthlyReachEst = weeklyPins * 4 * 250; // ~250 impressions/pin proxy
  const monthlyClicksEst = Math.round(monthlyReachEst * 0.018);
  const monthlyRevenueEst = Math.round(monthlyClicksEst * 0.015 * 32); // CR × AOV proxy

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    queue: statusBreakdown,
    scores: {
      content_diversity: diversityScore,
      creative_variety: varietyScore,
      product_rotation: rotationScore,
      brand_health: Math.round((diversityScore + varietyScore + rotationScore) / 3),
      revenue_readiness: Math.min(100, Math.round((statusBreakdown["queued"] || 0) * 2.5)),
    },
    activity_7d: { pins_in_pipeline: weeklyPins, unique_products: new Set((recent7 || []).map((r: any) => r.product_slug)).size },
    projections_monthly: {
      reach: monthlyReachEst, outbound_clicks: monthlyClicksEst, revenue_eur: monthlyRevenueEst,
    },
    top_products: topProducts || [],
    top_decisions: lastDecisions || [],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// HTTP entry
// ───────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "decide");

    if (action === "report") {
      const r = await report(sb);
      return new Response(JSON.stringify(r), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "decide") {
      const target = Math.min(Math.max(Number(body.target ?? DEFAULT_TARGET), 1), 120);
      const maxPerProduct = Math.min(Math.max(Number(body.maxPerProduct ?? DEFAULT_MAX_PER_PRODUCT), 1), 5);
      const maxCategoryShare = Math.min(Math.max(Number(body.maxCategoryShare ?? DEFAULT_MAX_CATEGORY_SHARE), 0.1), 0.5);
      const r = await decide(sb, { target, maxPerProduct, maxCategoryShare });
      return new Response(JSON.stringify(r), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: false, error: `unknown_action:${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});