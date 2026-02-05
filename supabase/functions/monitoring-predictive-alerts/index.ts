 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 interface Indicator {
   name: string;
   current_value: number;
   threshold: number;
   trend: "rising" | "falling" | "stable";
   severity: "soft" | "hard";
   breach_count: number;
 }
 
 interface PredictiveAlert {
   alert_type: string;
   severity: string;
   risk_level: string;
   estimated_hours_to_nogo: number | null;
   indicators: Indicator[];
   affected_urls: string[];
   affected_components: string[];
   recommended_actions: string[];
 }
 
 // ⚠️ SAFETY: This function is READ-ONLY for business data
 // Never modifies prices, inventory, orders, or payments
 
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
     const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
     const indicators: Indicator[] = [];
     const affectedUrls: string[] = [];
     const affectedComponents: string[] = [];
 
     // ════════════════════════════════════════════
     // INDICATOR 1: Rising Error Rate on PDPs/Cart
     // ════════════════════════════════════════════
     const { data: recentErrors } = await supabase
       .from("frontend_error_logs")
       .select("id, page_url, created_at")
       .gte("created_at", sixHoursAgo.toISOString());
 
     const { data: olderErrors } = await supabase
       .from("frontend_error_logs")
       .select("id")
       .lt("created_at", sixHoursAgo.toISOString())
       .gte("created_at", new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString());
 
     const recentErrorCount = recentErrors?.length || 0;
     const olderErrorCount = olderErrors?.length || 0;
     const errorRateChange = olderErrorCount > 0 
       ? ((recentErrorCount - olderErrorCount) / olderErrorCount) * 100 
       : recentErrorCount > 5 ? 100 : 0;
 
     if (errorRateChange > 50) {
       indicators.push({
         name: "Frontend Error Rate",
         current_value: recentErrorCount,
         threshold: olderErrorCount * 1.5,
         trend: "rising",
         severity: errorRateChange > 100 ? "hard" : "soft",
         breach_count: 1,
       });
       const pdpErrors = recentErrors?.filter(e => e.page_url?.includes("/product/")) || [];
       pdpErrors.slice(0, 3).forEach(e => affectedUrls.push(e.page_url || ""));
       affectedComponents.push("ProductDetailPage", "CartPage");
     }
 
     // ════════════════════════════════════════════
     // INDICATOR 2: Intermittent Add-to-Cart Failures
     // ════════════════════════════════════════════
     const { data: cartErrors } = await supabase
       .from("frontend_error_logs")
       .select("id, created_at")
       .gte("created_at", twoHoursAgo.toISOString())
       .or("error_message.ilike.%cart%,error_message.ilike.%add%,component_name.ilike.%cart%");
 
     const cartErrorCount = cartErrors?.length || 0;
     if (cartErrorCount >= 3) {
       indicators.push({
         name: "Add-to-Cart Failures",
         current_value: cartErrorCount,
         threshold: 2,
         trend: "rising",
         severity: cartErrorCount >= 5 ? "hard" : "soft",
         breach_count: Math.ceil(cartErrorCount / 2),
       });
       affectedComponents.push("AddToCartButton", "CartProvider");
     }
 
     // ════════════════════════════════════════════
     // INDICATOR 3: Increasing 404s on Bestseller/Product URLs
     // ════════════════════════════════════════════
     const { data: recent404s } = await supabase
       .from("monitoring_alerts")
       .select("id, affected_urls, created_at")
       .eq("category", "url_health")
       .gte("created_at", sixHoursAgo.toISOString());
 
     const count404 = recent404s?.length || 0;
     if (count404 >= 2) {
       indicators.push({
         name: "404 Errors on Product URLs",
         current_value: count404,
         threshold: 1,
         trend: "rising",
         severity: count404 >= 5 ? "hard" : "soft",
         breach_count: count404,
       });
       recent404s?.forEach(a => a.affected_urls?.forEach((u: string) => affectedUrls.push(u)));
       affectedComponents.push("ProductRouter", "BestsellerPage");
     }
 
     // ════════════════════════════════════════════
     // INDICATOR 4: Gradual LCP Degradation
     // ════════════════════════════════════════════
     const { data: recentLCP } = await supabase
       .from("performance_metrics")
       .select("metric_value, created_at")
       .eq("metric_name", "LCP")
       .gte("created_at", twoHoursAgo.toISOString())
       .order("created_at", { ascending: false });
 
     const { data: baselineLCP } = await supabase
       .from("performance_metrics")
       .select("metric_value")
       .eq("metric_name", "LCP")
       .lt("created_at", twoHoursAgo.toISOString())
       .gte("created_at", sixHoursAgo.toISOString());
 
     const avgRecentLCP = recentLCP && recentLCP.length > 0
       ? recentLCP.reduce((s, m) => s + m.metric_value, 0) / recentLCP.length
       : null;
     const avgBaselineLCP = baselineLCP && baselineLCP.length > 0
       ? baselineLCP.reduce((s, m) => s + m.metric_value, 0) / baselineLCP.length
       : null;
 
     if (avgRecentLCP && avgBaselineLCP && avgRecentLCP > avgBaselineLCP * 1.3) {
       const degradation = ((avgRecentLCP - avgBaselineLCP) / avgBaselineLCP) * 100;
       indicators.push({
         name: "Mobile LCP Degradation",
         current_value: Math.round(avgRecentLCP),
         threshold: Math.round(avgBaselineLCP * 1.3),
         trend: "rising",
         severity: avgRecentLCP > 3500 ? "hard" : "soft",
         breach_count: degradation > 50 ? 2 : 1,
       });
       affectedComponents.push("MobilePDP", "ImageLoader");
     }
 
     // ════════════════════════════════════════════
     // INDICATOR 5: Early Conversion Drops (10-20%)
     // ════════════════════════════════════════════
     const { data: conversionBaselines } = await supabase
       .from("monitoring_conversion_baselines")
       .select("metric_name, baseline_value, current_value")
       .in("metric_name", ["add_to_cart_rate", "checkout_start_rate"]);
 
     for (const baseline of conversionBaselines || []) {
       if (baseline.current_value && baseline.baseline_value) {
         const dropPercent = ((baseline.baseline_value - baseline.current_value) / baseline.baseline_value) * 100;
         if (dropPercent >= 10 && dropPercent < 30) {
           indicators.push({
             name: `Conversion Drop: ${baseline.metric_name}`,
             current_value: Math.round(baseline.current_value * 100),
             threshold: Math.round(baseline.baseline_value * 90),
             trend: "falling",
             severity: dropPercent >= 20 ? "hard" : "soft",
             breach_count: dropPercent >= 20 ? 2 : 1,
           });
           affectedComponents.push("ConversionFunnel");
         }
       }
     }
 
     // ════════════════════════════════════════════
     // Evaluate Risk Level
     // ════════════════════════════════════════════
     const hardBreaches = indicators.filter(i => i.severity === "hard").length;
     const softBreaches = indicators.filter(i => i.severity === "soft").length;
     const totalBreachCount = indicators.reduce((s, i) => s + i.breach_count, 0);
 
     let shouldAlert = false;
     let riskLevel: "low" | "medium" | "high" = "low";
     let estimatedHours: number | null = null;
 
     // Trigger conditions:
     // - Two or more indicators trending negatively within 2-6 hours
     // - OR one indicator breaches soft threshold twice consecutively
     if (indicators.length >= 2) {
       shouldAlert = true;
       riskLevel = hardBreaches >= 1 ? "high" : "medium";
       estimatedHours = hardBreaches >= 2 ? 2 : hardBreaches >= 1 ? 4 : 6;
     } else if (indicators.length === 1 && totalBreachCount >= 2) {
       shouldAlert = true;
       riskLevel = hardBreaches >= 1 ? "high" : "medium";
       estimatedHours = hardBreaches >= 1 ? 4 : 8;
     }
 
     // ════════════════════════════════════════════
     // Generate Recommended Actions
     // ════════════════════════════════════════════
     const recommendedActions: string[] = [];
 
     if (indicators.some(i => i.name.includes("Error Rate"))) {
       recommendedActions.push("Review frontend error logs for recent exceptions");
     }
     if (indicators.some(i => i.name.includes("Cart"))) {
       recommendedActions.push("Test add-to-cart flow on mobile and desktop");
     }
     if (indicators.some(i => i.name.includes("404"))) {
       recommendedActions.push("Check bestseller and product URL routing");
     }
     if (indicators.some(i => i.name.includes("LCP"))) {
       recommendedActions.push("Audit image loading and optimize mobile performance");
     }
     if (indicators.some(i => i.name.includes("Conversion"))) {
       recommendedActions.push("Review recent UI changes affecting conversion funnel");
     }
 
     // ════════════════════════════════════════════
     // Store and Alert
     // ════════════════════════════════════════════
     let alertId: string | null = null;
 
     if (shouldAlert) {
       const alert: PredictiveAlert = {
         alert_type: "risk_warning",
         severity: riskLevel === "high" ? "critical" : "warning",
         risk_level: riskLevel,
         estimated_hours_to_nogo: estimatedHours,
         indicators,
         affected_urls: [...new Set(affectedUrls)].slice(0, 10),
         affected_components: [...new Set(affectedComponents)],
         recommended_actions: recommendedActions,
       };
 
       // Check for existing active alert to avoid duplicates
       const { data: existingAlert } = await supabase
         .from("monitoring_predictive_alerts")
         .select("id")
         .eq("is_active", true)
         .gte("created_at", twoHoursAgo.toISOString())
         .single();
 
       if (!existingAlert) {
         const { data: newAlert } = await supabase
           .from("monitoring_predictive_alerts")
           .insert(alert)
           .select("id")
           .single();
 
         alertId = newAlert?.id;
 
         // Log to audit trail
         await supabase.from("monitoring_audit_logs").insert({
           severity: riskLevel === "high" ? "P1" : "P2",
           action_type: "predictive_alert",
           trigger_condition: `${indicators.length} indicators breached: ${indicators.map(i => i.name).join(", ")}`,
           affected_urls: alert.affected_urls,
           affected_components: alert.affected_components,
           action_taken: `Predictive alert generated: Risk of NO-GO in ~${estimatedHours}h`,
           action_result: "alert_created",
           is_recommendation: true,
           metadata: { indicators, risk_level: riskLevel },
         });
 
         // Send email alert
         const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
         if (RESEND_API_KEY) {
           await fetch("https://api.resend.com/emails", {
             method: "POST",
             headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
             body: JSON.stringify({
               from: "Predictive Alerts <alerts@getpawsy.pet>",
               to: ["support@getpawsy.pet"],
               subject: `⚠️ [PRE-ALERT] Risk of NO-GO in ~${estimatedHours}h - ${indicators.length} warning signs`,
               html: `
                 <div style="font-family: sans-serif; max-width: 600px;">
                   <div style="background: #fef3c7; padding: 20px; border-radius: 12px; border-left: 6px solid #f59e0b;">
                     <h2 style="margin: 0; color: #92400e;">⚠️ Predictive Alert: Risk of NO-GO</h2>
                     <p style="margin: 8px 0 0; color: #a16207;">
                       <strong>${indicators.length} indicators</strong> are trending negatively.
                       Estimated time to NO-GO: <strong>~${estimatedHours} hours</strong>
                     </p>
                   </div>
 
                   <h3 style="margin-top: 20px;">Warning Indicators:</h3>
                   ${indicators.map(i => `
                     <div style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin: 8px 0;">
                       <strong>${i.name}</strong>
                       <span style="float: right; color: ${i.severity === 'hard' ? '#dc2626' : '#f59e0b'};">
                         ${i.trend === 'rising' ? '📈' : '📉'} ${i.severity.toUpperCase()}
                       </span>
                       <div style="font-size: 13px; color: #666; margin-top: 4px;">
                         Current: ${i.current_value} | Threshold: ${i.threshold}
                       </div>
                     </div>
                   `).join("")}
 
                   <h3 style="margin-top: 20px;">Recommended Preventive Actions:</h3>
                   <ul style="padding-left: 20px;">
                     ${recommendedActions.map(a => `<li>${a}</li>`).join("")}
                   </ul>
 
                   <p style="margin-top: 20px; font-size: 12px; color: #888;">
                     This is a preventive warning. No automatic blocking has occurred yet.
                   </p>
                 </div>`,
             }),
           });
         }
       }
     } else {
       // Resolve any active alerts if conditions improved
       await supabase
         .from("monitoring_predictive_alerts")
         .update({ is_active: false, resolved_at: now.toISOString(), resolution_reason: "Indicators returned to normal" })
         .eq("is_active", true);
     }
 
     // Log the check
     await supabase.from("monitoring_runs").insert({
       run_type: "predictive_alerts",
       started_at: now.toISOString(),
       completed_at: new Date().toISOString(),
       success: true,
       checks_passed: indicators.length === 0 ? 5 : 5 - indicators.length,
       checks_failed: indicators.length,
       details: {
         indicators_checked: 5,
         indicators_triggered: indicators.length,
         should_alert: shouldAlert,
         risk_level: shouldAlert ? riskLevel : "none",
         estimated_hours_to_nogo: estimatedHours,
       },
     });
 
     return new Response(JSON.stringify({
       success: true,
       should_alert: shouldAlert,
       risk_level: shouldAlert ? riskLevel : "none",
       estimated_hours_to_nogo: estimatedHours,
       indicators,
       alert_id: alertId,
       recommended_actions: recommendedActions,
       safety_confirmation: "⚠️ READ-ONLY check. No business data modified.",
     }), { 
       status: 200, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   } catch (error) {
     console.error("Predictive alerts error:", error);
     return new Response(JSON.stringify({ 
       error: error instanceof Error ? error.message : "Unknown error" 
     }), { 
       status: 500, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   }
 });