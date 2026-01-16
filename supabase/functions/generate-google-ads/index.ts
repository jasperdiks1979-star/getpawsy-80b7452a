import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productName, productDescription, targetAudience, language = 'nl' } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Generating Google Ads for product: ${productName}`);

    const systemPrompt = `You are an expert Google Ads copywriter. Generate compelling, high-converting Google Ads copy in ${language === 'nl' ? 'Dutch' : 'English'}.

For each ad, provide:
1. Headlines (max 30 characters each, provide 3 variations)
2. Descriptions (max 90 characters each, provide 2 variations)
3. Display path suggestions (2 path segments, max 15 chars each)

Focus on:
- Clear value propositions
- Strong calls-to-action
- Emotional triggers
- Urgency when appropriate
- Keywords that match search intent

Return the response as valid JSON with this structure:
{
  "headlines": ["headline1", "headline2", "headline3"],
  "descriptions": ["description1", "description2"],
  "displayPaths": ["path1", "path2"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`;

    const userPrompt = `Generate Google Ads for:
Product: ${productName}
Description: ${productDescription || 'Not provided'}
Target Audience: ${targetAudience || 'General consumers'}

Create compelling ad copy that will drive clicks and conversions.`;

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
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to continue." }), {
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
      throw new Error("No content in AI response");
    }

    console.log("Raw AI response:", content);

    // Parse the JSON from the response
    let adData;
    try {
      // Try to extract JSON from the response (might be wrapped in markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        adData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      // Return raw content if JSON parsing fails
      return new Response(JSON.stringify({ 
        error: "Failed to parse ad content",
        rawContent: content 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Successfully generated ads:", adData);

    return new Response(JSON.stringify(adData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-google-ads:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
