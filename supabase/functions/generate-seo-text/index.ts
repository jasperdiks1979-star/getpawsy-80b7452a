import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productName, category, currentDescription } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert SEO copywriter for e-commerce, specializing in the American market. You write compelling, SEO-optimized product descriptions that:

1. Hook readers with an attention-grabbing opening line
2. Highlight key product features and benefits
3. Naturally incorporate relevant keywords for US search engines
4. Use emotional triggers that encourage purchases
5. Create clear, scannable text with short paragraphs
6. End with a subtle call-to-action

Write in American English. Use a friendly, professional tone suitable for a modern US-based online store. Consider American consumer preferences and shopping habits.

Keep the description between 150-250 words. Avoid unnecessary filler words or overly salesy marketing language.`;

    const userPrompt = `Write an SEO-optimized product description for:

Product: ${productName}
Category: ${category || "General"}
${currentDescription ? `Current description (for reference): ${currentDescription}` : ""}

Generate a new, unique, and compelling product description for the American market.`;

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
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Too many requests, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Out of credits. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ description: generatedText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-seo-text:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
