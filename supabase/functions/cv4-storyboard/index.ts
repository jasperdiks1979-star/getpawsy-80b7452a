// Cinematic V4: Storyboard builder.
// Generates a 5-beat (problem → solution → benefit → lifestyle → cta) plan
// for a product slug. Captions are clamped to ≤6 words and Pinterest safe-zone
// friendly. Persists to public.cinematic_v4_storyboards.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const BEAT_ORDER = ["problem", "solution", "benefit", "lifestyle", "cta"] as const;
type Beat = typeof BEAT_ORDER[number];

const IMAGE_ROLE_BY_BEAT: Record<Beat, string> = {
  problem: "product_callout",
  solution: "feature_zoom",
  benefit: "benefit_card",
  lifestyle: "lifestyle",
  cta: "cta_card",
};

const MOTION_BY_BEAT: Record<Beat, string> = {
  problem: "push_in",
  solution: "pan_right",
  benefit: "parallax",
  lifestyle: "pull_out",
  cta: "pan_left",
};

function clampToFiveWords(s: string): string {
  const words = String(s || "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(" ");
}

function fallbackBeats(productName: string) {
  const name = productName || "this product";
  return [
    { beat: "problem",   caption: clampToFiveWords(`Tired of daily mess?`) },
    { beat: "solution",  caption: clampToFiveWords(`Meet ${name}`) },
    { beat: "benefit",   caption: clampToFiveWords(`Cleaner home, calmer pet`) },
    { beat: "lifestyle", caption: clampToFiveWords(`Loved in real homes`) },
    { beat: "cta",       caption: clampToFiveWords(`Shop now at GetPawsy`) },
  ];
}

async function generateBeatsWithAi(product: any): Promise<Array<{ beat: Beat; caption: string }>> {
  const sys = `You write Pinterest video captions. Exactly 5 beats in this order: problem, solution, benefit, lifestyle, cta. STRICT: each caption is at most 5 words AND at most 32 characters. No emoji. No hashtags. No quotes. No exclamation marks. US English. Return JSON.`;
  const usr = `Product: ${product.name}\nCategory: ${product.category}\nPrimary benefit: ${product.benefit_angle || product.primary_keyword || ""}\n\nRespond as JSON: {"beats":[{"beat":"problem","caption":"..."},{"beat":"solution","caption":"..."},{"beat":"benefit","caption":"..."},{"beat":"lifestyle","caption":"..."},{"beat":"cta","caption":"..."}]}`;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`ai ${res.status}`);
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    const raw: any[] = Array.isArray(parsed?.beats) ? parsed.beats : [];
    const byBeat = new Map<Beat, string>();
    for (const r of raw) {
      const b = String(r?.beat || "").toLowerCase().trim() as Beat;
      if (BEAT_ORDER.includes(b)) byBeat.set(b, clampToFiveWords(String(r?.caption || "")));
    }
    const out: Array<{ beat: Beat; caption: string }> = [];
    const fb = fallbackBeats(product.name);
    for (let i = 0; i < BEAT_ORDER.length; i++) {
      const b = BEAT_ORDER[i];
      out.push({ beat: b, caption: byBeat.get(b) || fb[i].caption });
    }
    return out;
  } catch (e) {
    console.error("[cv4-storyboard] ai error", e);
    return fallbackBeats(product.name).map((b) => ({ beat: b.beat as Beat, caption: b.caption }));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { product_slug } = await req.json();
    if (!product_slug) {
      return new Response(JSON.stringify({ ok: false, code: "MISSING_SLUG", traceId: trace_id }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: product } = await sb.from("products")
      .select("id, slug, name, category, benefit_angle, primary_keyword")
      .eq("slug", product_slug).maybeSingle();
    if (!product) {
      return new Response(JSON.stringify({ ok: false, code: "PRODUCT_NOT_FOUND", traceId: trace_id }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const beats = await generateBeatsWithAi(product);
    const enriched = beats.map((b, idx) => ({
      index: idx,
      beat: b.beat,
      caption: b.caption,
      word_count: b.caption.split(/\s+/).filter(Boolean).length,
      duration_frames: [42, 54, 60, 66, 48][idx],
      image_role: IMAGE_ROLE_BY_BEAT[b.beat as Beat],
      motion: MOTION_BY_BEAT[b.beat as Beat],
      transition: ["fade", "slide-left", "wipe-down", "fade", "slide-up"][idx],
    }));

    const { data: row, error } = await sb.from("cinematic_v4_storyboards").insert({
      product_slug,
      product_id: product.id,
      beats: enriched,
      scene_assets: [],
      hook_archetype: enriched[0]?.caption?.toLowerCase().includes("tired") ? "relatable_pain" : "curiosity",
      status: "pending",
      scene_count: enriched.length,
      trace_id,
    }).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, traceId: trace_id, storyboard_id: row.id, beats: enriched }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cv4-storyboard]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});