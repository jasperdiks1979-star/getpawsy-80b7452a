import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateSEORequest {
  productName: string;
  productDescription: string;
  category: string;
  price: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productName, productDescription, category, price }: GenerateSEORequest = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Je bent een expert e-commerce SEO copywriter voor een Nederlandse dierenwinkel genaamd GetPawsy. 
Je schrijft overtuigende, emotionele verkoopteksten die converteren. 
Gebruik Nederlandse taal. Focus op voordelen voor huisdier en eigenaar.
Schrijf professioneel maar warm en persoonlijk.`;

    const userPrompt = `Genereer SEO content voor dit bestseller product:

Product: ${productName}
Categorie: ${category}
Prijs: €${price}
Beschrijving: ${productDescription || 'Geen beschrijving beschikbaar'}

Genereer de volgende content in JSON format:
{
  "seo_title": "SEO titel (max 60 karakters, inclusief GetPawsy)",
  "seo_description": "Meta description (max 155 karakters, met call-to-action)",
  "hero_headline": "Pakkende kop voor de productpagina (emotioneel, max 80 karakters)",
  "hero_subheadline": "Ondersteunende tekst (max 120 karakters)",
  "selling_points": [
    {"icon": "heart", "title": "Voordeel 1", "description": "Korte uitleg"},
    {"icon": "shield", "title": "Voordeel 2", "description": "Korte uitleg"},
    {"icon": "star", "title": "Voordeel 3", "description": "Korte uitleg"},
    {"icon": "truck", "title": "Voordeel 4", "description": "Korte uitleg"}
  ],
  "long_description": "Uitgebreide productbeschrijving (300-400 woorden, overtuigend, emotioneel, SEO-geoptimaliseerd met relevante zoekwoorden)",
  "meta_keywords": ["zoekwoord1", "zoekwoord2", "zoekwoord3", "zoekwoord4", "zoekwoord5"]
}

Zorg dat de content:
- Emotie oproept (liefde voor huisdieren)
- Voordelen benadrukt boven features
- Urgentie creëert zonder pushy te zijn
- Vertrouwen opbouwt
- SEO-geoptimaliseerd is voor Nederlandse zoekopdrachten`;

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
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit bereikt, probeer het later opnieuw." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Geen credits meer, voeg credits toe aan je workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content received from AI");
    }

    // Parse JSON from response (handle markdown code blocks)
    let seoContent;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      seoContent = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse SEO content from AI response");
    }

    return new Response(JSON.stringify(seoContent), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error generating SEO content:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
