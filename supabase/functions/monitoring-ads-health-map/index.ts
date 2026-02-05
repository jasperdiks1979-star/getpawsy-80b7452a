 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 type HealthStatus = "healthy" | "degraded" | "blocked";
 
 interface LandingPageHealth {
   url_path: string;
   page_type: string;
   health_status: HealthStatus;
   health_emoji: string;
   at_risk: boolean;
   risk_reason: string | null;
   alternative_url: string | null;
   funnel_metrics: {
     views: number;
     add_to_cart: number;
     checkout: number;
     conversion_rate: number;
   };
   issues: string[];
 }
 
 const SITE_URL = "https://getpawsy.pet";
 
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
     const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
 
     // Get all registered ad landing pages
     const { data: landingPages } = await supabase
       .from("monitoring_ad_landing_pages")
       .select("*")
       .eq("is_active", true);
 
     // Get visitor activity for funnel metrics
     const { data: recentActivity } = await supabase
       .from("visitor_activity")
       .select("activity_type, page_path, product_id")
       .gte("created_at", twentyFourHoursAgo.toISOString());
 
     // Get category data for health checks
     const { data: categories } = await supabase
       .from("categories")
       .select("id, name, slug, parent_id");
 
     const { data: productCategories } = await supabase
       .from("product_categories")
       .select("category_id, product_id");
 
     const { data: activeProducts } = await supabase
       .from("products")
       .select("id, category, slug, is_active")
       .eq("is_active", true);
 
     // Get bestseller health
     const { data: bestsellers } = await supabase
       .from("bestsellers")
       .select("id, slug, product_id, is_active")
       .eq("is_active", true);
 
     const { data: allProducts } = await supabase
       .from("products")
       .select("id, is_active");
 
     const productActiveMap = new Map(allProducts?.map(p => [p.id, p.is_active]) || []);
     
     // Build category product counts
     const activeProductIds = new Set(activeProducts?.map(p => p.id) || []);
     const categoryProductCount: Record<string, number> = {};
     const categoryChildren: Record<string, string[]> = {};
     const categoryBySlug = new Map<string, { id: string; name: string }>();
 
     categories?.forEach(cat => {
       categoryProductCount[cat.id] = 0;
       categoryChildren[cat.id] = [];
       categoryBySlug.set(cat.slug, cat);
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
 
     const getAllDescendants = (catId: string, visited = new Set<string>()): string[] => {
       if (visited.has(catId)) return [];
       visited.add(catId);
       const children = categoryChildren[catId] || [];
       return children.flatMap(childId => [childId, ...getAllDescendants(childId, visited)]);
     };
 
     // Broken bestsellers check
     const brokenBestsellerSlugs = new Set(
       bestsellers?.filter(bs => {
         const isActive = productActiveMap.get(bs.product_id);
         return isActive === false || isActive === undefined;
       }).map(bs => bs.slug) || []
     );
 
     // Calculate health for each landing page
     const healthResults: LandingPageHealth[] = [];
 
     for (const page of landingPages || []) {
       const issues: string[] = [];
       let healthStatus: HealthStatus = "healthy";
       let riskReason: string | null = null;
       let alternativeUrl: string | null = null;
 
       // Calculate funnel metrics for this page
       const pageActivities = recentActivity?.filter(a => 
         a.page_path?.includes(page.url_path) || 
         page.url_path.includes(a.page_path || "")
       ) || [];
 
       const views = pageActivities.filter(a => a.activity_type === "browsing" || a.activity_type === "product_view").length;
       const addToCart = pageActivities.filter(a => a.activity_type === "add_to_cart").length;
       const checkout = pageActivities.filter(a => a.activity_type === "checkout").length;
       const conversionRate = views > 0 ? (addToCart / views) * 100 : 0;
 
       // Check page health based on type
       if (page.page_type === "category") {
         // Extract category slug from URL
         const categorySlug = page.url_path.split("category=")[1]?.split("&")[0];
         if (categorySlug) {
           const cat = categoryBySlug.get(categorySlug);
           if (cat) {
             const descendants = getAllDescendants(cat.id);
             const directCount = categoryProductCount[cat.id] || 0;
             const descendantCount = descendants.reduce((sum, id) => sum + (categoryProductCount[id] || 0), 0);
             
             if (directCount + descendantCount === 0) {
               healthStatus = "blocked";
               issues.push("Category has 0 products");
               riskReason = "Empty category page - customers cannot purchase";
               alternativeUrl = `${SITE_URL}/bestsellers`;
             }
           }
         }
       } else if (page.page_type === "bestseller") {
         const slugMatch = page.url_path.match(/\/bestseller\/([^/?]+)/);
         if (slugMatch && brokenBestsellerSlugs.has(slugMatch[1])) {
           healthStatus = "blocked";
           issues.push("Bestseller product inactive or missing");
           riskReason = "404 or empty product - ad spend wasted";
           alternativeUrl = `${SITE_URL}/bestsellers`;
         }
       } else if (page.page_type === "product") {
         const slugMatch = page.url_path.match(/\/product\/([^/?]+)/);
         if (slugMatch) {
           const product = activeProducts?.find(p => p.slug === slugMatch[1]);
           if (!product) {
             healthStatus = "blocked";
             issues.push("Product inactive or not found");
             riskReason = "Product page returns 404 - ad spend wasted";
             alternativeUrl = `${SITE_URL}/bestsellers`;
           }
         }
       }
 
       // Check for conversion drops (degraded state)
       if (healthStatus === "healthy" && conversionRate < 1 && views > 50) {
         healthStatus = "degraded";
         issues.push("Conversion rate below 1% with significant traffic");
         riskReason = "Low conversion may indicate UX or availability issues";
       }
 
       // Update database
       await supabase.from("monitoring_ad_landing_pages").update({
         health_status: healthStatus,
         at_risk: healthStatus !== "healthy",
         risk_reason: riskReason,
         alternative_url: alternativeUrl,
         funnel_metrics: {
           views,
           add_to_cart: addToCart,
           checkout,
           conversion_rate: parseFloat(conversionRate.toFixed(2)),
         },
         last_check_at: now.toISOString(),
         last_status: healthStatus,
       }).eq("id", page.id);
 
       healthResults.push({
         url_path: page.url_path,
         page_type: page.page_type,
         health_status: healthStatus,
         health_emoji: healthStatus === "healthy" ? "🟢" : healthStatus === "degraded" ? "🟠" : "🔴",
         at_risk: healthStatus !== "healthy",
         risk_reason: riskReason,
         alternative_url: alternativeUrl,
         funnel_metrics: {
           views,
           add_to_cart: addToCart,
           checkout,
           conversion_rate: parseFloat(conversionRate.toFixed(2)),
         },
         issues,
       });
     }
 
     // Alert on blocked pages
     const blockedPages = healthResults.filter(r => r.health_status === "blocked");
     if (blockedPages.length > 0) {
       for (const page of blockedPages) {
         await supabase.from("monitoring_alerts").upsert({
           alert_key: `ad_landing_blocked_${page.url_path.replace(/[^a-z0-9]/gi, "_")}`,
           severity: "P1",
           category: "ad_landing",
           title: `Ad landing page blocked: ${page.url_path}`,
           description: page.issues.join("; "),
           affected_urls: [SITE_URL + page.url_path],
           suggested_fix: page.alternative_url ? `Switch ads to: ${page.alternative_url}` : "Check product/category health",
           last_detected_at: now.toISOString(),
           is_active: true,
         }, { onConflict: "alert_key" });
       }
 
       // Send P1 alert
       const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
       if (RESEND_API_KEY) {
         await fetch("https://api.resend.com/emails", {
           method: "POST",
           headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
           body: JSON.stringify({
             from: "Ads Health <alerts@getpawsy.pet>",
             to: ["support@getpawsy.pet"],
             subject: `🔴 ${blockedPages.length} Ad Landing Page(s) BLOCKED - Pause Ads Now`,
             html: `<div style="font-family: sans-serif; max-width: 700px;">
               <h2 style="color: #dc2626;">🔴 Ad Landing Pages Broken</h2>
               <p>The following ad destinations are wasting ad spend:</p>
               ${blockedPages.map(p => `
                 <div style="background: #fee2e2; padding: 12px; border-radius: 8px; margin: 8px 0; border-left: 4px solid #dc2626;">
                   <p style="margin: 0;"><strong>${p.url_path}</strong></p>
                   <p style="margin: 4px 0; color: #666;">${p.issues.join(", ")}</p>
                   ${p.alternative_url ? `<p style="margin: 4px 0; color: #16a34a;"><strong>Safe alternative:</strong> ${p.alternative_url}</p>` : ""}
                 </div>
               `).join("")}
               <p style="margin-top: 16px; font-size: 14px; color: #666;">
                 <strong>Action Required:</strong> Pause ads pointing to blocked pages or switch to alternatives.
               </p>
             </div>`,
           }),
         });
       }
     }
 
     // Build summary
     const summary = {
       total_pages: healthResults.length,
       healthy: healthResults.filter(r => r.health_status === "healthy").length,
       degraded: healthResults.filter(r => r.health_status === "degraded").length,
       blocked: healthResults.filter(r => r.health_status === "blocked").length,
     };
 
     return new Response(JSON.stringify({
       success: true,
       summary,
       health_map: healthResults.map(r => ({
         page: r.url_path,
         status: `${r.health_emoji} ${r.health_status.toUpperCase()}`,
         funnel: `${r.funnel_metrics.views} views → ${r.funnel_metrics.add_to_cart} ATC (${r.funnel_metrics.conversion_rate}%)`,
         risk: r.risk_reason,
         alternative: r.alternative_url,
       })),
       details: healthResults,
     }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
   } catch (error) {
     console.error("Ads health map error:", error);
     return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
   }
 });