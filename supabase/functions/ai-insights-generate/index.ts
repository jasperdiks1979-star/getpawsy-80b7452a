/**
 * ai-insights-generate
 *
 * Iteration B — AI Insights Engine.
 *
 * Pulls the latest aggregates from `ai-revenue-insights` (same edge function
 * used by the dashboard) and asks Lovable AI to surface 3-8 prioritized
 * observations + recommendations. Persists structured rows into
 * `ai_revenue_insights` (with dedupe by prompt_hash within 24h).
 *
 * Strictly additive. Does NOT touch Stripe / checkout / SEO routing.
 *
 * Safety rails (per user spec):
 *  - Graceful 429 (rate limit) and 402 (out of credits) propagation
 *  - No retries / no infinite loops — one attempt, surface error JSON
 *  - Admin-only via JWT (verify_jwt is false at the function layer;
 *    in-code check requires authenticated admin or service_role)
 *  - Returns standard { ok, traceId, message?, ... } envelope
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

// Per user: high-value AI tasks (Insights, SEO, creative strategy) use 2.5-pro.
const MODEL = "google/gemini-2.5-pro";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function traceId() {
  return crypto.randomUUID().slice(0, 8);
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface InsightOut {
  scope: "global" | "product" | "traffic_source" | "device" | "audience" | "funnel";
  scope_ref?: string | null;
  insight_type: string;
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  evidence?: Record<string, unknown>;
  recommendations?: string[];
}

const SYSTEM_PROMPT = `You are GetPawsy's senior revenue analyst.
Given aggregated funnel + product + traffic metrics for an ecommerce pet store,
surface 3-8 PRIORITIZED, ACTIONABLE insights. Be specific, cite numbers, and
propose concrete next steps. No fluff, no generic SEO platitudes.

Severity rubric:
- critical: clear revenue leak, broken funnel step, or anomalous drop
- warn: notable underperformance vs prior period or vs peers
- info: opportunity / positive trend worth amplifying

Scope rubric:
- funnel: PDP->ATC, ATC->checkout, checkout->payment friction
- product: a specific product (set scope_ref to product id)
- traffic_source: a specific source (scope_ref = tiktok|pinterest|google|organic|direct|other)
- device: scope_ref = mobile|desktop|tablet
- audience: returning vs new visitor patterns
- global: store-wide observation

Never recommend touching checkout / payments / Stripe — they are stable.`;

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "report_insights",
    description: "Return 3-8 prioritized revenue insights.",
    parameters: {
      type: "object",
      properties: {
        insights: {
          type: "array",
          minItems: 3,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              scope: {
                type: "string",
                enum: ["global", "product", "traffic_source", "device", "audience", "funnel"],
              },
              scope_ref: { type: "string", description: "id / source / device key when scope is not global" },
              insight_type: { type: "string", description: "short slug e.g. atc_drop, mobile_friction, source_quality" },
              severity: { type: "string", enum: ["info", "warn", "critical"] },
              title: { type: "string", maxLength: 120 },
              body: { type: "string", maxLength: 800 },
              evidence: { type: "object", description: "numeric facts cited (key:value pairs)" },
              recommendations: {
                type: "array",
                items: { type: "string", maxLength: 240 },
                maxItems: 4,
              },
            },
            required: ["scope", "insight_type", "severity", "title", "body"],
            additionalProperties: false,
          },
        },
      },
      required: ["insights"],
      additionalProperties: false,
    },
  },
};

/** Build a compact summary the model can reason about cheaply. */
function compactSummary(summary: any) {
  if (!summary) return {};
  return {
    range: summary.range,
    totals: {
      events: summary.total_events,
      sessions: summary.total_sessions,
      bot_filtered_pct: summary.bot_filtered_pct,
    },
    quality_scores: summary.quality_scores ?? null,
    funnel: summary.funnel,
    behavior: summary.behavior,
    devices: summary.device_split?.slice(0, 4) ?? summary.devices,
    os: summary.os_split?.slice(0, 4) ?? summary.os,
    traffic_quality: summary.traffic_quality?.slice(0, 8) ?? [],
    winners: (summary.winner_products ?? []).slice(0, 6).map((p: any) => ({
      id: p.id, name: p.name, views: p.views, atc_rate: p.atc_rate,
      views_delta_pct: p.views_delta_pct, atc_rate_delta_pp: p.atc_rate_delta_pp,
    })),
    breakouts: (summary.breakout_products ?? []).slice(0, 6).map((p: any) => ({
      id: p.id, name: p.name, views: p.views, views_delta_pct: p.views_delta_pct,
    })),
    falling: (summary.falling_products ?? []).slice(0, 6).map((p: any) => ({
      id: p.id, name: p.name, views: p.views, views_delta_pct: p.views_delta_pct,
    })),
    worst_rage: (summary.worst_rage ?? []).slice(0, 5).map((p: any) => ({
      id: p.id, name: p.name, rage_clicks: p.rage_clicks, views: p.views,
    })),
    top_exit: (summary.top_exit ?? []).slice(0, 5),
    baselines: summary.baselines,
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
    const userId = userRes.user.id;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return jsonResponse({ ok: false, traceId: tid, message: "admin required" }, 403);

    // ---- Inputs ----
    const body = await req.json().catch(() => ({}));
    const range = (body.range as string) || "7d";
    const source = (body.source as string) || "all";
    const force = !!body.force;

    // ---- Fetch latest aggregates from sibling function ----
    const aggUrl = new URL(`${SUPABASE_URL}/functions/v1/ai-revenue-insights`);
    aggUrl.searchParams.set("range", range);
    if (source !== "all") aggUrl.searchParams.set("source", source);
    const aggResp = await fetch(aggUrl.toString(), {
      headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
    });
    if (!aggResp.ok) {
      return jsonResponse({
        ok: false, traceId: tid,
        message: `aggregates fetch failed (${aggResp.status})`,
      }, 502);
    }
    const aggJson = await aggResp.json();
    if (!aggJson?.ok || !aggJson?.summary) {
      return jsonResponse({ ok: false, traceId: tid, message: "no summary available" }, 502);
    }
    const summary = aggJson.summary;
    const compact = compactSummary(summary);

    // ---- Dedupe: skip if same prompt_hash within 24h (unless force) ----
    const promptHash = await sha256Hex(JSON.stringify({ range, source, m: MODEL, c: compact }));
    if (!force) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from("ai_revenue_insights")
        .select("id")
        .eq("prompt_hash", promptHash)
        .gte("generated_at", since)
        .limit(1);
      if (existing && existing.length > 0) {
        return jsonResponse({
          ok: true, traceId: tid, deduped: true,
          message: "Recent insights exist for this configuration. Pass force:true to regenerate.",
          inserted: 0,
        });
      }
    }

    // ---- Call Lovable AI Gateway (single attempt, no retry storms) ----
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyze this aggregate snapshot (range=${range}, source=${source}) and call report_insights with 3-8 prioritized findings.\n\n${JSON.stringify(compact)}`,
          },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "report_insights" } },
      }),
    });

    if (aiResp.status === 429) {
      return jsonResponse({
        ok: false, traceId: tid, rate_limited: true,
        message: "Rate limit hit on AI gateway. Try again in a minute.",
      }, 429);
    }
    if (aiResp.status === 402) {
      return jsonResponse({
        ok: false, traceId: tid, credits_exhausted: true,
        message: "AI credits exhausted. Add funds in Settings → Workspace → Usage.",
      }, 402);
    }
    if (!aiResp.ok) {
      const txt = await aiResp.text().catch(() => "");
      console.error("[ai-insights-generate] gateway error", aiResp.status, txt.slice(0, 500));
      return jsonResponse({
        ok: false, traceId: tid,
        message: `AI gateway error (${aiResp.status})`,
      }, 502);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: { insights: InsightOut[] } | null = null;
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("[ai-insights-generate] could not parse tool args", e);
      }
    }

    const insights = Array.isArray(parsed?.insights) ? parsed!.insights : [];
    if (!insights.length) {
      return jsonResponse({
        ok: false, traceId: tid,
        message: "AI returned no insights",
        raw: aiJson?.choices?.[0]?.message ?? null,
      }, 502);
    }

    // ---- Persist ----
    const now = new Date().toISOString();
    const windowStart = summary?.window?.since ?? summary?.range_since ?? null;
    const windowEnd = summary?.window?.until ?? summary?.range_until ?? null;

    const rows = insights.slice(0, 8).map((it) => ({
      scope: it.scope,
      scope_ref: it.scope_ref ?? null,
      insight_type: (it.insight_type || "general").slice(0, 60),
      severity: it.severity ?? "info",
      title: (it.title || "").slice(0, 200),
      body: (it.body || "").slice(0, 2000),
      evidence: it.evidence ?? {},
      recommendations: Array.isArray(it.recommendations) ? it.recommendations.slice(0, 4) : [],
      model: MODEL,
      prompt_hash: promptHash,
      window_start: windowStart,
      window_end: windowEnd,
      generated_at: now,
    }));

    const { data: inserted, error: insErr } = await supabase
      .from("ai_revenue_insights")
      .insert(rows)
      .select("id");

    if (insErr) {
      console.error("[ai-insights-generate] insert failed", insErr);
      return jsonResponse({
        ok: false, traceId: tid,
        message: "failed to persist insights: " + insErr.message,
      }, 500);
    }

    return jsonResponse({
      ok: true,
      traceId: tid,
      inserted: inserted?.length ?? 0,
      model: MODEL,
      insights: rows,
    });
  } catch (e) {
    console.error("[ai-insights-generate] unhandled", e);
    return jsonResponse({
      ok: false, traceId: tid,
      message: e instanceof Error ? e.message : "unknown error",
    }, 500);
  }
});