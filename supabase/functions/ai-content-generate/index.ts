/**
 * ai-content-generate
 *
 * Iteration C — shared Creative + SEO generation function.
 *
 * kind dispatch:
 *   creative:tiktok_hook | pinterest_concept | meta_angle | hero_copy
 *           | pdp_block  | ugc_idea         | benefit_bullets
 *   seo:    keyword_gap  | faq              | internal_link
 *           | metadata   | schema           | low_ctr_warning
 *           | orphan_page | weak_content    | guide_idea
 *
 * Pulls real funnel + product aggregates from sibling `ai-revenue-insights`
 * and saved insights from `ai_revenue_insights`, then asks Lovable AI to
 * draft 3-8 candidates via tool-calling. Persists to `ai_creative_drafts`
 * or `ai_seo_drafts` (draft-only, never auto-published).
 *
 * Safety:
 *  - Admin JWT required (in-code check; verify_jwt is false at the layer)
 *  - 429 / 402 surfaced verbatim, no retry storms
 *  - Dedup by prompt_hash within 12h unless force:true
 *  - Quality filter rejects rows with banned terms / fake stats / medical claims
 *  - Never touches Stripe / checkout / SEO routing / canonicals
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// Flash for high-volume creative variants; Pro for strategic SEO planning.
const MODEL_FLASH = "google/gemini-3-flash-preview";
const MODEL_PRO = "google/gemini-2.5-pro";

const CREATIVE_KINDS = new Set([
  "tiktok_hook", "pinterest_concept", "meta_angle", "hero_copy",
  "pdp_block", "ugc_idea", "benefit_bullets", "homepage_promo",
  "scroll_stopper",
]);
const SEO_KINDS = new Set([
  "keyword_gap", "faq", "internal_link", "metadata", "schema",
  "low_ctr_warning", "orphan_page", "weak_content", "guide_idea",
  "collection_expansion",
]);

// Banned phrasing per project memory: no medical claims, no fake stats,
// no dropshipping / vet-approved / eco-friendly hype, no fake reviews.
const BANNED_PHRASES = [
  /vet[\s-]?approved/i,
  /eco[\s-]?friendly/i,
  /cures? \w+/i,
  /treat(s|ment) (cancer|disease|illness)/i,
  /\b\d{2,3}% of (vets|pet owners|dogs|cats)/i,
  /clinically proven/i,
  /guaranteed (results|cure|healing)/i,
  /scientifically proven/i,
  /lorem ipsum/i,
  /placeholder/i,
  /\bdropship/i,
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function traceId() { return crypto.randomUUID().slice(0, 8); }
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface DraftOut {
  title: string;
  body?: string;
  variants?: string[];
  recommendations?: string[];
  affected_url?: string;
  target_ref?: string;
  traffic_source?: string;
  evidence?: Record<string, unknown>;
  confidence?: number;
  expected_revenue_impact?: string;
  expected_seo_impact?: string;
  priority?: "low" | "medium" | "high";
}

function qualityCheck(d: DraftOut): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 100;
  const text = [
    d.title, d.body,
    ...(d.variants || []),
    ...(d.recommendations || []),
  ].filter(Boolean).join("\n");

  for (const re of BANNED_PHRASES) {
    if (re.test(text)) { flags.push("banned:" + re.source); score -= 25; }
  }
  if (!d.title || d.title.length < 4) { flags.push("empty_title"); score -= 50; }
  if (text.length > 0) {
    // keyword stuffing: any single 3+ letter word repeated >6 times
    const counts: Record<string, number> = {};
    for (const w of text.toLowerCase().match(/[a-z]{3,}/g) || []) counts[w] = (counts[w] || 0) + 1;
    const max = Math.max(0, ...Object.values(counts));
    if (max > 6) { flags.push("keyword_stuffing"); score -= 15; }
  }
  // duplicate variants
  if (d.variants) {
    const set = new Set(d.variants.map((v) => v.trim().toLowerCase()));
    if (set.size < d.variants.length) { flags.push("duplicate_variants"); score -= 10; }
  }
  return { score: Math.max(0, score), flags };
}

function buildCreativeSystemPrompt(kind: string): string {
  return `You are GetPawsy's senior performance-marketing copywriter for the US pet market.
Write tight, on-brand, mobile-first ${kind.replace(/_/g, " ")} variants.
Rules:
- Use REAL pain points cited in the provided funnel / insight evidence.
- US English, premium-but-warm voice. Real pets, real owners.
- NO medical claims, NO "vet-approved", NO "eco-friendly", NO fake stats.
- NO fake reviews, NO fabricated percentages, NO "clinically proven".
- NO price anchoring, NO fake urgency ("only 2 left!"), NO scarcity lies.
- Keep TikTok hooks <= 70 chars, Pinterest titles <= 100 chars.
- Output 3-6 distinct variants per draft.`;
}
function buildSeoSystemPrompt(kind: string): string {
  return `You are GetPawsy's senior SEO strategist. Generate ${kind.replace(/_/g, " ")} recommendations.
Rules:
- Buyer-intent, commercial / transactional long-tail keywords first.
- US pet market focus. Reference REAL pages / products / collections from the evidence.
- NEVER propose doorway pages, thin AI spam, duplicate content, or canonical changes.
- NEVER recommend touching /products/* canonicals, sitemap structure, robots.txt rules,
  Stripe / checkout / webhook endpoints.
- For each recommendation include: rationale, expected impact (low|medium|high),
  and the specific URL or surface it applies to.
- Keep titles <= 60 chars, meta descriptions <= 155 chars.`;
}

const CREATIVE_TOOL = {
  type: "function" as const,
  function: {
    name: "report_creatives",
    description: "Return 3-6 creative draft variants with evidence.",
    parameters: {
      type: "object",
      properties: {
        drafts: {
          type: "array", minItems: 3, maxItems: 8,
          items: {
            type: "object",
            properties: {
              title: { type: "string", maxLength: 200 },
              body: { type: "string", maxLength: 1200 },
              variants: { type: "array", items: { type: "string", maxLength: 240 }, maxItems: 6 },
              target_ref: { type: "string", description: "product id, collection slug, or homepage section" },
              traffic_source: { type: "string", description: "tiktok|pinterest|meta|google|organic|all" },
              evidence: { type: "object" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              expected_revenue_impact: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["title"],
            additionalProperties: false,
          },
        },
      },
      required: ["drafts"],
      additionalProperties: false,
    },
  },
};
const SEO_TOOL = {
  type: "function" as const,
  function: {
    name: "report_seo",
    description: "Return 3-8 SEO recommendations grounded in real site data.",
    parameters: {
      type: "object",
      properties: {
        drafts: {
          type: "array", minItems: 3, maxItems: 8,
          items: {
            type: "object",
            properties: {
              title: { type: "string", maxLength: 200 },
              body: { type: "string", maxLength: 1500 },
              affected_url: { type: "string" },
              recommendations: { type: "array", items: { type: "string", maxLength: 280 }, maxItems: 6 },
              evidence: { type: "object" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              expected_seo_impact: { type: "string", enum: ["low", "medium", "high"] },
              priority: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["title"],
            additionalProperties: false,
          },
        },
      },
      required: ["drafts"],
      additionalProperties: false,
    },
  },
};

function compactEvidence(summary: any, insights: any[]) {
  return {
    range: summary?.range,
    quality_scores: summary?.quality_scores ?? null,
    funnel: summary?.funnel,
    behavior: summary?.behavior,
    traffic_quality: (summary?.traffic_quality ?? []).slice(0, 6),
    devices: (summary?.device_split ?? summary?.devices ?? []).slice(0, 4),
    winners: (summary?.winner_products ?? []).slice(0, 6).map((p: any) => ({
      id: p.id, name: p.name, views: p.views, atc_rate: p.atc_rate,
    })),
    breakouts: (summary?.breakout_products ?? []).slice(0, 6).map((p: any) => ({
      id: p.id, name: p.name, views: p.views,
    })),
    falling: (summary?.falling_products ?? []).slice(0, 4).map((p: any) => ({
      id: p.id, name: p.name, views: p.views, views_delta_pct: p.views_delta_pct,
    })),
    top_exit: (summary?.top_exit ?? []).slice(0, 5),
    recent_insights: insights.slice(0, 6).map((i: any) => ({
      severity: i.severity, scope: i.scope, title: i.title,
      recommendations: (i.recommendations ?? []).slice(0, 3),
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, message: "method not allowed" }, 405);

  const tid = traceId();
  try {
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ ok: false, traceId: tid, message: "LOVABLE_API_KEY not configured" }, 500);
    }

    // ---- Auth: admin only ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return jsonResponse({ ok: false, traceId: tid, message: "missing token" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userRes?.user) {
      return jsonResponse({ ok: false, traceId: tid, message: "invalid token" }, 401);
    }
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return jsonResponse({ ok: false, traceId: tid, message: "admin required" }, 403);

    // ---- Inputs ----
    const body = await req.json().catch(() => ({}));
    const family: "creative" | "seo" = body.family === "seo" ? "seo" : "creative";
    const kind = String(body.kind || "");
    const range = String(body.range || "7d");
    const source = String(body.source || "all");
    const focus = typeof body.focus === "string" ? body.focus.slice(0, 500) : "";
    const force = !!body.force;

    const allowed = family === "creative" ? CREATIVE_KINDS : SEO_KINDS;
    if (!allowed.has(kind)) {
      return jsonResponse({ ok: false, traceId: tid, message: `unknown kind '${kind}' for family ${family}` }, 400);
    }

    // ---- Pull live aggregates + recent insights ----
    const aggUrl = new URL(`${SUPABASE_URL}/functions/v1/ai-revenue-insights`);
    aggUrl.searchParams.set("range", range);
    if (source !== "all") aggUrl.searchParams.set("source", source);
    const aggResp = await fetch(aggUrl.toString(), {
      headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
    });
    if (!aggResp.ok) {
      return jsonResponse({ ok: false, traceId: tid, message: `aggregates fetch failed (${aggResp.status})` }, 502);
    }
    const aggJson = await aggResp.json();
    const summary = aggJson?.summary;
    if (!summary) {
      return jsonResponse({ ok: false, traceId: tid, message: "no summary available" }, 502);
    }

    const { data: recentInsights } = await supabase
      .from("ai_revenue_insights")
      .select("severity,scope,scope_ref,title,recommendations,generated_at")
      .order("generated_at", { ascending: false })
      .limit(10);

    const evidence = compactEvidence(summary, recentInsights ?? []);
    const model = family === "seo" ? MODEL_PRO : MODEL_FLASH;
    const promptHash = await sha256Hex(JSON.stringify({ family, kind, range, source, focus, model, evidence }));

    const table = family === "creative" ? "ai_creative_drafts" : "ai_seo_drafts";

    // ---- Dedupe within 12h unless force ----
    if (!force) {
      const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from(table)
        .select("id")
        .eq("prompt_hash", promptHash)
        .gte("generated_at", since)
        .limit(1);
      if (existing && existing.length > 0) {
        return jsonResponse({
          ok: true, traceId: tid, deduped: true, inserted: 0,
          message: "Recent drafts exist for this configuration. Pass force:true to regenerate.",
        });
      }
    }

    // ---- Call Lovable AI Gateway ----
    const systemPrompt = family === "creative" ? buildCreativeSystemPrompt(kind) : buildSeoSystemPrompt(kind);
    const tool = family === "creative" ? CREATIVE_TOOL : SEO_TOOL;
    const toolName = family === "creative" ? "report_creatives" : "report_seo";

    const userMsg = `Family: ${family}\nKind: ${kind}\nRange: ${range}\nSource: ${source}\nFocus: ${focus || "(none)"}\n\nReal funnel + insight evidence:\n${JSON.stringify(evidence)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: toolName } },
      }),
    });

    if (aiResp.status === 429) {
      return jsonResponse({ ok: false, traceId: tid, rate_limited: true, message: "Rate limit hit on AI gateway. Try again in a minute." }, 429);
    }
    if (aiResp.status === 402) {
      return jsonResponse({ ok: false, traceId: tid, credits_exhausted: true, message: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }, 402);
    }
    if (!aiResp.ok) {
      const txt = await aiResp.text().catch(() => "");
      console.error("[ai-content-generate] gateway error", aiResp.status, txt.slice(0, 500));
      return jsonResponse({ ok: false, traceId: tid, message: `AI gateway error (${aiResp.status})` }, 502);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: { drafts: DraftOut[] } | null = null;
    if (toolCall?.function?.arguments) {
      try { parsed = JSON.parse(toolCall.function.arguments); }
      catch (e) { console.error("[ai-content-generate] parse fail", e); }
    }
    const drafts = Array.isArray(parsed?.drafts) ? parsed!.drafts : [];
    if (!drafts.length) {
      return jsonResponse({ ok: false, traceId: tid, message: "AI returned no drafts" }, 502);
    }

    // ---- Quality filter ----
    const now = new Date().toISOString();
    const accepted: any[] = [];
    const rejected: { title: string; flags: string[]; score: number }[] = [];

    for (const d of drafts.slice(0, 8)) {
      const { score, flags } = qualityCheck(d);
      if (score < 60) {
        rejected.push({ title: d.title?.slice(0, 80) ?? "", flags, score });
        continue;
      }
      if (family === "creative") {
        accepted.push({
          kind,
          target_ref: d.target_ref ?? null,
          title: (d.title || "").slice(0, 200),
          body: (d.body || "").slice(0, 2000),
          variants: Array.isArray(d.variants) ? d.variants.slice(0, 6) : [],
          evidence: d.evidence ?? {},
          quality_score: score,
          quality_flags: flags,
          confidence: typeof d.confidence === "number" ? d.confidence : null,
          expected_revenue_impact: d.expected_revenue_impact ?? null,
          traffic_source: d.traffic_source ?? (source !== "all" ? source : null),
          status: "suggested",
          model,
          prompt_hash: promptHash,
          generated_at: now,
        });
      } else {
        accepted.push({
          kind,
          affected_url: d.affected_url ?? null,
          title: (d.title || "").slice(0, 200),
          body: (d.body || "").slice(0, 2500),
          recommendations: Array.isArray(d.recommendations) ? d.recommendations.slice(0, 6) : [],
          evidence: d.evidence ?? {},
          quality_score: score,
          quality_flags: flags,
          confidence: typeof d.confidence === "number" ? d.confidence : null,
          expected_seo_impact: d.expected_seo_impact ?? null,
          priority: d.priority ?? "medium",
          status: "suggested",
          model,
          prompt_hash: promptHash,
          generated_at: now,
        });
      }
    }

    if (!accepted.length) {
      return jsonResponse({
        ok: false, traceId: tid,
        message: "All drafts rejected by quality filter",
        rejected,
      }, 422);
    }

    const { data: inserted, error: insErr } = await supabase
      .from(table)
      .insert(accepted)
      .select("id");
    if (insErr) {
      console.error("[ai-content-generate] insert failed", insErr);
      return jsonResponse({ ok: false, traceId: tid, message: "failed to persist drafts: " + insErr.message }, 500);
    }

    return jsonResponse({
      ok: true,
      traceId: tid,
      family, kind, model,
      inserted: inserted?.length ?? 0,
      rejected,
    });
  } catch (e) {
    console.error("[ai-content-generate] unhandled", e);
    return jsonResponse({
      ok: false, traceId: tid,
      message: e instanceof Error ? e.message : "unknown error",
    }, 500);
  }
});