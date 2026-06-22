// Product Intelligence Engine — orchestrator
// DORMANT BY DEFAULT. Exits before any AI call unless product_intelligence_config.enabled = true.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  classifyGoogleProductCategory,
} from "../_shared/google-product-category.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface Body {
  mode?:
    | "dry_run"
    | "scan"
    | "scan_all"
    | "scan_one"
    | "force_rebuild"
    | "rebuild_category"
    | "rebuild_pinterest"
    | "rebuild_seo";
  product_id?: string;
  trigger_source?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const body: Body = await req.json().catch(() => ({}));
  const mode = body.mode ?? "scan";
  const trigger = body.trigger_source ?? "manual";

  // Auth: require admin caller for manual triggers
  if (trigger === "manual") {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, reason: "unauthorized" }, 401);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return json({ ok: false, reason: "forbidden" }, 403);
  }

  // Load config
  const { data: config } = await sb
    .from("product_intelligence_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (!config) return json({ ok: false, reason: "config_missing" }, 500);

  if (!config.enabled) {
    return json({
      ok: true,
      killed: true,
      reason: "engine_disabled",
      message: "product_intelligence_config.enabled = false. No products were scanned. Zero credits used.",
    });
  }

  // Create run row
  const { data: run, error: runErr } = await sb
    .from("product_intelligence_runs")
    .insert({
      trigger_source: trigger,
      mode,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runErr || !run) return json({ ok: false, reason: "run_insert_failed", error: runErr?.message }, 500);

  // Select products
  const productCols = "id,name,slug,category,description,price,images";
  let q = sb.from("products").select(productCols).eq("is_active", true).limit(config.max_products_per_run);
  if (mode === "scan_one" && body.product_id) {
    q = sb.from("products").select(productCols).eq("id", body.product_id).limit(1);
  } else if (mode === "scan_all" || mode === "force_rebuild") {
    q = sb.from("products").select(productCols).eq("is_active", true).limit(5000);
  }
  const { data: products, error: pErr } = await q;
  if (pErr) {
    await sb.from("product_intelligence_runs").update({ status: "failed", error_message: pErr.message, finished_at: new Date().toISOString() }).eq("id", run.id);
    return json({ ok: false, reason: pErr.message }, 500);
  }

  const list = products ?? [];
  await sb.from("product_intelligence_runs").update({ products_targeted: list.length }).eq("id", run.id);

  if (mode === "dry_run") {
    await sb.from("product_intelligence_runs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      report: { mode: "dry_run", products_would_scan: list.length, estimated_credits: list.length * Number(config.estimated_credits_per_product) },
    }).eq("id", run.id);
    return json({ ok: true, mode: "dry_run", run_id: run.id, products_would_scan: list.length, estimated_credits: list.length * Number(config.estimated_credits_per_product) });
  }

  if (!LOVABLE_API_KEY) {
    await sb.from("product_intelligence_runs").update({ status: "failed", error_message: "LOVABLE_API_KEY missing", finished_at: new Date().toISOString() }).eq("id", run.id);
    return json({ ok: false, reason: "lovable_api_key_missing" }, 500);
  }

  // Load Pinterest boards once for Phase 4 mapping
  const { data: boards } = await sb.from("pinterest_boards").select("id,name,description").limit(200);
  const boardList = (boards ?? []).map((b: any) => ({ name: b.name, description: b.description ?? "" }));

  let scanned = 0;
  let failed = 0;
  let creditsUsed = 0;

  for (const p of list) {
    try {
      // Phase 2 — Google category (deterministic, free)
      const gpc = classifyGoogleProductCategory(p.name, p.category, p.description);

      // Phases 3,5,6,7,8,9,10 — single AI call returning JSON
      const ai = await callIntelligenceAI(config.model, p, gpc, boardList);
      creditsUsed += Number(config.estimated_credits_per_product);

      // Phase 10 — opportunity score (deterministic blend)
      const opportunity = computeOpportunityScore(p, ai);
      const conversion = computeConversionScore(p, ai);
      const trend = computeTrendScore(p, ai);
      const feed = analyseFeed(p, ai);
      const priority = derivePriorityLevel(opportunity.score, conversion, trend.score);

      await sb.from("product_intelligence").upsert({
        product_id: p.id,
        intelligence_version: config.intelligence_version,
        last_scanned_at: new Date().toISOString(),
        scan_status: "ok",
        scan_error: null,
        google_product_category: gpc.path,
        google_product_category_id: gpc.id,
        google_category_path: gpc.path,
        google_category_confidence: gpc.confident ? 0.95 : 0.5,
        pinterest_topics: ai.pinterest_topics ?? [],
        pinterest_interests: ai.pinterest_interests ?? [],
        pinterest_audience: ai.pinterest_audience ?? [],
        seasonality: ai.seasonality ?? [],
        topic_confidence: ai.topic_confidence ?? null,
        primary_board: ai.primary_board ?? null,
        secondary_boards: ai.secondary_boards ?? [],
        recommended_boards: [
          ...(ai.primary_board ? [ai.primary_board] : []),
          ...((ai.secondary_boards as string[] | undefined) ?? []),
        ],
        seo_title: ai.seo_title ?? null,
        seo_description: ai.seo_description ?? null,
        pinterest_title: ai.pinterest_title ?? null,
        pinterest_description: ai.pinterest_description ?? null,
        primary_keyword: ai.primary_keyword ?? null,
        primary_keywords: ai.primary_keyword ? [ai.primary_keyword, ...((ai.secondary_keywords as string[] | undefined) ?? []).slice(0, 2)] : [],
        secondary_keywords: ai.secondary_keywords ?? [],
        long_tail_keywords: ai.long_tail_keywords ?? [],
        pinterest_keywords: ai.pinterest_keywords ?? [],
        keyword_score: ai.keyword_score ?? null,
        intent_type: ai.intent_type ?? null,
        intent_score: ai.intent_score ?? null,
        intent_confidence: ai.intent_score ?? null,
        opportunity_score: opportunity.score,
        opportunity_tier: opportunity.tier,
        opportunity_factors: opportunity.factors,
        trend_score: trend.score,
        trend_reason: trend.reason,
        conversion_score: conversion,
        merchant_feed_quality_score: feed.quality,
        priority_level: priority,
        product_tags: ai.product_tags ?? [],
        feed_optimization_status: feed.issues.length === 0 ? "optimized" : "needs_attention",
        feed_issues: feed.issues,
        feed_recommendations: feed.recommendations,
        feed_fixes: ai.feed_fixes ?? [],
      }, { onConflict: "product_id" });
      scanned++;
    } catch (e) {
      failed++;
      await sb.from("product_intelligence").upsert({
        product_id: p.id,
        intelligence_version: config.intelligence_version,
        last_scanned_at: new Date().toISOString(),
        scan_status: "failed",
        scan_error: (e as Error).message,
      }, { onConflict: "product_id" });
    }
  }

  await sb.from("product_intelligence_runs").update({
    status: "success",
    products_scanned: scanned,
    products_failed: failed,
    credits_used: creditsUsed,
    finished_at: new Date().toISOString(),
    report: { mode, scanned, failed, credits_used: creditsUsed },
  }).eq("id", run.id);

  return json({ ok: true, run_id: run.id, scanned, failed, credits_used: creditsUsed });
});

async function callIntelligenceAI(model: string, p: any, gpc: any, boards: { name: string; description: string }[]) {
  const boardNames = boards.map((b) => b.name).slice(0, 40);
  const system = `You are a Pinterest + SEO product intelligence engine for a US pet supplies brand.
Return STRICT JSON only. No prose. No markdown.`;
  const user = `Product:
name: ${p.name ?? ""}
category: ${p.category ?? ""}
description: ${(p.description ?? "").slice(0, 1200)}
google_category: ${gpc.path ?? ""}

Available Pinterest boards (pick from these names ONLY):
${boardNames.join(", ")}

Return JSON with this exact shape:
{
  "pinterest_topics": [string, ...],          // 3-6 Pinterest interest topics
  "pinterest_interests": [string, ...],        // 3-6 Pinterest user interests (e.g. "cat lovers")
  "pinterest_audience": [string, ...],         // 2-4 audience segments (e.g. "new pet parents")
  "seasonality": [string, ...],                // months/seasons (e.g. "fall","winter","year-round")
  "topic_confidence": number,                  // 0..1
  "primary_board": string,                     // must be one of the boards listed
  "secondary_boards": [string, ...],           // 0-2 from the board list
  "seo_title": string,                         // 50-70 chars, keyword-led
  "seo_description": string,                   // 140-160 chars, conversion oriented
  "pinterest_title": string,                   // <=100 chars, Pinterest-search-optimized
  "pinterest_description": string,             // 200-500 chars, with CTA
  "primary_keyword": string,
  "secondary_keywords": [string, ...],         // 3-6
  "long_tail_keywords": [string, ...],         // 3-6
  "pinterest_keywords": [string, ...],         // 5-10 Pinterest-search-friendly
  "keyword_score": number,                     // 0..100
  "intent_type": "Informational"|"Commercial"|"Transactional"|"Problem Solving"|"Gift Buying"|"Luxury"|"Impulse Purchase",
  "intent_score": number,                      // 0..1
  "product_tags": [string, ...],
  "feed_fixes": [string, ...]
}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`ai_${res.status}`);
  const j = await res.json();
  const content = j?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content); } catch { return {}; }
}

function computeOpportunityScore(p: any, ai: any): { score: number; tier: string; factors: Record<string, number> } {
  const factors = {
    keyword: Number(ai.keyword_score ?? 50),
    intent: Math.round(Number(ai.intent_score ?? 0.5) * 100),
    topic_strength: Math.round(Number(ai.topic_confidence ?? 0.5) * 100),
    has_price: p.price && Number(p.price) > 0 ? 100 : 0,
    has_images: Array.isArray(p.images) && p.images.length > 0 ? 100 : 0,
  };
  const score = Math.round(
    (factors.keyword * 0.35) +
    (factors.intent * 0.20) +
    (factors.topic_strength * 0.20) +
    (factors.has_price * 0.10) +
    (factors.has_images * 0.15),
  );
  const tier = score >= 85 ? "Very High" : score >= 70 ? "High" : score >= 50 ? "Medium" : "Low";
  return { score, tier, factors };
}

// Phase 8 — Conversion score (0-100, deterministic)
function computeConversionScore(p: any, ai: any): number {
  const price = Number(p.price ?? 0);
  const images = Array.isArray(p.images) ? p.images.length : 0;
  const descLen = (p.description ?? "").length;
  const priceScore = price > 0 && price <= 150 ? 100 : price > 0 ? 70 : 0;
  const imageScore = Math.min(100, images * 25);
  const descScore = descLen >= 200 ? 100 : descLen >= 80 ? 60 : 20;
  const keywordScore = Number(ai.keyword_score ?? 40);
  const intentBoost = Math.round(Number(ai.intent_score ?? 0.5) * 100);
  return Math.round(priceScore * 0.25 + imageScore * 0.2 + descScore * 0.15 + keywordScore * 0.2 + intentBoost * 0.2);
}

// Phase 7 — Trend score (deterministic + seasonality hint)
function computeTrendScore(p: any, ai: any): { score: number; reason: string } {
  const topicConf = Number(ai.topic_confidence ?? 0.5);
  const seasonal = Array.isArray(ai.seasonality) ? ai.seasonality.length : 0;
  const tags = Array.isArray(ai.product_tags) ? ai.product_tags.length : 0;
  const score = Math.round(topicConf * 60 + Math.min(seasonal, 4) * 5 + Math.min(tags, 6) * 3 + 10);
  const reason = seasonal > 0 ? `Seasonal signals: ${(ai.seasonality as string[]).join(", ")}` : "Evergreen category baseline";
  return { score: Math.min(100, score), reason };
}

// Phase 10 — Feed repair analysis
function analyseFeed(p: any, ai: any): { quality: number; issues: string[]; recommendations: string[] } {
  const issues: string[] = [];
  const recommendations: string[] = [];
  if (!p.description || p.description.length < 80) { issues.push("missing_or_thin_description"); recommendations.push("Expand description to 200+ chars"); }
  if (!Array.isArray(p.images) || p.images.length === 0) { issues.push("no_images"); recommendations.push("Upload at least 3 product images"); }
  if (!p.category) { issues.push("missing_category"); recommendations.push("Assign primary category"); }
  if (!ai.seo_title) { issues.push("missing_seo_title"); recommendations.push("Generate SEO title 50-70 chars"); }
  if (!ai.primary_board) { issues.push("no_pinterest_mapping"); recommendations.push("Map to a Pinterest board"); }
  const quality = Math.max(0, 100 - issues.length * 18);
  return { quality, issues, recommendations };
}

// Phase 9 — Priority level
function derivePriorityLevel(opportunity: number, conversion: number, trend: number): string {
  const composite = opportunity * 0.5 + conversion * 0.3 + trend * 0.2;
  if (composite >= 85) return "Very High";
  if (composite >= 70) return "High";
  if (composite >= 50) return "Medium";
  return "Low";
}