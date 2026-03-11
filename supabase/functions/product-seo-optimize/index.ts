import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { productName, category, description, features, slug } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a senior pet product SEO specialist writing for GetPawsy.pet, a US-based pet supply ecommerce store.

STRICT RULES:
- Write for US pet parents. Use American English.
- NEVER make veterinary or medical claims.
- No fluff or generic filler. Every sentence must add value.
- Write in an experienced, practical tone.
- Use keywords naturally — no keyword stuffing.
- Internal links use markdown format: [anchor text](/path/)
- No external links.

OUTPUT FORMAT: Return valid JSON matching this exact structure:
{
  "seoTitle": "string (under 60 chars, format: Primary Keyword – Benefit + Trigger (2026))",
  "metaDescription": "string (150-160 chars, benefit-driven, include shipping mention)",
  "extendedContent": {
    "whyPetsNeed": "string (100-150 words, H2 section about why pets need this product)",
    "keyBenefits": "string (100-150 words, H2 section listing key benefits)",
    "howToChoose": "string (80-120 words, H2 section on choosing the right version)",
    "featuresExplained": "string (80-120 words, H2 section explaining product features)"
  },
  "faq": [
    { "question": "string", "answer": "string (30-60 words)" }
  ],
  "keywords": ["string (5-8 relevant SEO keywords)"],
  "internalLinks": {
    "guides": [
      { "slug": "string (guide slug)", "anchor": "string (natural anchor text)" }
    ],
    "collection": { "slug": "string", "anchor": "string" },
    "relatedProducts": ["string (related product type descriptions)"]
  }
}

REQUIREMENTS:
- seoTitle must contain the primary keyword and a compelling benefit
- metaDescription must be exactly 150-160 characters
- Generate exactly 5 FAQ items relevant to buyer questions
- Suggest 2 guide links and 1 collection link based on category
- Keywords should include long-tail variations
- Content must be unique and not duplicated across products`;

    const userPrompt = `Optimize this product for SEO:

Product Name: ${productName}
Category: ${category || "General Pet Products"}
Current Description: ${description || "No description provided"}
Features: ${features ? JSON.stringify(features) : "Not specified"}
Slug: ${slug}

Generate SEO-optimized title, meta description, extended content sections, FAQ, keywords, and internal link suggestions.`;

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
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const raw = aiData.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({ ok: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("product-seo-optimize error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
