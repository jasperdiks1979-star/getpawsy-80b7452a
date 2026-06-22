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
  mode?: "dry_run" | "scan" | "scan_all" | "scan_one" | "force_rebuild";
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
  let q = sb.from("products").select("id,name,slug,category,description,price,images").eq("is_active", true).limit(config.max_products_per_run);
  if (mode === "scan_one" && body.product_id) {
    q = sb.from("products").select("id,name,slug,category,description,price,images").eq("id", body.product_id).limit(1);
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

      await sb.from("product_intelligence").upsert({
        product_id: p.id,
        intelligence_version: config.intelligence_version,
        last_scanned_at: new Date().toISOString(),
        scan_status: "ok",
        scan_error: null,
        google_product_category: gpc.path,
        google_product_category_id: gpc.id,
        google_category_confidence: gpc.confident ? 0.95 : 0.5,
        pinterest_topics: ai.pinterest_topics ?? [],
        topic_confidence: ai.topic_confidence ?? null,
        primary_board: ai.primary_board ?? null,
        secondary_boards: ai.secondary_boards ?? [],
        seo_title: ai.seo_title ?? null,
        seo_description: ai.seo_description ?? null,
        pinterest_description: ai.pinterest_description ?? null,
        primary_keyword: ai.primary_keyword ?? null,
        secondary_keywords: ai.secondary_keywords ?? [],
        long_tail_keywords: ai.long_tail_keywords ?? [],
        keyword_score: ai.keyword_score ?? null,
        intent_type: ai.intent_type ?? null,
        intent_score: ai.intent_score ?? null,
        opportunity_score: opportunity.score,
        opportunity_tier: opportunity.tier,
        opportunity_factors: opportunity.factors,
        product_tags: ai.product_tags ?? [],
        feed_optimization_status: "optimized",
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
  "topic_confidence": number,                  // 0..1
  "primary_board": string,                     // must be one of the boards listed
  "secondary_boards": [string, ...],           // 0-2 from the board list
  "seo_title": string,                         // <=70 chars, human readable
  "seo_description": string,                   // 300-600 words, natural language
  "pinterest_description": string,             // 200-500 chars, with CTA
  "primary_keyword": string,
  "secondary_keywords": [string, ...],         // 3-6
  "long_tail_keywords": [string, ...],         // 3-6
  "keyword_score": number,                     // 0..100
  "intent_type": "Problem Solving"|"Entertainment"|"Comfort"|"Training"|"Health"|"Safety"|"Travel"|"Cleaning"|"Luxury",
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
  const tier = score >= 90 ? "High Priority" : score >= 70 ? "Strong Opportunity" : score >= 50 ? "Average" : "Low Priority";
  return { score, tier, factors };
}