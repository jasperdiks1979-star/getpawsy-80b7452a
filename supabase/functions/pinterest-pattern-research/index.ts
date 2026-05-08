// ─────────────────────────────────────────────────────────────────────────────
// pinterest-pattern-research
// ─────────────────────────────────────────────────────────────────────────────
// Calls Perplexity (sonar-pro) to research what makes top US pet brand
// Pinterest pins perform, then upserts a normalized "patch" overlay into
// pinterest_pattern_versions (source: 'perplexity_refresh').
//
// We do NOT scrape images. We do NOT copy creatives. We extract the
// underlying visual psychology / composition / hook angles only.
//
// Standard JSON contract: { ok, traceId, message, ... }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const KNOWN_PATTERN_IDS = new Set<string>([
  "cozy_warm_interior",
  "before_after_transformation",
  "editorial_minimal",
  "soft_luxury",
  "scandi_decor",
  "cinematic_pet_portrait",
  "lifestyle_first_subtle_product",
  "emotional_bonding",
  "adventure_golden_hour",
  "cozy_emotional_comfort",
  "clean_aspirational_routine",
  "multi_pet_decor",
]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function newTraceId() {
  return `ppr_${crypto.randomUUID().slice(0, 8)}`;
}

const RESEARCH_PROMPT = `You analyze the visual psychology of high-performing Pinterest pins from premium US pet brands (e.g. brands competing in cat trees, automatic litter boxes, calming dog beds, dog harnesses, dog stroller, cat fountains, grooming).

Do NOT name or quote any specific competitor pin or asset. Do NOT mention brand names. Extract only the *underlying patterns* that make these pins save and click well.

For EACH pattern in the input list, return a JSON object with the schema:
{
  "patterns": [
    {
      "id": "<one of the input ids>",
      "psychology_refresh": "<≤180 chars: refreshed reason this pattern saves/clicks in the US pet niche right now>",
      "composition_refresh": "<≤320 chars: updated composition direction (camera angle, framing, light, scene)>",
      "hook_angles": ["3-5 short emotional hook angle phrases, ≤8 words each"],
      "must_have": ["3-6 visual elements that MUST appear (real homes, golden hour, etc.)"],
      "must_avoid": ["3-6 elements that MUST NOT appear (floating product card, collage, harsh studio lighting, etc.)"]
    }
  ]
}

Return ONLY valid JSON, no prose. Be concrete and brand-neutral.`;

async function callPerplexity(apiKey: string, ids: string[]) {
  const userMsg = `Refresh these pattern ids using current US pet Pinterest trends:\n${ids.join(", ")}`;

  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      temperature: 0.3,
      max_tokens: 2200,
      messages: [
        { role: "system", content: RESEARCH_PROMPT },
        { role: "user", content: userMsg },
      ],
      search_recency_filter: "month",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "pattern_refresh",
          schema: {
            type: "object",
            properties: {
              patterns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    psychology_refresh: { type: "string" },
                    composition_refresh: { type: "string" },
                    hook_angles: { type: "array", items: { type: "string" } },
                    must_have: { type: "array", items: { type: "string" } },
                    must_avoid: { type: "array", items: { type: "string" } },
                  },
                  required: [
                    "id",
                    "psychology_refresh",
                    "composition_refresh",
                    "hook_angles",
                    "must_have",
                    "must_avoid",
                  ],
                },
              },
            },
            required: ["patterns"],
          },
        },
      },
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`perplexity ${resp.status}: ${text.slice(0, 400)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`perplexity returned non-JSON: ${text.slice(0, 200)}`);
  }
  const content =
    (parsed as { choices?: Array<{ message?: { content?: string } }> })
      ?.choices?.[0]?.message?.content ?? "";
  // content is a JSON string per response_format
  let inner: unknown;
  try {
    inner = JSON.parse(content);
  } catch {
    // Some responses wrap in markdown; strip fences and retry
    const stripped = content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    inner = JSON.parse(stripped);
  }
  return inner as { patterns: Array<{ id: string } & Record<string, unknown>> };
}

function normalizePatch(raw: { id: string } & Record<string, unknown>) {
  return {
    psychology_refresh: String(raw.psychology_refresh || "").slice(0, 240),
    composition_refresh: String(raw.composition_refresh || "").slice(0, 480),
    hook_angles: Array.isArray(raw.hook_angles)
      ? (raw.hook_angles as unknown[])
          .map((s) => String(s).slice(0, 80))
          .filter(Boolean)
          .slice(0, 6)
      : [],
    must_have: Array.isArray(raw.must_have)
      ? (raw.must_have as unknown[])
          .map((s) => String(s).slice(0, 80))
          .filter(Boolean)
          .slice(0, 8)
      : [],
    must_avoid: Array.isArray(raw.must_avoid)
      ? (raw.must_avoid as unknown[])
          .map((s) => String(s).slice(0, 80))
          .filter(Boolean)
          .slice(0, 8)
      : [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = newTraceId();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");

    if (!PERPLEXITY_API_KEY) {
      return jsonResponse(
        { ok: false, traceId, message: "PERPLEXITY_API_KEY not configured" },
        400,
      );
    }

    // AuthN: must be an admin user
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ ok: false, traceId, message: "Unauthorized" }, 401);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return jsonResponse({ ok: false, traceId, message: "Admin only" }, 403);
    }

    // Optional: caller may restrict which pattern ids to refresh
    let body: { pattern_ids?: string[] } = {};
    if (req.method === "POST") {
      try {
        body = (await req.json()) as { pattern_ids?: string[] };
      } catch {
        body = {};
      }
    }
    const requested = (body.pattern_ids ?? []).filter((id) => KNOWN_PATTERN_IDS.has(id));
    const ids = requested.length > 0 ? requested : Array.from(KNOWN_PATTERN_IDS);

    const research = await callPerplexity(PERPLEXITY_API_KEY, ids);
    const accepted: Array<{ pattern_id: string; version: number }> = [];
    const skipped: string[] = [];

    for (const raw of research.patterns ?? []) {
      if (!raw?.id || !KNOWN_PATTERN_IDS.has(raw.id)) {
        skipped.push(String(raw?.id ?? "(unknown)"));
        continue;
      }
      const patch = normalizePatch(raw);
      // Compute next version
      const { data: latest } = await admin
        .from("pinterest_pattern_versions")
        .select("version")
        .eq("pattern_id", raw.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = (latest?.version ?? 0) + 1;

      const { error: insErr } = await admin.from("pinterest_pattern_versions").insert({
        pattern_id: raw.id,
        version: nextVersion,
        patch,
        source: "perplexity_refresh",
        notes: `Auto-research refresh ${new Date().toISOString().slice(0, 10)}`,
      });
      if (insErr) {
        skipped.push(`${raw.id}:${insErr.message}`);
        continue;
      }
      accepted.push({ pattern_id: raw.id, version: nextVersion });
    }

    return jsonResponse({
      ok: true,
      traceId,
      message: `Refreshed ${accepted.length} pattern(s)`,
      accepted,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[pinterest-pattern-research]", traceId, message);
    return jsonResponse({ ok: false, traceId, message }, 500);
  }
});