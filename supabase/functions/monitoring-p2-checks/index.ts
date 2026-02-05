 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 interface Alert {
   alert_key: string;
   severity: 'P1' | 'P2';
   category: string;
   title: string;
   description: string;
   affected_urls: string[];
   suggested_fix: string;
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
 
   const runId = crypto.randomUUID();
   const startTime = new Date().toISOString();
   const alerts: Alert[] = [];
   let checksPassed = 0;
   let checksFailed = 0;
 
   try {
     await supabase.from("monitoring_runs").insert({
       id: runId,
       run_type: "p2",
       started_at: startTime,
     });
 
     // ════════════════════════════════════════════
     // CHECK 1: Performance Metrics (LCP from stored data)
     // ════════════════════════════════════════════
     const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
     
     const { data: recentLCP } = await supabase
       .from("performance_metrics")
       .select("metric_value, page_url, rating")
       .eq("metric_name", "LCP")
       .gte("created_at", oneHourAgo);
 
     const poorLCPPages: string[] = [];
     const LCP_THRESHOLD = 3000; // 3 seconds
 
     if (recentLCP && recentLCP.length > 0) {
       // Group by page and check averages
       const pageMetrics: Record<string, number[]> = {};
       
       for (const metric of recentLCP) {
         const url = metric.page_url || 'unknown';
         if (!pageMetrics[url]) pageMetrics[url] = [];
         pageMetrics[url].push(Number(metric.metric_value));
       }
 
       for (const [url, values] of Object.entries(pageMetrics)) {
         const avgLCP = values.reduce((a, b) => a + b, 0) / values.length;
         if (avgLCP > LCP_THRESHOLD) {
           poorLCPPages.push(url);
         }
       }
 
       if (poorLCPPages.length > 0) {
         checksFailed++;
         alerts.push({
           alert_key: `performance_lcp_slow_${poorLCPPages.length}`,
           severity: 'P2',
           category: 'performance',
           title: `${poorLCPPages.length} pages with slow LCP (>3s)`,
           description: `Pages experiencing poor LCP performance: ${poorLCPPages.slice(0, 5).join(', ')}`,
           affected_urls: poorLCPPages.slice(0, 10),
           suggested_fix: 'Optimize hero images, implement preloading, review lazy loading strategy',
         });
       } else {
         checksPassed++;
       }
     } else {
       checksPassed++; // No data to check
     }
 
     // ════════════════════════════════════════════
     // CHECK 2: Broken Images Detection
     // ════════════════════════════════════════════
     const { data: productsWithImages } = await supabase
       .from("products")
       .select("id, name, slug, image_url, images")
       .eq("is_active", true)
       .limit(20);
 
     const brokenImageProducts: string[] = [];
 
     for (const product of productsWithImages || []) {
       // Check main image URL format (basic validation)
       if (product.image_url) {
         try {
           new URL(product.image_url);
           // Could add HEAD request check here, but keeping lightweight
         } catch {
           brokenImageProducts.push(product.name);
         }
       }
       
       // Check images array
       if (product.images && Array.isArray(product.images)) {
         for (const imgUrl of product.images) {
           try {
             if (typeof imgUrl === 'string') new URL(imgUrl);
           } catch {
             if (!brokenImageProducts.includes(product.name)) {
               brokenImageProducts.push(product.name);
             }
           }
         }
       }
     }
 
     if (brokenImageProducts.length > 0) {
       checksFailed++;
       alerts.push({
         alert_key: `broken_images_${brokenImageProducts.length}`,
         severity: 'P2',
         category: 'broken_image',
         title: `${brokenImageProducts.length} products with potentially broken images`,
         description: `Products with invalid image URLs: ${brokenImageProducts.join(', ')}`,
         affected_urls: brokenImageProducts.map(name => {
           const product = productsWithImages?.find(p => p.name === name);
           return `${SITE_URL}/product/${product?.slug || 'unknown'}`;
         }),
         suggested_fix: 'Review and update image URLs in product database',
       });
     } else {
       checksPassed++;
     }
 
     // ════════════════════════════════════════════
     // CHECK 3: Core Web Vitals Summary
     // ════════════════════════════════════════════
     const { data: recentMetrics } = await supabase
       .from("performance_metrics")
       .select("metric_name, rating")
       .gte("created_at", oneHourAgo);
 
     if (recentMetrics && recentMetrics.length > 0) {
       const poorCount = recentMetrics.filter(m => m.rating === 'poor').length;
       const totalCount = recentMetrics.length;
       const poorPercentage = (poorCount / totalCount) * 100;
 
       if (poorPercentage > 30) {
         checksFailed++;
         alerts.push({
           alert_key: `cwv_poor_rate_high`,
           severity: 'P2',
           category: 'performance',
           title: `High rate of poor Core Web Vitals (${poorPercentage.toFixed(1)}%)`,
           description: `${poorCount} of ${totalCount} recent metrics rated "poor". This may impact user experience and SEO.`,
           affected_urls: [`${SITE_URL}`],
           suggested_fix: 'Review performance dashboard and optimize slow pages',
         });
       } else {
         checksPassed++;
       }
     } else {
       checksPassed++;
     }
 
     // ════════════════════════════════════════════
     // Process Alerts (same logic as P1)
     // ════════════════════════════════════════════
     const { data: existingAlerts } = await supabase
       .from("monitoring_alerts")
       .select("alert_key")
       .eq("is_active", true)
       .eq("severity", "P2");
 
     const existingAlertKeys = new Set(existingAlerts?.map(a => a.alert_key) || []);
     const newAlertKeys: string[] = [];
 
     for (const alert of alerts) {
       await supabase
         .from("monitoring_alerts")
         .upsert({
           ...alert,
           last_detected_at: new Date().toISOString(),
           is_active: true,
           resolved_at: null,
         }, {
           onConflict: 'alert_key',
         });
 
       if (!existingAlertKeys.has(alert.alert_key)) {
         newAlertKeys.push(alert.alert_key);
       }
     }
 
     // Mark resolved P2 alerts
     const newAlertKeySet = new Set(alerts.map(a => a.alert_key));
     for (const existingKey of existingAlertKeys) {
       if (!newAlertKeySet.has(existingKey)) {
         await supabase
           .from("monitoring_alerts")
           .update({
             is_active: false,
             resolved_at: new Date().toISOString(),
           })
           .eq("alert_key", existingKey);
       }
     }
 
     // Complete run
     await supabase
       .from("monitoring_runs")
       .update({
         completed_at: new Date().toISOString(),
         success: checksFailed === 0,
         checks_passed: checksPassed,
         checks_failed: checksFailed,
         details: {
           alerts_created: newAlertKeys.length,
           total_active_alerts: alerts.length,
         },
       })
       .eq("id", runId);
 
     return new Response(
       JSON.stringify({
         success: true,
         run_id: runId,
         checks_passed: checksPassed,
         checks_failed: checksFailed,
         new_alerts: newAlertKeys.length,
         alerts: alerts,
       }),
       { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   } catch (error) {
     console.error("Monitoring P2 error:", error);
     
     await supabase
       .from("monitoring_runs")
       .update({
         completed_at: new Date().toISOString(),
         success: false,
         details: { error: error instanceof Error ? error.message : "Unknown error" },
       })
       .eq("id", runId);
 
     return new Response(
       JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });