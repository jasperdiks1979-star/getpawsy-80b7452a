import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  try {
    const { query, slug, h1, h2s, faqs, internalLinkTargets, cluster } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a senior pet care content strategist writing for GetPawsy.pet, an online pet supply e-commerce store serving customers in the United States.

STRICT RULES:
- Write for US pet parents. Use American English.
- NEVER make veterinary or medical claims.
- No fluff, no generic filler. Every sentence must be useful.
- Write in experienced, practical tone. You've tested these products.
- Target 2,000-2,500 words total across all sections.
- Include specific details: measurements, weights, materials, prices.
- Internal links use markdown format: [anchor text](/guides/slug/)
- No external links.

OUTPUT FORMAT: Return valid JSON matching this exact structure:
{
  "slug": "string",
  "title": "string (H1, include year 2026)",
  "excerpt": "string (150 chars max, compelling)",
  "quickAnswer": "string (40-60 words, featured snippet optimized)",
  "category": "string",
  "keywords": ["5-7 keywords"],
  "publishedAt": "2026-02-11",
  "updatedAt": "2026-02-11",
  "featuredImage": "/images/guides/placeholder.jpg",
  "readingTime": number,
  "relatedCategories": ["category-slug"],
  "whoThisIsFor": ["3-4 bullet points"],
  "sections": [
    { "heading": "H2 title", "content": "300-500 word section with bold text, lists, internal links" }
  ],
  "comparisonProducts": [
    {
      "name": "Product Name",
      "price": "$XX.XX",
      "description": "One sentence",
      "advantages": ["3 advantages"],
      "link": "/products?category=relevant-category",
      "badge": "Best Overall|Budget Pick|Premium",
      "availability": "InStock"
    }
  ],
  "buyingCriteria": {
    "title": "What to Look For",
    "criteria": [{ "name": "Criterion", "description": "Why it matters" }]
  },
  "prosAndCons": {
    "pros": ["4-5 pros"],
    "cons": ["3-4 cons"]
  },
  "commonMistakes": [
    { "mistake": "Mistake title", "whyItMatters": "Explanation" }
  ],
  "faq": [
    { "question": "FAQ question", "answer": "2-3 sentence answer" }
  ]
}`;

    const clusterMap: Record<string, string> = {
      'cat-litter': 'Cat Litter',
      'cat-furniture': 'Cat Furniture',
      'dog-beds': 'Dog Beds',
      'micro-intent': 'Pet Care',
    };

    const category = clusterMap[cluster] || 'Pet Care';

    const userPrompt = `Generate a comprehensive SEO guide for the query: "${query}"

Slug: ${slug}
H1: ${h1}

Required H2 sections (expand each to 300-500 words):
${h2s.map((h: string, i: number) => `${i + 1}. ${h}`).join('\n')}

Required FAQ questions (write 2-3 sentence answers):
${faqs.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')}

Category: ${category}

Internal links to include naturally in content:
${internalLinkTargets.map((t: string) => `- [relevant anchor](/guides/${t}/)`).join('\n')}

Also link to the cluster cornerstone and hub pages where relevant.

Remember: 2,000-2,500 words total. Practical, tested tone. No medical claims. US audience.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again in a few minutes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Top up in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "";

    // Extract JSON from response (may be wrapped in markdown code blocks)
    let guideJson: any;
    try {
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
      guideJson = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("Failed to parse AI response as JSON:", rawContent.slice(0, 500));
      throw new Error("AI returned invalid JSON. Retry the generation.");
    }

    // Ensure required fields
    guideJson.slug = slug;
    guideJson.publishedAt = new Date().toISOString().split('T')[0];
    guideJson.updatedAt = guideJson.publishedAt;
    if (!guideJson.readingTime) guideJson.readingTime = 12;
    if (!guideJson.featuredImage) guideJson.featuredImage = "/images/guides/placeholder.jpg";

    return new Response(JSON.stringify({ success: true, guide: guideJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-gap-guide error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
