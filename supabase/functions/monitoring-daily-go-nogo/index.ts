 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 type AdsStatus = "GO" | "CAUTION" | "NO-GO";
 
 interface HealthCheck {
   name: string;
   status: "pass" | "warn" | "fail";
   details: string;
   weight: number;
 }
 
 interface DailyGoNoGoReport {
   date: string;
   status: AdsStatus;
   status_emoji: string;
   score: number;
   max_score: number;
   checks: HealthCheck[];
   blocking_issues: string[];
   warnings: string[];
   affected_pages: string[];
   actions_to_fix: string[];
 }
 
 const SITE_URL = "https://getpawsy.pet";
 
 // Scoring thresholds
 const GO_THRESHOLD = 90;      // 90%+ = GO
 const CAUTION_THRESHOLD = 70; // 70-89% = CAUTION
                               // <70% = NO-GO
 
 serve(async (req: Request): Promise<Response> => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   const supabase = createClient(
     Deno.env.get("SUPABASE_URL") ?? "",
     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
   );
 
   const now = new Date();
   const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
   const checks: HealthCheck[] = [];
   const blockingIssues: string[] = [];
   const warnings: string[] = [];
   const affectedPages: string[] = [];
   const actionsToFix: string[] = [];
 
   try {
     // ════════════════════════════════════════════
     // CHECK 1: Category Integrity (Weight: 20)
     // ════════════════════════════════════════════
     const { data: categories } = await supabase
       .from("categories")
       .select("id, name, slug, parent_id");
 
     const { data: productCategories } = await supabase
       .from("product_categories")
       .select("category_id, product_id");
 
     const { data: activeProducts } = await supabase
       .from("products")
       .select("id, category")
       .eq("is_active", true);
 
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
 
     const getAllDescendants = (catId: string, visited = new Set<string>()): string[] => {
       if (visited.has(catId)) return [];
       visited.add(catId);
       const children = categoryChildren[catId] || [];
       return children.flatMap(childId => [childId, ...getAllDescendants(childId, visited)]);
     };
 
     const parentCategories = categories?.filter(c => !c.parent_id) || [];
     const emptyParents: string[] = [];
 
     for (const parent of parentCategories) {
       const descendants = getAllDescendants(parent.id);
       const directCount = categoryProductCount[parent.id] || 0;
       const descendantCount = descendants.reduce((sum, id) => sum + (categoryProductCount[id] || 0), 0);
       if (directCount + descendantCount === 0 && descendants.length > 0) {
         emptyParents.push(parent.name);
         affectedPages.push(`${SITE_URL}/products?category=${parent.slug}`);
       }
     }
 
     if (emptyParents.length > 0) {
       checks.push({
         name: "Category Integrity",
         status: "fail",
         details: `${emptyParents.length} empty parent categories: ${emptyParents.join(", ")}`,
         weight: 20,
       });
       blockingIssues.push(`Empty categories: ${emptyParents.join(", ")}`);
       actionsToFix.push("Add products to empty categories or remove from navigation");
     } else {
       checks.push({
         name: "Category Integrity",
         status: "pass",
         details: `All ${parentCategories.length} parent categories have products`,
         weight: 20,
       });
     }
 
     // ════════════════════════════════════════════
     // CHECK 2: Product Availability (Weight: 15)
     // ════════════════════════════════════════════
     const { count: totalActive } = await supabase
       .from("products")
       .select("id", { count: "exact", head: true })
       .eq("is_active", true);
 
     if (!totalActive || totalActive === 0) {
       checks.push({
         name: "Product Availability",
         status: "fail",
         details: "No active products available",
         weight: 15,
       });
       blockingIssues.push("Zero active products - nothing to sell");
       actionsToFix.push("Activate products in database");
     } else if (totalActive < 10) {
       checks.push({
         name: "Product Availability",
         status: "warn",
         details: `Only ${totalActive} active products (low inventory)`,
         weight: 15,
       });
       warnings.push(`Low product count: ${totalActive}`);
     } else {
       checks.push({
         name: "Product Availability",
         status: "pass",
         details: `${totalActive} active products available`,
         weight: 15,
       });
     }
 
     // ════════════════════════════════════════════
     // CHECK 3: Bestseller URL Health (Weight: 20)
     // ════════════════════════════════════════════
     const { data: bestsellers } = await supabase
       .from("bestsellers")
       .select("id, slug, product_id, is_active")
       .eq("is_active", true);
 
     const { data: allProducts } = await supabase
       .from("products")
       .select("id, is_active");
 
     const productActiveMap = new Map(allProducts?.map(p => [p.id, p.is_active]) || []);
     const brokenBestsellers: string[] = [];
 
     for (const bs of bestsellers || []) {
       const isActive = productActiveMap.get(bs.product_id);
       if (isActive === false || isActive === undefined) {
         brokenBestsellers.push(bs.slug);
         affectedPages.push(`${SITE_URL}/bestseller/${bs.slug}`);
       }
     }
 
     if (brokenBestsellers.length > 0) {
       checks.push({
         name: "Bestseller URL Health",
         status: "fail",
         details: `${brokenBestsellers.length} broken bestseller URLs`,
         weight: 20,
       });
       blockingIssues.push(`Broken bestsellers: ${brokenBestsellers.slice(0, 3).join(", ")}`);
       actionsToFix.push("Deactivate broken bestseller entries");
     } else {
       checks.push({
         name: "Bestseller URL Health",
         status: "pass",
         details: `All ${bestsellers?.length || 0} bestseller URLs healthy`,
         weight: 20,
       });
     }
 
     // ════════════════════════════════════════════
     // CHECK 4: Checkout Smoke Tests (Weight: 25)
     // ════════════════════════════════════════════
     const { data: recentCheckoutTests } = await supabase
       .from("monitoring_runs")
       .select("success, completed_at")
       .eq("run_type", "nightly_order_test")
       .gte("completed_at", twentyFourHoursAgo.toISOString())
       .order("completed_at", { ascending: false })
       .limit(1);
 
     const latestCheckout = recentCheckoutTests?.[0];
     
     if (!latestCheckout) {
       checks.push({
         name: "Checkout Smoke Test",
         status: "warn",
         details: "No checkout test run in last 24h",
         weight: 25,
       });
       warnings.push("Checkout test not run recently");
     } else if (!latestCheckout.success) {
       checks.push({
         name: "Checkout Smoke Test",
         status: "fail",
         details: "Last checkout smoke test failed",
         weight: 25,
       });
       blockingIssues.push("Checkout flow broken");
       affectedPages.push(`${SITE_URL}/checkout`);
       actionsToFix.push("Debug checkout flow immediately");
     } else {
       checks.push({
         name: "Checkout Smoke Test",
         status: "pass",
         details: "Checkout flow verified working",
         weight: 25,
       });
     }
 
     // ════════════════════════════════════════════
     // CHECK 5: Conversion Deltas (Weight: 10)
     // ════════════════════════════════════════════
     const { data: conversionBaselines } = await supabase
       .from("monitoring_conversion_baselines")
       .select("metric_name, baseline_value, current_value")
       .in("metric_name", ["add_to_cart_rate", "checkout_start_rate"]);
 
     let conversionOk = true;
     const conversionIssues: string[] = [];
 
     for (const baseline of conversionBaselines || []) {
       if (baseline.current_value && baseline.baseline_value) {
         const dropPercent = ((baseline.baseline_value - baseline.current_value) / baseline.baseline_value) * 100;
         if (dropPercent >= 30) {
           conversionOk = false;
           conversionIssues.push(`${baseline.metric_name}: -${dropPercent.toFixed(0)}%`);
         }
       }
     }
 
     if (!conversionOk) {
       checks.push({
         name: "Conversion Deltas",
         status: "warn",
         details: `Significant drops: ${conversionIssues.join(", ")}`,
         weight: 10,
       });
       warnings.push(`Conversion drops detected: ${conversionIssues.join(", ")}`);
     } else {
       checks.push({
         name: "Conversion Deltas",
         status: "pass",
         details: "Conversion rates within normal range",
         weight: 10,
       });
     }
 
     // ════════════════════════════════════════════
     // CHECK 6: Mobile LCP Performance (Weight: 10)
     // ════════════════════════════════════════════
     const { data: recentLCP } = await supabase
       .from("performance_metrics")
       .select("metric_value")
       .eq("metric_name", "LCP")
       .gte("created_at", twentyFourHoursAgo.toISOString());
 
     const avgLCP = recentLCP && recentLCP.length > 0
       ? recentLCP.reduce((sum, m) => sum + m.metric_value, 0) / recentLCP.length
       : null;
 
     if (avgLCP === null) {
       checks.push({
         name: "Mobile LCP",
         status: "warn",
         details: "No LCP data in last 24h",
         weight: 10,
       });
       warnings.push("No performance data available");
     } else if (avgLCP > 3000) {
       checks.push({
         name: "Mobile LCP",
         status: "warn",
         details: `Average LCP: ${(avgLCP / 1000).toFixed(1)}s (>3s threshold)`,
         weight: 10,
       });
       warnings.push(`Slow mobile LCP: ${(avgLCP / 1000).toFixed(1)}s`);
     } else {
       checks.push({
         name: "Mobile LCP",
         status: "pass",
         details: `Average LCP: ${(avgLCP / 1000).toFixed(1)}s`,
         weight: 10,
       });
     }
 
     // ════════════════════════════════════════════
     // Calculate Score & Status
     // ════════════════════════════════════════════
     let earnedScore = 0;
     let maxScore = 0;
 
     for (const check of checks) {
       maxScore += check.weight;
       if (check.status === "pass") {
         earnedScore += check.weight;
       } else if (check.status === "warn") {
         earnedScore += check.weight * 0.5; // Half credit for warnings
       }
       // fail = 0 points
     }
 
     const scorePercent = maxScore > 0 ? (earnedScore / maxScore) * 100 : 0;
 
     let status: AdsStatus;
     let statusEmoji: string;
 
     if (blockingIssues.length > 0) {
       // Any blocking issue = NO-GO regardless of score
       status = "NO-GO";
       statusEmoji = "🔴";
     } else if (scorePercent >= GO_THRESHOLD) {
       status = "GO";
       statusEmoji = "🟢";
     } else if (scorePercent >= CAUTION_THRESHOLD) {
       status = "CAUTION";
       statusEmoji = "🟠";
     } else {
       status = "NO-GO";
       statusEmoji = "🔴";
     }
 
     const report: DailyGoNoGoReport = {
       date: now.toISOString().split("T")[0],
       status,
       status_emoji: statusEmoji,
       score: Math.round(scorePercent),
       max_score: 100,
       checks,
       blocking_issues: blockingIssues,
       warnings,
       affected_pages: [...new Set(affectedPages)],
       actions_to_fix: actionsToFix,
     };
 
     // Save to monitoring runs
     await supabase.from("monitoring_runs").insert({
       id: crypto.randomUUID(),
       run_type: "daily_go_nogo",
       started_at: now.toISOString(),
       completed_at: new Date().toISOString(),
       success: status === "GO",
       checks_passed: checks.filter(c => c.status === "pass").length,
       checks_failed: checks.filter(c => c.status === "fail").length,
       details: report,
     });
 
     // Send daily report email
     const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
     if (RESEND_API_KEY) {
       const statusColor = status === "GO" ? "#16a34a" : status === "CAUTION" ? "#f59e0b" : "#dc2626";
       const statusBg = status === "GO" ? "#f0fdf4" : status === "CAUTION" ? "#fef3c7" : "#fee2e2";
 
       await fetch("https://api.resend.com/emails", {
         method: "POST",
         headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
         body: JSON.stringify({
           from: "Ads Health <alerts@getpawsy.pet>",
           to: ["support@getpawsy.pet"],
           subject: `${statusEmoji} Daily Ads Status: ${status} (${report.score}%) - ${report.date}`,
           html: `
             <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px;">
               <div style="background: ${statusBg}; padding: 24px; border-radius: 12px; border-left: 6px solid ${statusColor}; text-align: center;">
                 <h1 style="margin: 0; font-size: 48px;">${statusEmoji}</h1>
                 <h2 style="margin: 8px 0; color: ${statusColor};">${status}</h2>
                 <p style="margin: 0; font-size: 24px; color: ${statusColor}; font-weight: bold;">${report.score}%</p>
                 <p style="margin: 8px 0 0; color: #666; font-size: 14px;">${report.date}</p>
               </div>
 
               <div style="margin-top: 20px;">
                 <h3 style="margin: 0 0 12px; font-size: 14px; color: #374151;">Health Checks:</h3>
                 ${checks.map(c => `
                   <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                     <span>${c.status === "pass" ? "✅" : c.status === "warn" ? "⚠️" : "❌"} ${c.name}</span>
                     <span style="color: #666; font-size: 13px;">${c.details.slice(0, 40)}</span>
                   </div>
                 `).join("")}
               </div>
 
               ${blockingIssues.length > 0 ? `
               <div style="margin-top: 20px; background: #fee2e2; padding: 16px; border-radius: 8px;">
                 <h3 style="margin: 0 0 8px; color: #991b1b; font-size: 14px;">🚫 Blocking Issues:</h3>
                 <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #7f1d1d;">
                   ${blockingIssues.map(i => `<li>${i}</li>`).join("")}
                 </ul>
               </div>` : ""}
 
               ${actionsToFix.length > 0 ? `
               <div style="margin-top: 20px; background: #ecfdf5; padding: 16px; border-radius: 8px;">
                 <h3 style="margin: 0 0 8px; color: #065f46; font-size: 14px;">📋 Actions to Return to 🟢 GO:</h3>
                 <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #047857;">
                   ${actionsToFix.map(a => `<li>${a}</li>`).join("")}
                 </ul>
               </div>` : ""}
 
               <p style="margin-top: 20px; font-size: 12px; color: #9ca3af; text-align: center;">
                 GetPawsy Monitoring System
               </p>
             </div>`,
         }),
       });
     }
 
     return new Response(JSON.stringify({
       success: true,
       report,
       summary: `${statusEmoji} ${status} - Score: ${report.score}%`,
     }), { 
       status: 200, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   } catch (error) {
     console.error("Daily GO/NO-GO error:", error);
     return new Response(JSON.stringify({ 
       error: error instanceof Error ? error.message : "Unknown error" 
     }), { 
       status: 500, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   }
 });