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
    const { productName, category, currentDescription, language = "nl" } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const languageInstructions = language === "nl" 
      ? "Schrijf in het Nederlands. Gebruik een vriendelijke, professionele toon die past bij een moderne webshop."
      : "Write in English. Use a friendly, professional tone suitable for a modern webshop.";

    const systemPrompt = `Je bent een expert SEO copywriter voor e-commerce. Je schrijft overtuigende, SEO-geoptimaliseerde productbeschrijvingen die:

1. De aandacht trekken met een pakkende openingszin
2. Belangrijke productkenmerken en voordelen benadrukken
3. Relevante zoekwoorden natuurlijk verwerken
4. Emotionele triggers gebruiken die aanzetten tot aankoop
5. Duidelijke, scanbare tekst met korte alinea's
6. Eindig met een subtiele call-to-action

${languageInstructions}

Houd de beschrijving tussen 150-250 woorden. Gebruik geen onnodige vulwoorden of overdreven marketingtaal.`;

    const userPrompt = `Schrijf een SEO-geoptimaliseerde productbeschrijving voor:

Product: ${productName}
Categorie: ${category || "Algemeen"}
${currentDescription ? `Huidige beschrijving (ter referentie): ${currentDescription}` : ""}

Genereer een nieuwe, unieke en overtuigende productbeschrijving.`;

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
          JSON.stringify({ error: "Te veel verzoeken, probeer het later opnieuw." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Geen credits meer beschikbaar. Voeg credits toe aan je workspace." }),
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
