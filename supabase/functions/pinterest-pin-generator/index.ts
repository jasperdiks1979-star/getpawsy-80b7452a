import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { productId, productSlug } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch product
    let query = sb.from("products").select("id, name, slug, description, price, category, image_url");
    if (productId) query = query.eq("id", productId);
    else if (productSlug) query = query.eq("slug", productSlug);
    else throw new Error("productId or productSlug required");

    const { data: product, error } = await query.single();
    if (error || !product) throw new Error("Product not found");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const BASE_URL = "https://getpawsy.pet";
    const productUrl = `${BASE_URL}/product/${product.slug}`;

    const systemPrompt = `You are a Pinterest marketing expert for GetPawsy.pet, a US-based pet supply e-commerce store. You create high-CTR Pinterest pins that drive traffic and conversions.

STRICT RULES:
- Write for US pet parents
- NEVER include URLs inside pin descriptions
- NEVER use spammy wording, fake reviews, or misleading claims
- Keep language natural and persuasive
- Focus on: time saving, convenience, problem solving, emotional benefit
- Use ✔ format for bullet benefits
- Each pin MUST use a DIFFERENT angle/hook

HOOK ANGLES (use a different one for each pin):
1. Problem → Solution
2. Curiosity ("This changed everything…")
3. Lifestyle upgrade
4. Time-saving
5. Multi-pet / specific use case

OUTPUT: Return valid JSON matching this exact structure:
{
  "productUrl": "string",
  "primaryKeyword": "string",
  "longTailKeywords": ["5 long-tail keyword variations"],
  "pinterestPhrases": ["5 Pinterest-friendly search phrases"],
  "pins": [
    {
      "pinNumber": 1,
      "hookAngle": "string (which angle used)",
      "title": "string (max 100 chars, high-CTR, keyword-rich)",
      "description": "string (200-400 chars: Hook → Solution → ✔ Benefits → CTA → #hashtags)",
      "imagePrompt": "string (vertical 2:3 Pinterest style, clean product focus, emotional trigger, soft lighting, high contrast, include overlay text suggestion)",
      "suggestedOverlayText": "string (big bold headline for pin image)",
      "bestPostingTime": "string (morning/afternoon/evening US time)"
    }
  ],
  "postingSchedule": {
    "pin1": "string (e.g. '9:00 AM EST - Morning scroll')",
    "pin2": "string",
    "pin3": "string"
  },
  "suggestedBoards": ["3-5 board name suggestions"]
}`;

    const userPrompt = `Generate 3 unique Pinterest pins for this product:

Product Name: ${product.name}
Category: ${product.category || "Pet Products"}
Price: $${product.price}
Description: ${product.description || "No description"}
Product URL: ${productUrl}

Requirements:
- 3 pins, each with a DIFFERENT hook angle
- Titles max 100 chars, keyword-rich, high-CTR
- Descriptions 200-400 chars following: Hook → Solution → ✔ Benefits → CTA → 3-5 hashtags
- Image prompts for vertical 2:3 Pinterest format
- Extract primary keyword from the product name/slug
- Generate 5 long-tail keyword variations
- Include posting schedule (morning/afternoon/evening US time)
- Suggest Pinterest board names
- Occasionally include soft brand mention like "Browse more smart pet products on GetPawsy"`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await response.json();
    const raw = aiData.choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse AI response");

    const parsed = JSON.parse(jsonMatch[0]);

    // Store in database
    await sb.from("pinterest_pins").upsert({
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      product_url: productUrl,
      pin_data: parsed,
      generated_at: new Date().toISOString(),
    }, { onConflict: "product_id" });

    return new Response(JSON.stringify({ ok: true, data: parsed }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pinterest-pin-generator error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});
