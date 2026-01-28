import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CompetitorProduct {
  id: string;
  competitor: string;
  product_name: string;
  price: number | null;
  current_rank: number;
  previous_rank: number | null;
  rank_change: number | null;
  trend: string;
  product_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch competitor products from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: products, error: productsError } = await supabase
      .from("competitor_products")
      .select("*")
      .gte("last_seen_at", sevenDaysAgo.toISOString())
      .order("competitor")
      .order("current_rank");

    if (productsError) throw productsError;

    // Group products by competitor
    const byCompetitor: Record<string, CompetitorProduct[]> = {};
    (products || []).forEach((p: CompetitorProduct) => {
      if (!byCompetitor[p.competitor]) {
        byCompetitor[p.competitor] = [];
      }
      byCompetitor[p.competitor].push(p);
    });

    // Calculate statistics
    const competitorStats = Object.entries(byCompetitor).map(([competitor, prods]) => {
      const withPrice = prods.filter(p => p.price !== null);
      const avgPrice = withPrice.length > 0 
        ? withPrice.reduce((sum, p) => sum + (p.price || 0), 0) / withPrice.length 
        : null;
      const minPrice = withPrice.length > 0 ? Math.min(...withPrice.map(p => p.price!)) : null;
      const maxPrice = withPrice.length > 0 ? Math.max(...withPrice.map(p => p.price!)) : null;
      
      const risingProducts = prods.filter(p => p.trend === "rising" || (p.rank_change && p.rank_change > 0));
      const newProducts = prods.filter(p => p.trend === "new");
      const topProducts = prods.filter(p => p.current_rank <= 10);

      return {
        competitor,
        totalProducts: prods.length,
        avgPrice: avgPrice ? `$${avgPrice.toFixed(2)}` : "Unknown",
        priceRange: minPrice && maxPrice ? `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}` : "Unknown",
        risingCount: risingProducts.length,
        newCount: newProducts.length,
        topProducts: topProducts.slice(0, 5).map(p => ({
          name: p.product_name.substring(0, 80),
          rank: p.current_rank,
          price: p.price ? `$${p.price.toFixed(2)}` : "N/A",
          trend: p.trend
        }))
      };
    });

    // Find trending products across all competitors
    const allRising = (products || [])
      .filter((p: CompetitorProduct) => p.trend === "rising" || (p.rank_change && p.rank_change >= 3))
      .slice(0, 10);

    // Find new entries in top 10
    const newTopEntries = (products || [])
      .filter((p: CompetitorProduct) => p.trend === "new" && p.current_rank <= 10)
      .slice(0, 5);

    // Build the prompt for AI analysis
    const analysisPrompt = `
Je bent een e-commerce strategist die competitor bestsellers analyseert voor een pet supplies webshop.

Analyseer de volgende data en geef actionable insights in het Nederlands:

## Competitor Statistieken:
${JSON.stringify(competitorStats, null, 2)}

## Stijgende Producten (trending):
${JSON.stringify(allRising.map((p: CompetitorProduct) => ({
  name: p.product_name.substring(0, 80),
  competitor: p.competitor,
  rank: p.current_rank,
  change: p.rank_change,
  price: p.price
})), null, 2)}

## Nieuwe Top 10 Entries:
${JSON.stringify(newTopEntries.map((p: CompetitorProduct) => ({
  name: p.product_name.substring(0, 80),
  competitor: p.competitor,
  rank: p.current_rank
})), null, 2)}

Geef je analyse in het volgende JSON format:
{
  "title": "Wekelijkse Competitor Analyse - [Datum]",
  "summary": "Korte samenvatting van 2-3 zinnen over de belangrijkste bevindingen",
  "insights": [
    {
      "category": "pricing|trends|opportunities|threats",
      "title": "Korte insight titel",
      "description": "Gedetailleerde beschrijving van de insight",
      "priority": "high|medium|low"
    }
  ],
  "pricing_analysis": {
    "summary": "Analyse van prijsstrategieën per competitor",
    "recommendations": ["Aanbeveling 1", "Aanbeveling 2"]
  },
  "product_trends": {
    "rising_categories": ["Categorie 1", "Categorie 2"],
    "declining_categories": [],
    "opportunities": ["Kans 1", "Kans 2"]
  },
  "recommendations": [
    {
      "action": "Concrete actie om te ondernemen",
      "impact": "high|medium|low",
      "effort": "high|medium|low",
      "reasoning": "Waarom deze actie belangrijk is"
    }
  ],
  "alerts": [
    {
      "type": "price_drop|new_bestseller|rising_product|competitor_trend",
      "competitor": "competitor name",
      "product_name": "product name if applicable",
      "title": "Alert titel",
      "description": "Beschrijving van de alert",
      "severity": "info|warning|urgent"
    }
  ]
}

Focus op:
1. Prijsverschillen tussen competitors en wat we daarvan kunnen leren
2. Welke productcategorieën trending zijn
3. Nieuwe bestsellers die we mogelijk zelf kunnen sourcen
4. Tactische aanbevelingen om onze eigen verkoop te verbeteren
`;

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Je bent een data analyst voor e-commerce. Geef altijd valid JSON terug zonder markdown codeblocks." },
          { role: "user", content: analysisPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";

    // Parse the JSON response
    let analysis;
    try {
      // Remove markdown code blocks if present
      const cleanedContent = aiContent.replace(/```json\n?|\n?```/g, "").trim();
      analysis = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", aiContent);
      throw new Error("Failed to parse AI analysis response");
    }

    // Store the report in the database
    const { data: report, error: reportError } = await supabase
      .from("competitor_analysis_reports")
      .insert({
        report_type: "weekly",
        title: analysis.title || `Wekelijkse Competitor Analyse - ${new Date().toLocaleDateString("nl-NL")}`,
        summary: analysis.summary || "Analyse van competitor bestsellers",
        insights: analysis.insights || [],
        pricing_analysis: analysis.pricing_analysis || null,
        product_trends: analysis.product_trends || null,
        recommendations: analysis.recommendations || [],
        competitors_analyzed: Object.keys(byCompetitor),
        products_analyzed: products?.length || 0,
      })
      .select()
      .single();

    if (reportError) {
      console.error("Error storing report:", reportError);
    }

    // Store alerts if any
    if (analysis.alerts && analysis.alerts.length > 0) {
      const alertsToInsert = analysis.alerts.map((alert: any) => ({
        alert_type: alert.type,
        competitor: alert.competitor,
        product_name: alert.product_name || null,
        title: alert.title,
        description: alert.description,
        severity: alert.severity || "info",
        data: { source: "ai_analysis", report_id: report?.id }
      }));

      const { error: alertsError } = await supabase
        .from("competitor_alerts")
        .insert(alertsToInsert);

      if (alertsError) {
        console.error("Error storing alerts:", alertsError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        report: report,
        analysis: analysis,
        stats: {
          competitorsAnalyzed: Object.keys(byCompetitor).length,
          productsAnalyzed: products?.length || 0,
          alertsGenerated: analysis.alerts?.length || 0
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-competitors:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
