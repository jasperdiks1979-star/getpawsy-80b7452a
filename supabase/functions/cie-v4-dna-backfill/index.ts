// Genesis V4 — Creative Intelligence Engine: DNA backfill (cost-safe v2).
//
// Strategy: LOCAL_VISUAL_FINGERPRINT_FALLBACK + SAFE_DEFER_WITH_BACKLOG.
//  1. Deterministic pass (zero AI cost): dHash + palette + brightness/contrast/
//     saturation/warmth are computed locally and persisted to gcd_visual_dna,
//     mirrored into gcd_creatives. Family / duplicate lookups keep working.
//  2. Optional AI enrichment for semantic traits. On a 402/403 the run trips a
//     circuit breaker (gcd_backfill_state.paused + resume_after) and every
//     remaining creative is parked in gcd_visual_dna_backlog with
//     status='deferred_due_to_credits' — no retry storm, no repeated 402s.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { computeDeterministicDna, fetchImageBytes } from "../_shared/deterministic-visual-dna.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const BATCH = 6;
/** Hard wall-clock budget per invocation — keeps the isolate under its CPU limit. */
const RUN_BUDGET_MS = 20_000;
/** How long the credit circuit breaker stays closed before one probe is allowed. */
const CREDIT_PAUSE_MINUTES = 1440;

const VISION_SCHEMA = `{
 "camera":"string","lens":"string","perspective":"string","lighting":"string",
 "light_direction":"string","light_temperature":"string","time_of_day":"string",
 "season":"string","weather":"string","environment":"string","indoor":true,"outdoor":false,
 "composition":"string","framing":"string","breed":"string","pose":"string",
 "facial_expression":"string","eye_contact":true,"motion":"string","interaction":"string",
 "story":"string","typography":"string","cta":"string","texture":"string",
 "luxury_score":0,"minimalism_score":0,"clutter_score":0,"product_visibility_score":0,
 "human_presence":true,"pet_presence":true,"emotion_primary":"string",
 "emotion_secondary":"string","psychological_trigger":"string","desired_feeling":"string"
}`;

const TEXT_FIELDS = [
  "camera", "lens", "perspective", "lighting", "light_direction", "light_temperature",
  "time_of_day", "season", "weather", "environment", "composition", "framing", "breed",
  "pose", "facial_expression", "motion", "interaction", "story", "typography", "cta", "texture",
  "emotion_primary", "emotion_secondary", "psychological_trigger", "desired_feeling",
];
const BOOL_FIELDS = ["indoor", "outdoor", "eye_contact", "human_presence", "pet_presence"];
const NUM_FIELDS = ["luxury_score", "minimalism_score", "clutter_score", "product_visibility_score"];

class CreditsUnavailable extends Error {
  constructor(public status: number, public detail: string) {
    super(`gateway ${status}: ${detail}`);
  }
}

function coerce(dna: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of TEXT_FIELDS) if (typeof dna[k] === "string" && dna[k]) out[k] = String(dna[k]).slice(0, 120);
  for (const k of BOOL_FIELDS) if (typeof dna[k] === "boolean") out[k] = dna[k];
  for (const k of NUM_FIELDS) {
    const v = Number(dna[k]);
    if (Number.isFinite(v)) out[k] = Math.max(0, Math.min(100, v));
  }
  return out;
}

async function tagOne(imageUrl: string): Promise<Record<string, unknown>> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a creative DNA tagger. Reply ONLY with valid JSON matching the requested schema. Use lowercase short tokens. Booleans true/false. Scores are 0-100 integers." },
        { role: "user", content: [
          { type: "text", text: `Tag this Pinterest creative image. Schema: ${VISION_SCHEMA}` },
          { type: "image_url", image_url: { url: imageUrl } },
        ] },
      ],
    }),
  });
  if (resp.status === 402 || resp.status === 403) throw new CreditsUnavailable(resp.status, (await resp.text()).slice(0, 400));
  if (!resp.ok) throw new Error(`gateway ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const json = await resp.json();
  try { return coerce(JSON.parse(json.choices?.[0]?.message?.content ?? "{}")); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cron sends {} */ }
  const limit = Math.max(1, Math.min(BATCH, Number(body.limit) || BATCH));
  const enrichRequested = body.enrich !== false;
  const force = body.force === true;

  const { data: state } = await sb.from("gcd_backfill_state").select("*").eq("id", 1).maybeSingle();
  const pausedUntil = state?.resume_after ? new Date(state.resume_after as string) : null;
  const creditPaused = !force && Boolean(state?.paused) && (!pausedUntil || pausedUntil > new Date());
  // While paused we still do the free deterministic work, but never call the gateway.
  let enrich = enrichRequested && !creditPaused && LOVABLE_API_KEY.length > 0;

  const { data: candidates, error } = await sb
    .from("pcie2_creatives")
    .select("id, image_url, product_id, family")
    .not("image_url", "is", null)
    .eq("status", "published")
    .limit(BATCH * 4);
  if (error) return json({ error: error.message }, 500);

  const ids = (candidates ?? []).map((c) => c.id);
  const { data: existing } = await sb.from("gcd_visual_dna").select("creative_id").in("creative_id", ids);
  const done = new Set((existing ?? []).map((r: { creative_id: string }) => r.creative_id));
  const todo = (candidates ?? []).filter((c) => !done.has(c.id)).slice(0, limit);

  let deterministic = 0, enriched = 0, deferred = 0, failed = 0;
  let creditIncident: string | null = null;

  for (const c of todo) {
    const imageUrl = c.image_url as string;
    try {
      const bytes = await fetchImageBytes(imageUrl);
      if (!bytes) throw new Error("image_fetch_failed");
      const base = await computeDeterministicDna(bytes);

      let semantic: Record<string, unknown> = {};
      let source = "deterministic_local";
      if (enrich) {
        try {
          semantic = await tagOne(imageUrl);
          source = "deterministic_local+ai";
          enriched++;
        } catch (e) {
          if (e instanceof CreditsUnavailable) {
            creditIncident = e.message;
            enrich = false; // circuit breaker: no further gateway calls this run
          } else {
            throw e;
          }
        }
      }

      const row: Record<string, unknown> = {
        creative_id: c.id,
        color_palette: base.color_palette,
        attention_flow: [],
        brightness: base.brightness,
        contrast: base.contrast,
        saturation: base.saturation,
        warmth: base.warmth,
        texture: base.texture,
        ...semantic,
        metadata: {
          source: "cie-v4-dna-backfill",
          dna_source: source,
          phash: base.phash,
          product_id: c.product_id,
          family: c.family,
        },
      };
      const { error: upErr } = await sb.from("gcd_visual_dna").upsert(row, { onConflict: "creative_id" });
      if (upErr) throw upErr;
      deterministic++;

      await sb.from("gcd_creatives").upsert({
        creative_id: c.id, creative_family: c.family ?? "default", product_id: c.product_id,
        creator_engine: "pcie-v2", status: "published",
      }, { onConflict: "creative_id" });

      const needsSemantic = Object.keys(semantic).length === 0;
      await sb.from("gcd_visual_dna_backlog").upsert({
        creative_id: c.id,
        image_url: imageUrl,
        status: needsSemantic ? (creditIncident ? "deferred_due_to_credits" : "deterministic_only") : "complete",
        reason: needsSemantic ? (creditIncident ? "ai_gateway_402_403" : "enrichment_disabled") : null,
        deterministic_done: true,
        phash: base.phash,
        last_attempt_at: new Date().toISOString(),
        last_error: creditIncident,
        updated_at: new Date().toISOString(),
      }, { onConflict: "creative_id" });
      if (needsSemantic && creditIncident) deferred++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error("dna fail", c.id, msg);
      await sb.from("gcd_visual_dna_backlog").upsert({
        creative_id: c.id, image_url: imageUrl, status: "error", reason: "processing_error",
        last_error: msg.slice(0, 500), last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "creative_id" });
    }
  }

  const now = new Date();
  if (creditIncident) {
    await sb.from("gcd_backfill_state").upsert({
      id: 1, paused: true, paused_reason: creditIncident.slice(0, 500), paused_at: now.toISOString(),
      resume_after: new Date(now.getTime() + CREDIT_PAUSE_MINUTES * 60_000).toISOString(),
      last_run_at: now.toISOString(),
      last_result: { deterministic, enriched, deferred, failed },
    });
  } else if (enriched > 0 && state?.paused) {
    await sb.from("gcd_backfill_state").upsert({
      id: 1, paused: false, paused_reason: null, paused_at: null, resume_after: null,
      last_run_at: now.toISOString(), last_result: { deterministic, enriched, deferred, failed },
    });
  } else {
    await sb.from("gcd_backfill_state").update({
      last_run_at: now.toISOString(), last_result: { deterministic, enriched, deferred, failed },
    }).eq("id", 1);
  }

  return json({
    ok: true,
    credit_paused: creditPaused,
    enrichment_enabled: enrich || enriched > 0,
    candidates: candidates?.length ?? 0,
    todo: todo.length,
    deterministic_written: deterministic,
    ai_enriched: enriched,
    deferred_due_to_credits: deferred,
    failed,
    credit_incident: creditIncident,
  });
});
