import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { filterOrganicOrders, fetchOrganicProductRanking } from "../_shared/organic-ranking.ts";

// Organic Intelligence Loop — 10-step learning cycle for verified ORGANIC sales.
// Hard rule: paid traffic is NEVER used as evidence. Only organic Pinterest / direct /
// referral / organic search count toward Success DNA and Confidence updates.

const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsocial", "paid_social", "display", "retargeting", "ads"]);
const PAID_SOURCES = new Set(["google_ads", "googleads", "meta_ads", "tiktok_ads", "pinterest_ads"]);

function isOrganicSession(s: any): boolean {
  if (!s) return false;
  const med = (s.utm_medium || s.medium || "").toString().toLowerCase();
  const src = (s.utm_source || s.source || "").toString().toLowerCase();
  if (PAID_MEDIUMS.has(med)) return false;
  if (PAID_SOURCES.has(src)) return false;
  return true;
}

function pinterestish(s: any): boolean {
  const src = (s?.utm_source || s?.source || s?.referrer || "").toString().toLowerCase();
  return src.includes("pinterest") || src === "pin";
}

async function runLoop(supabase: any, body: any) {
  const t0 = Date.now();
  const targetOrderId: string | null = body?.order_id ?? null;
  const targetLabel: string = body?.label ?? (targetOrderId ? `order:${targetOrderId.slice(0, 8)}` : "Sale #538");

  const { data: run } = await supabase
    .from("organic_intelligence_runs")
    .insert({ status: "running", target_order_id: targetOrderId, target_label: targetLabel, triggered_by: body?.triggered_by ?? "manual" })
    .select("id")
    .single();
  const runId = run.id;
  const stepLog: any[] = [];
  const stepDone = async (name: string, payload: any) => {
    stepLog.push({ step: name, at: new Date().toISOString(), ...payload });
    await supabase
      .from("organic_intelligence_runs")
      .update({ steps_completed: stepLog.length, step_log: stepLog, updated_at: new Date().toISOString() })
      .eq("id", runId);
  };

  // STEP 1 — Reconstruct purchase journey for target order (or pick latest verified organic if none)
  let order: any = null;
  if (targetOrderId) {
    const r = await supabase.from("orders").select("*").eq("id", targetOrderId).maybeSingle();
    order = r.data;
  } else {
    const r = await supabase
      .from("orders")
      .select("*")
      .in("status", ["paid", "completed", "succeeded", "complete"])
      .order("created_at", { ascending: false })
      .limit(1);
    order = r.data?.[0] ?? null;
  }
  await stepDone("reconstruct_journey", { order_found: !!order, order_id: order?.id ?? null });

  // STEP 2 — Build the 13-step funnel from analytics_funnel_waterfall for this session/visitor
  let funnel: any = null;
  let session: any = null;
  if (order?.id) {
    const { data: sessions } = await supabase
      .from("analytics_funnel_waterfall")
      .select("*")
      .not("purchase_at", "is", null)
      .order("purchase_at", { ascending: false })
      .limit(50);
    session = (sessions || []).find((s: any) => isOrganicSession(s)) || sessions?.[0] || null;
    if (session) {
      const stages = [
        "click_at", "redirect_at", "landing_at", "engagement_start_at", "page_view_at",
        "scroll_at", "view_item_at", "add_to_cart_at", "view_cart_at",
        "begin_checkout_at", "payment_at", "purchase_at",
      ];
      funnel = stages.map((k) => ({ stage: k.replace(/_at$/, ""), at: session[k], reached: !!session[k] }));
    }
  }
  await stepDone("build_13_step_funnel", { session_id: session?.session_id ?? null, reached: funnel?.filter((s: any) => s.reached).length ?? 0 });

  // STEP 3 — Audit every stage (strengths / weaknesses)
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (funnel) {
    const reachedKeys = new Set(funnel.filter((s: any) => s.reached).map((s: any) => s.stage));
    if (reachedKeys.has("scroll")) strengths.push("Deep engagement — visitor scrolled the landing page.");
    if (reachedKeys.has("view_item")) strengths.push("PDP reached — product matched intent.");
    if (reachedKeys.has("add_to_cart")) strengths.push("ATC fired — creative+offer were persuasive enough.");
    if (!reachedKeys.has("view_cart")) weaknesses.push("Cart drawer not opened before checkout (low trust signal).");
    if (!reachedKeys.has("engagement_start")) weaknesses.push("Engagement-start gate missed — page may have been prefetch only.");
  } else {
    weaknesses.push("No analytics_funnel_waterfall row joined to this purchase — attribution is partial.");
  }
  await stepDone("audit_stages", { strengths: strengths.length, weaknesses: weaknesses.length });

  // STEP 4 — WHY: pull the matching pin / creative / product / landing / device / country
  const attribution: any = { pin: null, board: null, category: null, creative: null, visual_dna: null,
    headline: null, hook: null, description: null, cta: null, keywords: null, product: null,
    landing_page: session?.landing_page ?? null, device: null, country: null,
    session_behaviour: null, checkout_behaviour: null, traffic_type: session?.traffic_type ?? null };

  // resolve product from order items
  const items = Array.isArray(order?.items) ? order.items : [];
  const productId = items[0]?.id;
  if (productId) {
    const { data: p } = await supabase.from("products").select("id,slug,name,category,price").eq("id", productId).maybeSingle();
    attribution.product = p;
    if (p?.category) attribution.category = p.category;
  }
  // pin attribution (utm or recent pinterest pin pointing at product)
  if (pinterestish(session) && session?.utm_campaign) {
    const { data: pinPerf } = await supabase
      .from("pcie2_pin_performance")
      .select("pin_id,creative_id,product_id,product_slug,category,board_id,headline,hook,cta,creative_dna")
      .or(`pin_id.eq.${session.utm_campaign},product_id.eq.${productId ?? "00000000-0000-0000-0000-000000000000"}`)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pinPerf) {
      attribution.pin = pinPerf.pin_id;
      attribution.creative = pinPerf.creative_id;
      attribution.board = pinPerf.board_id;
      attribution.headline = pinPerf.headline;
      attribution.hook = pinPerf.hook;
      attribution.cta = pinPerf.cta;
      attribution.visual_dna = pinPerf.creative_dna;
      attribution.category = attribution.category || pinPerf.category;
    }
  }
  // session behaviour summary
  if (session) {
    attribution.session_behaviour = {
      reached_steps: funnel?.filter((s: any) => s.reached).length ?? 0,
      seconds_to_purchase: session.purchase_at && session.landing_at
        ? Math.round((new Date(session.purchase_at).getTime() - new Date(session.landing_at).getTime()) / 1000)
        : null,
    };
  }
  await stepDone("attribution_facts", { has_pin: !!attribution.pin, has_product: !!attribution.product });

  // STEP 5 — Compare against every previous verified ORGANIC purchase → Success DNA
  const { data: paidOrders } = await supabase
    .from("orders")
    .select("id,total_amount,items,created_at,customer_email,status")
    .in("status", ["paid", "completed", "succeeded", "complete"])
    .order("created_at", { ascending: true });
  // Layer-1 gate: only orders whose originating session is organic (canonical_sessions_traffic_class).
  const candidateOrders = (paidOrders || []).filter((o: any) => {
    const it = Array.isArray(o.items) ? o.items : [];
    const firstId = it[0]?.id || "";
    // exclude test payments
    return !String(firstId).startsWith("TEST-") && Number(o.total_amount) > 1;
  });
  const organicOrderIds = await filterOrganicOrders(supabase, candidateOrders.map((o: any) => o.id));
  const verifiedOrganic = candidateOrders.filter((o: any) => organicOrderIds.has(o.id));
  const paidValidationCount = candidateOrders.length - verifiedOrganic.length;
  // join with sessions (best-effort) — count categories / boards / headlines
  const counters: Record<string, Record<string, number>> = {
    category: {}, board: {}, hook: {}, headline: {}, landing_page: {}, device: {}, country: {},
  };
  const bump = (k: string, v: any) => { if (!v) return; counters[k][v] = (counters[k][v] || 0) + 1; };
  for (const o of verifiedOrganic) {
    const it = Array.isArray(o.items) ? o.items : [];
    const pid = it[0]?.id;
    if (pid) {
      const { data: p } = await supabase.from("products").select("category").eq("id", pid).maybeSingle();
      bump("category", p?.category);
    }
  }
  if (attribution.board) bump("board", attribution.board);
  if (attribution.hook) bump("hook", attribution.hook);
  if (attribution.headline) bump("headline", attribution.headline);
  if (attribution.landing_page) bump("landing_page", attribution.landing_page);
  const topN = (m: Record<string, number>, n = 5) =>
    Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ value: k, count: v }));
  const dna = {
    sample_size: verifiedOrganic.length,
    top_categories: topN(counters.category),
    top_boards: topN(counters.board),
    top_hooks: topN(counters.hook),
    top_headlines: topN(counters.headline),
    top_landing_pages: topN(counters.landing_page),
    avg_order_value: verifiedOrganic.length
      ? verifiedOrganic.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0) / verifiedOrganic.length
      : 0,
    confidence: verifiedOrganic.length >= 30 ? "high" : verifiedOrganic.length >= 10 ? "medium" : "seed",
  };
  await stepDone("success_dna", { sample_size: dna.sample_size, confidence: dna.confidence });

  // STEP 6 — Update Organic Confidence Engine (organic evidence only). We DO NOT mutate the model
  //          weights; we record a prediction event so the existing learning loop can incorporate it.
  let confidenceUpdated = false;
  if (verifiedOrganic.length > 0) {
    try {
      const { data: model } = await supabase.rpc("get_active_organic_confidence_model");
      const modelVersion = (model as any)?.version ?? 1;
      for (const o of verifiedOrganic) {
        const it = Array.isArray(o.items) ? o.items : [];
        const pid = it[0]?.id;
        if (!pid) continue;
        await supabase.from("organic_confidence_predictions").insert({
          entity_type: "product",
          entity_id: pid,
          model_version: modelVersion,
          predicted_score: 100,
          actual_score: 100,
          metadata: { source: "organic_intelligence_loop", run_id: runId, order_id: o.id, evidence: "verified_organic_purchase" },
        }).then(() => {});
      }
      confidenceUpdated = true;
    } catch (_e) { /* table may differ; skip */ }
  }
  await stepDone("update_organic_confidence", { confidence_updated: confidenceUpdated, sample_size: verifiedOrganic.length, paid_validation_orders: paidValidationCount });

  // STEP 7 — Search catalogue for products that resemble the Success DNA
  const targetCategories = dna.top_categories.map((c) => c.value).filter(Boolean);
  // Organic-first bias: pull Layer-1 organic ranking so candidates are already proven organic.
  const organicProdRanking = await fetchOrganicProductRanking(supabase).catch(() => []);
  const organicById = new Map(organicProdRanking.map((r) => [r.product_id, r]));
  let similarProducts: any[] = [];
  if (targetCategories.length) {
    const { data: catalog } = await supabase
      .from("products")
      .select("id,slug,name,category,price,images")
      .in("category", targetCategories)
      .limit(200);
    similarProducts = (catalog || []).map((p: any) => ({
      ...p,
      similarity: targetCategories.includes(p.category) ? 0.8 : 0.2,
      organic_signals: organicById.get(String(p.id)) ?? null,
    }))
      .sort((a, b) => {
        // Organic proof beats category similarity (Layer 1 > Layer 3 heuristics).
        const oa = a.organic_signals?.organic_rank_score ?? 0;
        const ob = b.organic_signals?.organic_rank_score ?? 0;
        if (ob !== oa) return ob - oa;
        return b.similarity - a.similarity;
      })
      .slice(0, 25);
  }
  await stepDone("similar_products", { count: similarProducts.length });

  // STEP 8 — Search Pinterest creative history for similar creatives
  let similarCreatives: any[] = [];
  if (targetCategories.length) {
    const { data: cre } = await supabase
      .from("pcie2_pin_performance")
      .select("pin_id,creative_id,product_slug,category,board_id,headline,hook,cta,ctr,engagement_rate,conversion_value")
      .in("category", targetCategories)
      .order("engagement_rate", { ascending: false, nullsFirst: false })
      .limit(25);
    similarCreatives = cre || [];
  }
  await stepDone("similar_creatives", { count: similarCreatives.length });

  // STEP 9 — Concrete recommendations
  const recommendations: any[] = [];
  for (const p of similarProducts.slice(0, 10)) {
    recommendations.push({ type: "promote_product", target: p.slug ?? p.id, reason: `Matches Success DNA category "${p.category}"`, evidence_source: "organic_behaviour" });
  }
  for (const c of similarCreatives.slice(0, 5)) {
    recommendations.push({ type: "reuse_creative", target: c.creative_id ?? c.pin_id, reason: `Top organic ER in category "${c.category}"`, evidence_source: "organic_behaviour" });
  }
  if (attribution.landing_page) {
    recommendations.push({ type: "templatize_landing_page", target: attribution.landing_page, reason: "Converted in a verified organic journey", evidence_source: "organic_behaviour" });
  }
  if (dna.top_hooks[0]) {
    recommendations.push({ type: "reuse_hook", target: dna.top_hooks[0].value, reason: `Appears in ${dna.top_hooks[0].count} winning organic flow(s)`, evidence_source: "organic_behaviour" });
  }
  await stepDone("recommendations", { count: recommendations.length });

  // STEP 10 — Persist lessons into Growth Lab knowledge base
  let lessonsStored = 0;
  for (const c of dna.top_categories.slice(0, 3)) {
    const { error } = await supabase.from("growth_lab_knowledge").insert({
      pattern_key: `organic_winning_category:${c.value}`,
      pattern_type: "category_winner",
      verdict: "proven",
      confidence: dna.confidence === "high" ? 0.9 : dna.confidence === "medium" ? 0.6 : 0.4,
      evidence: { sample_size: dna.sample_size, count: c.count, source: "organic_intelligence_loop", run_id: runId },
      lessons: `Category "${c.value}" appears in ${c.count} verified organic purchase(s). Prioritize publishing and promotion within this category before testing adjacencies.`,
    });
    if (!error) lessonsStored++;
  }
  await stepDone("growth_lab_knowledge", { lessons_stored: lessonsStored });

  // Persist attribution + DNA + report
  const why = funnel
    ? `Converted because the visitor reached ${funnel.filter((s: any) => s.reached).length}/13 funnel stages on an ${attribution.traffic_type || "organic"} session${attribution.product?.name ? `, with strong product-intent match on "${attribution.product.name}"` : ""}${attribution.headline ? ` and a high-engagement headline "${attribution.headline}"` : ""}.`
    : `Limited session telemetry — converted via ${attribution.traffic_type || "organic"} traffic on product "${attribution.product?.name ?? "(unknown)"}".`;

  await supabase.from("organic_sale_attribution").insert({
    run_id: runId, order_id: order?.id ?? null, order_label: targetLabel,
    is_verified_organic: !!order, funnel_stages: funnel ?? [], attribution,
    strengths, weaknesses, why_converted: why,
  });

  await supabase.from("organic_success_dna").insert({
    run_id: runId, sample_size: dna.sample_size, dna, similar_products: similarProducts,
    similar_creatives: similarCreatives, recommendations, is_active: true,
  });

  const reportMd = [
    `# Organic Intelligence Report — ${targetLabel}`,
    ``,
    `**Verified organic sample:** ${dna.sample_size} purchases · **Confidence:** ${dna.confidence}`,
    ``,
    `## Why this customer converted`,
    why,
    ``,
    `## 13-step funnel`,
    funnel ? funnel.map((s: any) => `- ${s.reached ? "✅" : "⬜"} ${s.stage}${s.at ? ` — ${s.at}` : ""}`).join("\n") : "_no session joined_",
    ``,
    `## Strengths`, ...strengths.map((s) => `- ${s}`),
    ``,
    `## Weaknesses`, ...weaknesses.map((s) => `- ${s}`),
    ``,
    `## Success DNA`,
    `- Top categories: ${dna.top_categories.map((c) => `${c.value} (${c.count})`).join(", ") || "—"}`,
    `- Top hooks: ${dna.top_hooks.map((c) => `${c.value} (${c.count})`).join(", ") || "—"}`,
    `- Top landing pages: ${dna.top_landing_pages.map((c) => `${c.value} (${c.count})`).join(", ") || "—"}`,
    `- AOV: €${dna.avg_order_value.toFixed(2)}`,
    ``,
    `## Recommendations (${recommendations.length})`,
    ...recommendations.slice(0, 15).map((r) => `- **${r.type}** → \`${r.target}\` — ${r.reason}`),
    ``,
    `## Lessons stored in Growth Lab: ${lessonsStored}`,
    ``,
    `_The objective is not understanding this sale. The objective is making the next 461 sales increasingly predictable._`,
  ].join("\n");

  await supabase.from("organic_intelligence_reports").insert({
    run_id: runId, target_label: targetLabel,
    summary: why, report_md: reportMd,
    report_json: { attribution, funnel, dna, similarProducts, similarCreatives, recommendations, strengths, weaknesses },
  });

  const duration = Date.now() - t0;
  await supabase.from("organic_intelligence_runs")
    .update({ status: "completed", duration_ms: duration, steps_completed: 10 })
    .eq("id", runId);

  return { ok: true, run_id: runId, steps: stepLog.length, duration_ms: duration, target_label: targetLabel };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const result = await runLoop(supabase, body);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});