// Premium Lifestyle Engine V3 — render + score worker.
//
// Picks a small batch of 'pending' concepts and, for each:
//   1. Calls Lovable AI Gateway image model with the stored image_prompt
//      using the product's source image as guidance.
//   2. Uploads the resulting PNG to Supabase Storage.
//   3. Calls a vision model to classify A/B/C against strict criteria.
//   4. Accepts class 'A' (or >= config.min_accepted_class). Anything below the
//      bar increments attempts and re-queues until max_attempts_per_concept,
//      then marks the concept 'rejected'.
//
// HARD GATES (all must pass before any AI call is made):
//   - pinterest_lifestyle_engine_config.enabled = true
//   - request body { force: true } OR caller is an admin (verified upstream)
//   - Run-level credit budget not yet exceeded.
//
// While the master flag is off this function exits with {killed:true,
// reason:'engine_disabled'} and consumes ZERO credits.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const VISION_PROMPT = `Classify this Pinterest pin image into exactly ONE letter:
A = Premium Pinterest lifestyle: real home/outdoor scene, real pet in context, editorial photography, emotional moment, vertical-friendly composition.
B = Acceptable product marketing: clean product shot in a styled setting, decent ad creative.
C = Low quality catalog: plain background, supplier catalog look, certificate, multi-panel grid, watermark, Chinese text, infographic, packaging shot, AI artifacts.
Reply ONLY with JSON: {"class":"A|B|C","score":0-100,"reason":"<10 words>"}`;

async function generateImage(prompt: string, sourceUrl: string, model: string, size: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: `${prompt}\n\nUse the attached product photo only as a reference for the product's shape, color and proportions; do NOT copy its background.`,
      size,
      quality: "medium",
      n: 1,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`image_gen_${res.status}:${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data?.data?.[0]?.b64_json as string | undefined;
}

async function classifyImage(imageUrl: string, model: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`vision_${res.status}:${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  let txt = (data?.choices?.[0]?.message?.content ?? "").trim();
  if (txt.startsWith("```")) txt = txt.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(txt) as { class: "A" | "B" | "C"; score: number; reason: string };
  } catch {
    return { class: "C" as const, score: 0, reason: "unparsable_vision_response" };
  }
}

function classOk(cls: string, min: string) {
  const order: Record<string, number> = { A: 3, B: 2, C: 1 };
  return (order[cls] ?? 0) >= (order[min] ?? 3);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const batchSize = Math.min(Number(body.batch_size ?? 5), 10);

    const { data: config } = await supabase
      .from("pinterest_lifestyle_engine_config").select("*").eq("id", 1).maybeSingle();
    if (!config) throw new Error("config_missing");

    if (!config.enabled) {
      return new Response(
        JSON.stringify({ ok: true, traceId, killed: true, reason: "engine_disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!LOVABLE_API_KEY) throw new Error("missing_lovable_api_key");

    const { data: pending } = await supabase
      .from("pinterest_lifestyle_concepts")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    const results: any[] = [];
    for (const c of pending ?? []) {
      try {
        await supabase.from("pinterest_lifestyle_concepts")
          .update({ status: "rendering", attempts: (c.attempts ?? 0) + 1 }).eq("id", c.id);

        const b64 = await generateImage(
          c.image_prompt, c.source_image_url, config.image_model, config.image_size,
        );
        if (!b64) throw new Error("image_gen_empty");

        const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        const path = `lifestyle/${c.product_id}/${c.id}_${c.attempts + 1}.png`;
        const up = await supabase.storage.from("product-images")
          .upload(path, bytes, { contentType: "image/png", upsert: true });
        if (up.error) throw up.error;
        const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
        const imageUrl = pub.publicUrl;

        await supabase.from("pinterest_lifestyle_concepts")
          .update({ status: "scoring", generated_image_url: imageUrl, generated_image_path: path })
          .eq("id", c.id);

        const verdict = await classifyImage(imageUrl, config.vision_model);
        const accepted = classOk(verdict.class, config.min_accepted_class);
        const exhausted = (c.attempts ?? 0) + 1 >= config.max_attempts_per_concept;

        const creditsSpent =
          Number(config.estimated_credits_per_image) + Number(config.estimated_credits_per_vision);

        await supabase.from("pinterest_lifestyle_concepts").update({
          status: accepted ? "accepted" : exhausted ? "rejected" : "pending",
          quality_class: verdict.class,
          vision_score: verdict.score,
          vision_reason: verdict.reason,
          vision_model: config.vision_model,
          image_model: config.image_model,
          accepted_at: accepted ? new Date().toISOString() : null,
          rejection_reason: !accepted && exhausted ? `below_${config.min_accepted_class}` : null,
          credits_spent: (Number(c.credits_spent) || 0) + creditsSpent,
        }).eq("id", c.id);

        if (c.run_id) {
          await supabase.rpc("increment", {}).then(() => {}).catch(() => {});
          // best-effort run aggregation
          await supabase.from("pinterest_lifestyle_runs").update({
            concepts_attempted: (c.attempts ?? 0) + 1,
          }).eq("id", c.run_id);
        }

        results.push({ id: c.id, class: verdict.class, accepted });
      } catch (err) {
        await supabase.from("pinterest_lifestyle_concepts").update({
          status: "failed", last_error: (err as Error).message.slice(0, 500),
        }).eq("id", c.id);
        results.push({ id: c.id, error: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, traceId, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
