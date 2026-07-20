import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Generates 3 short hook variants for a cinematic ad and picks the strongest.
 * Returns { hook_text, hook_type, hook_strength, candidates }.
 */

const HOOK_TYPES = [
  'curiosity',
  'frustration',
  'cleanup_pain',
  'odor_embarrassment',
  'convenience',
  'premium_lifestyle',
  'pet_happiness',
  'stress_reduction',
  'social_proof',
  'late_buyer_regret',
] as const;

const SYSTEM = `You write scroll-stopping hooks for vertical pet-product ads on Pinterest and TikTok.
Rules:
- Max 8 words.
- Concrete, sensory, US English.
- No emojis, no hashtags, no quotes.
- Each hook MUST fit on 2 lines at large mobile type.
- Never use the words: vet-approved, eco-friendly, revolutionary, game-changer.
Return JSON only.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { product_name, product_category, hook_types = HOOK_TYPES, job_id } = await req.json();
    if (!product_name) {
      return new Response(JSON.stringify({ ok: false, message: "product_name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const userPrompt = `Product: ${product_name}
Category: ${product_category ?? "pet"}
Generate 3 hooks. Each hook uses one of these types: ${hook_types.join(", ")}.
Pick the strongest single hook for a US pet owner scrolling on Pinterest.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_hooks",
            description: "Return hook candidates and winner.",
            parameters: {
              type: "object",
              properties: {
                candidates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string" },
                      type: { type: "string", enum: [...HOOK_TYPES] },
                      strength: { type: "number", minimum: 0, maximum: 100 },
                    },
                    required: ["text", "type", "strength"],
                    additionalProperties: false,
                  },
                },
                winner_index: { type: "integer", minimum: 0, maximum: 2 },
              },
              required: ["candidates", "winner_index"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_hooks" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ ok: false, message: `AI gateway ${resp.status}`, detail: t.slice(0, 500) }), {
        status: resp.status === 429 || resp.status === 402 ? resp.status : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : null;
    const candidates = parsed?.candidates ?? [];
    const winnerIdx = Math.max(0, Math.min(candidates.length - 1, parsed?.winner_index ?? 0));
    const winner = candidates[winnerIdx] ?? { text: product_name, type: "curiosity", strength: 50 };

    // Persist to job if job_id provided
    if (job_id) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      await supabase
        .from("cinematic_ad_jobs")
        .update({
          hook_text: winner.text,
          hook_type: winner.type,
          hook_strength_score: winner.strength,
        })
        .eq("id", job_id);
    }

    return new Response(JSON.stringify({
      ok: true,
      traceId: crypto.randomUUID(),
      hook_text: winner.text,
      hook_type: winner.type,
      hook_strength: winner.strength,
      candidates,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("hook-generator error", e);
    return new Response(JSON.stringify({ ok: false, message: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});