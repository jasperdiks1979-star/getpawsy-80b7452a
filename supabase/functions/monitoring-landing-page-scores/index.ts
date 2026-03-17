 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 interface ScoreComponents {
   category_integrity: number;
   product_availability: number;
   bestseller_health: number;
   add_to_cart_stability: number;
   checkout_reachability: number;
   conversion_trend: number;
   mobile_performance: number;
 }
 
 interface LandingPageScore {
   url_path: string;
   page_type: string;
   campaign_id?: string;
   components: ScoreComponents;
   overall_score: number;
   health_status: "healthy" | "at_risk" | "critical";
   breakdown: Record<string, any>;
 }
 
 // Weight distribution for overall score calculation
 const WEIGHTS = {
   category_integrity: 0.15,
   product_availability: 0.20,
   bestseller_health: 0.10,
   add_to_cart_stability: 0.20,
   checkout_reachability: 0.20,
   conversion_trend: 0.10,
   mobile_performance: 0.05,
 };
 
 function calculateOverallScore(components: ScoreComponents): number {
   let weightedSum = 0;
   for (const [key, weight] of Object.entries(WEIGHTS)) {
     weightedSum += (components[key as keyof ScoreComponents] || 100) * weight;
   }
   return Math.round(weightedSum);
 }
 
 function getHealthStatus(score: number): "healthy" | "at_risk" | "critical" {
   if (score >= 85) return "healthy";
   if (score >= 70) return "at_risk";
   return "critical";
 }
 
 serve(async (req: Request): Promise<Response> => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   const supabase = createClient(
     Deno.env.get("SUPABASE_URL") ?? "",
     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
   );
 
   try {
     const now = new Date();
     const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
     const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
 
     // Get all active ad landing pages
     const { data: landingPages } = await supabase
       .from("monitoring_ad_landing_pages")
       .select("*")
       .eq("is_active", true);
 
     // Get category data for integrity checks
     const { data: categories } = await supabase
       .from("categories")
       .select("id, name, slug, parent_id");
 
     const { data: productCategories } = await supabase
       .from("product_categories")
       .select("category_id, product_id");
 
     const { data: activeProducts } = await supabase
       .from("products")
       .select("id, is_active")
       .eq("is_active", true);
 
     // Get bestsellers for health check
     const { data: bestsellers } = await supabase
       .from("bestsellers")
       .select("id, slug, product_id, is_active")
       .eq("is_active", true);
 
     const { data: allProducts } = await supabase
       .from("products")
       .select("id, is_active");
 
     // Get recent frontend errors
     const { data: recentErrors } = await supabase
       .from("frontend_error_logs")
       .select("*")
       .gte("created_at", sixHoursAgo.toISOString());
 
     // Get performance metrics
     const { data: perfMetrics } = await supabase
       .from("performance_metrics")
       .select("*")
       .eq("metric_name", "LCP")
       .gte("created_at", twentyFourHoursAgo.toISOString());
 
     // Get visitor activity for conversion trends
     const { data: visitorActivity } = await supabase
       .from("visitor_activity")
       .select("activity_type, page_path")
       .gte("created_at", twentyFourHoursAgo.toISOString());
 
     // Get previous scores for delta calculation
     const { data: previousScores } = await supabase
       .from("monitoring_landing_page_scores")
       .select("url_path, overall_score");
 
     const prevScoreMap = new Map(previousScores?.map(s => [s.url_path, s.overall_score]) || []);
 
     // Build category product counts
     const activeProductIds = new Set(activeProducts?.map(p => p.id) || []);
     const categoryProductCount: Record<string, number> = {};
     const categoryChildren: Record<string, string[]> = {};
 
     categories?.forEach(cat => {
       categoryProductCount[cat.id] = 0;
       categoryChildren[cat.id] = [];
     });
 
     categories?.forEach(cat => {
       if (cat.parent_id && categoryChildren[cat.parent_id]) {
         categoryChildren[cat.parent_id].push(cat.id);
       }
     });
 
     productCategories?.forEach(pc => {
       if (activeProductIds.has(pc.product_id) && categoryProductCount[pc.category_id] !== undefined) {
         categoryProductCount[pc.category_id]++;
       }
     });
 
     // Check bestseller health
     const productActiveMap = new Map(allProducts?.map(p => [p.id, p.is_active]) || []);
     const brokenBestsellers = bestsellers?.filter(bs => {
       const isActive = productActiveMap.get(bs.product_id);
       return isActive === false || isActive === undefined;
     }) || [];
 
     // Calculate ATC error rate
     const atcErrors = recentErrors?.filter(e => 
       e.error_message?.toLowerCase().includes("cart") ||
       e.component_name?.toLowerCase().includes("cart")
     ) || [];
     const atcErrorRate = Math.min(100, atcErrors.length * 5); // 5 points per error
 
     // Calculate mobile LCP score
     const mobileLcpValues = perfMetrics?.map(m => m.metric_value) || [];
     const avgLcp = mobileLcpValues.length > 0 
       ? mobileLcpValues.reduce((a, b) => a + b, 0) / mobileLcpValues.length 
       : 2000;
     const lcpScore = avgLcp <= 2500 ? 100 : avgLcp <= 4000 ? 75 : 50;
 
     // Calculate conversion trend
     const views = visitorActivity?.filter(a => a.activity_type === "product_view").length || 0;
     const atcCount = visitorActivity?.filter(a => a.activity_type === "add_to_cart").length || 0;
     const conversionRate = views > 0 ? (atcCount / views) * 100 : 0;
     const conversionScore = conversionRate >= 3 ? 100 : conversionRate >= 2 ? 80 : conversionRate >= 1 ? 60 : 40;
 
     const scores: LandingPageScore[] = [];
 
     for (const page of landingPages || []) {
       const components: ScoreComponents = {
         category_integrity: 100,
         product_availability: 100,
         bestseller_health: 100,
         add_to_cart_stability: 100 - atcErrorRate,
         checkout_reachability: 100, // Will be updated by nightly test
         conversion_trend: conversionScore,
         mobile_performance: lcpScore,
       };
 
       const breakdown: Record<string, any> = {};
 
       // Category integrity check
       if (page.page_type === "category") {
         const categorySlug = page.url_path.split("category=")[1]?.split("&")[0];
         const cat = categories?.find(c => c.slug === categorySlug);
         if (cat) {
           const directCount = categoryProductCount[cat.id] || 0;
           if (directCount === 0) {
             components.category_integrity = 0;
             breakdown.category_integrity = "Empty category - 0 products";
           }
         }
       }
 
       // Bestseller health check
       if (page.page_type === "bestseller") {
         const slugMatch = page.url_path.match(/\/bestseller\/([^/?]+)/);
         if (slugMatch && brokenBestsellers.some(bs => bs.slug === slugMatch[1])) {
           components.bestseller_health = 0;
           breakdown.bestseller_health = "Bestseller product inactive";
         }
       }
 
       // Check page funnel metrics if available
       if (page.funnel_metrics) {
         const metrics = page.funnel_metrics as any;
         if (metrics.conversion_rate !== undefined) {
           if (metrics.conversion_rate < 1 && metrics.views > 50) {
             components.conversion_trend = Math.max(40, conversionScore - 20);
             breakdown.conversion_trend = `Low conversion: ${metrics.conversion_rate}%`;
           }
         }
       }
 
       // Use health_status from page if blocked
       if (page.health_status === "blocked") {
         components.checkout_reachability = 0;
         breakdown.checkout_reachability = "Page marked as blocked";
       }
 
       const overallScore = calculateOverallScore(components);
       const healthStatus = getHealthStatus(overallScore);
       const previousScore = prevScoreMap.get(page.url_path);
       const scoreDelta = previousScore !== undefined ? overallScore - previousScore : 0;
 
       scores.push({
         url_path: page.url_path,
         page_type: page.page_type,
         campaign_id: page.campaign_id,
         components,
         overall_score: overallScore,
         health_status: healthStatus,
         breakdown,
       });
 
       // Upsert to database
       await supabase.from("monitoring_landing_page_scores").upsert({
         url_path: page.url_path,
         page_type: page.page_type,
         campaign_id: page.campaign_id,
         category_integrity_score: components.category_integrity,
         product_availability_score: components.product_availability,
         bestseller_health_score: components.bestseller_health,
         add_to_cart_stability_score: components.add_to_cart_stability,
         checkout_reachability_score: components.checkout_reachability,
         conversion_trend_score: components.conversion_trend,
         mobile_performance_score: components.mobile_performance,
         overall_score: overallScore,
         health_status: healthStatus,
         score_breakdown: breakdown,
         previous_score: previousScore,
         score_delta: scoreDelta,
         last_calculated_at: now.toISOString(),
         updated_at: now.toISOString(),
       }, { onConflict: "url_path" });
 
       // Record to history
       await supabase.from("monitoring_score_history").insert({
         url_path: page.url_path,
         overall_score: overallScore,
         health_status: healthStatus,
         score_breakdown: breakdown,
         recorded_at: now.toISOString(),
       });
 
       // Trigger realtime alert if score dropped significantly
       if (scoreDelta <= -15) {
         await supabase.from("monitoring_realtime_alerts").insert({
           alert_type: "score_drop",
           severity: healthStatus === "critical" ? "P1" : "predictive",
           title: `Score dropped ${Math.abs(scoreDelta)} points: ${page.url_path}`,
           summary: `Landing page score fell from ${previousScore} to ${overallScore} (${healthStatus})`,
           affected_urls: [page.url_path],
           current_score: overallScore,
           previous_score: previousScore,
           score_delta: scoreDelta,
           payload: { components, breakdown },
           recommended_action: healthStatus === "critical" ? "Pause ads for this URL" : "Investigate conversion issues",
           alert_group_key: `score_drop_${page.url_path}`,
         });
       }
     }
 
     // Summary
     const summary = {
       total_pages: scores.length,
       healthy: scores.filter(s => s.health_status === "healthy").length,
       at_risk: scores.filter(s => s.health_status === "at_risk").length,
       critical: scores.filter(s => s.health_status === "critical").length,
       avg_score: scores.length > 0 
         ? Math.round(scores.reduce((sum, s) => sum + s.overall_score, 0) / scores.length) 
         : 100,
     };
 
     return new Response(JSON.stringify({
       success: true,
       calculated_at: now.toISOString(),
       summary,
       scores: scores.map(s => ({
         url: s.url_path,
         type: s.page_type,
         score: s.overall_score,
         status: `${s.health_status === "healthy" ? "🟢" : s.health_status === "at_risk" ? "🟠" : "🔴"} ${s.health_status.toUpperCase()}`,
         components: s.components,
         issues: Object.entries(s.breakdown).map(([k, v]) => `${k}: ${v}`),
       })),
     }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
   } catch (error) {
     console.error("Landing page scores error:", error);
     return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
   }
 });