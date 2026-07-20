// Genesis V4 — Creative Intelligence Engine: DNA backfill.
// For every pcie2_creatives row with an image_url but no gcd_visual_dna entry,
// run a vision pass via the Lovable AI Gateway and persist the 40+ trait DNA.
// Idempotent, batched, hourly cron-safe.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const BATCH = 25;

const VISION_SCHEMA = `{
 "camera": "string", "lens": "string", "perspective": "string",
 "lighting": "string", "light_direction": "string", "light_temperature": "string",
 "time_of_day": "string", "season": "string", "weather": "string",
 "environment": "string", "indoor": "boolean", "outdoor": "boolean",
 "composition": "string", "framing": "string", "negative_space": "string",
 "breed": "string", "pose": "string", "facial_expression": "string",
 "eye_contact": "boolean", "motion": "string", "interaction": "string",
 "story": "string", "typography": "string", "cta": "string",
 "color_palette": "string", "warmth": "string", "contrast": "string", "brightness": "string", "saturation": "string",
 "luxury_score": "0-100", "minimalism_score": "0-100", "clutter_score": "0-100",
 "product_visibility_score": "0-100", "human_presence": "boolean", "pet_presence": "boolean",
 "emotion_primary": "string", "emotion_secondary": "string",
 "psychological_trigger": "string", "desired_feeling": "string"
}`;

async function tagOne(imageUrl: string) {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a creative DNA tagger. Reply ONLY with valid JSON matching the requested schema. Use lowercase short tokens (e.g. 'golden_retriever', 'warm_sunset'). Booleans must be true/false. Scores 0-100 integers." },
        { role: "user", content: [
          { type: "text", text: `Tag this Pinterest creative image. Schema: ${VISION_SCHEMA}` },
          { type: "image_url", image_url: { url: imageUrl } },
        ] },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`gateway ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(raw); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Find creatives missing DNA.
  const { data: candidates, error } = await sb
    .from("pcie2_creatives")
    .select("id, image_url, product_id, family")
    .not("image_url", "is", null)
    .eq("status", "published")
    .limit(BATCH * 4);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const ids = (candidates ?? []).map((c) => c.id);
  const { data: existing } = await sb.from("gcd_visual_dna").select("creative_id").in("creative_id", ids);
  const done = new Set((existing ?? []).map((r: any) => r.creative_id));
  const todo = (candidates ?? []).filter((c) => !done.has(c.id)).slice(0, BATCH);

  let tagged = 0, failed = 0;
  for (const c of todo) {
    try {
      const dna = await tagOne(c.image_url as string);
      const row: Record<string, unknown> = { creative_id: c.id, metadata: { source: "cie-v4-dna-backfill", product_id: c.product_id, family: c.family } };
      for (const [k, v] of Object.entries(dna)) row[k] = v;
      const { error: upErr } = await sb.from("gcd_visual_dna").upsert(row, { onConflict: "creative_id" });
      if (upErr) throw upErr;
      // Mirror to gcd_creatives so genome joins resolve.
      await sb.from("gcd_creatives").upsert({
        creative_id: c.id, creative_family: c.family ?? "default", product_id: c.product_id,
        creator_engine: "pcie-v2", status: "published",
      }, { onConflict: "creative_id" });
      tagged++;
    } catch (e) {
      failed++;
      console.error("tag fail", c.id, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, candidates: candidates?.length ?? 0, todo: todo.length, tagged, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});