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

interface OwnProduct {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  price: number;
}

// Calculate similarity between two strings (Jaccard similarity on words)
function calculateSimilarity(str1: string, str2: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const words1 = new Set(normalize(str1));
  const words2 = new Set(normalize(str2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

// Calculate bestseller score: popularity (appears at multiple competitors) + trending momentum
function calculateBestsellerScore(
  productName: string, 
  allProducts: CompetitorProduct[]
): { score: number; competitorCount: number; avgRank: number; trendBoost: number } {
  const matchingProducts = allProducts.filter(p => 
    calculateSimilarity(p.product_name, productName) > 0.4
  );
  
  // Count unique competitors
  const competitors = new Set(matchingProducts.map(p => p.competitor));
  const competitorCount = competitors.size;
  
  // Calculate average rank (lower is better)
  const avgRank = matchingProducts.length > 0 
    ? matchingProducts.reduce((sum, p) => sum + p.current_rank, 0) / matchingProducts.length 
    : 100;
  
  // Calculate trend boost (rising products get bonus)
  const trendBoost = matchingProducts.reduce((boost, p) => {
    if (p.trend === 'rising' || (p.rank_change && p.rank_change > 0)) {
      return boost + (p.rank_change || 3);
    }
    if (p.trend === 'new') {
      return boost + 5; // New entries get extra boost
    }
    return boost;
  }, 0);
  
  // Combined score: higher is better
  // - Popularity: competitorCount * 20 (max ~100 for 5 competitors)
  // - Rank: (26 - avgRank) * 2 (max 50 for rank 1)
  // - Trending: trendBoost * 3 (variable bonus)
  const score = (competitorCount * 20) + Math.max(0, (26 - avgRank) * 2) + (trendBoost * 3);
  
  return { score, competitorCount, avgRank, trendBoost };
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

    // Fetch our own products for matching
    const { data: ownProducts, error: ownProductsError } = await supabase
      .from("products")
      .select("id, name, slug, category, price")
      .eq("is_active", true);

    if (ownProductsError) throw ownProductsError;

    // ============ AUTO-UPDATE BESTSELLERS ============
    console.log("Starting bestseller auto-sync...");
    
    // Calculate scores for all unique competitor products
    const uniqueProductNames = [...new Set((products || []).map(p => p.product_name))];
    const scoredProducts = uniqueProductNames.map(name => {
      const scores = calculateBestsellerScore(name, products || []);
      const representativeProduct = (products || []).find(p => p.product_name === name)!;
      return {
        name,
        ...scores,
        representativeProduct
      };
    });

    // Sort by score and take top 25
    const top25Competitors = scoredProducts
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);

    console.log(`Top 25 competitor products identified:`, top25Competitors.slice(0, 5).map(p => ({
      name: p.name.substring(0, 50),
      score: p.score,
      competitors: p.competitorCount
    })));

    // Match to our own products
    const matchedBestsellers: Array<{
      ownProduct: OwnProduct;
      competitorName: string;
      score: number;
      rank: number;
    }> = [];

    for (let i = 0; i < top25Competitors.length; i++) {
      const compProduct = top25Competitors[i];
      let bestMatch: OwnProduct | null = null;
      let bestSimilarity = 0;

      for (const ownProduct of (ownProducts || [])) {
        const similarity = calculateSimilarity(compProduct.name, ownProduct.name);
        if (similarity > bestSimilarity && similarity > 0.3) {
          bestSimilarity = similarity;
          bestMatch = ownProduct;
        }
      }

      if (bestMatch && !matchedBestsellers.find(m => m.ownProduct.id === bestMatch!.id)) {
        matchedBestsellers.push({
          ownProduct: bestMatch,
          competitorName: compProduct.name,
          score: compProduct.score,
          rank: matchedBestsellers.length + 1
        });
      }
    }

    console.log(`Matched ${matchedBestsellers.length} products to own catalog`);

    // Update bestsellers table if we have matches
    if (matchedBestsellers.length > 0) {
      // First, deactivate auto-generated bestsellers (keep manual ones)
      await supabase
        .from("bestsellers")
        .update({ is_active: false })
        .eq("is_manual", false);

      // Upsert matched products as bestsellers
      for (const match of matchedBestsellers) {
        const slug = match.ownProduct.slug || match.ownProduct.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        const { error: upsertError } = await supabase
          .from("bestsellers")
          .upsert({
            product_id: match.ownProduct.id,
            rank: match.rank,
            slug: slug,
            is_active: true,
            is_manual: false,
            hero_headline: `Trending: ${match.ownProduct.name}`,
            hero_subheadline: `Popular across ${Math.min(5, Math.ceil(match.score / 20))} major retailers`,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'product_id',
            ignoreDuplicates: false
          });

        if (upsertError) {
          console.error(`Error upserting bestseller for ${match.ownProduct.name}:`, upsertError);
        }
      }

      console.log(`Updated ${matchedBestsellers.length} bestsellers in database`);
    }

    // ============ AI ANALYSIS ============
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

## Auto-Matched Bestsellers (${matchedBestsellers.length} products matched to our catalog):
${JSON.stringify(matchedBestsellers.slice(0, 10).map(m => ({
  ourProduct: m.ownProduct.name.substring(0, 50),
  matchedTo: m.competitorName.substring(0, 50),
  score: m.score,
  rank: m.rank
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

    // Call Lovable AI with max_tokens to prevent truncation
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Je bent een data analyst voor e-commerce. Geef ALTIJD complete, valid JSON terug zonder markdown codeblocks. Houd je response beknopt maar compleet." },
          { role: "user", content: analysisPrompt }
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    const finishReason = aiData.choices?.[0]?.finish_reason;

    console.log("AI finish reason:", finishReason);
    console.log("AI content length:", aiContent.length);

    // Parse the JSON response with robust error handling
    let analysis;
    try {
      let cleanedContent = aiContent.replace(/```json\n?|\n?```/g, "").trim();
      
      if (finishReason === "length" || !cleanedContent.endsWith("}")) {
        console.warn("AI response may be truncated, attempting to fix JSON...");
        const lastBrace = cleanedContent.lastIndexOf("}");
        if (lastBrace > 0) {
          let braceCount = 0;
          let lastValidIndex = 0;
          for (let i = 0; i < cleanedContent.length; i++) {
            if (cleanedContent[i] === "{") braceCount++;
            if (cleanedContent[i] === "}") {
              braceCount--;
              if (braceCount === 0) lastValidIndex = i + 1;
            }
          }
          if (lastValidIndex > 0) {
            cleanedContent = cleanedContent.substring(0, lastValidIndex);
          }
        }
      }
      
      analysis = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", aiContent.substring(0, 500) + "...");
      analysis = {
        title: `Competitor Analyse - ${new Date().toLocaleDateString("nl-NL")}`,
        summary: "AI-analyse kon niet volledig worden geparsed. Controleer de data handmatig.",
        insights: [{
          category: "trends",
          title: "Analyse Error",
          description: "De AI-response kon niet worden geparsed. Dit kan komen door een tijdelijke API-fout.",
          priority: "medium"
        }],
        pricing_analysis: null,
        product_trends: { rising_categories: [], declining_categories: [], opportunities: [] },
        recommendations: [],
        alerts: []
      };
      console.warn("Using fallback analysis structure");
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
          alertsGenerated: analysis.alerts?.length || 0,
          bestsellersUpdated: matchedBestsellers.length
        },
        bestsellersSync: {
          matched: matchedBestsellers.length,
          top5: matchedBestsellers.slice(0, 5).map(m => ({
            product: m.ownProduct.name,
            rank: m.rank,
            score: m.score
          }))
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
