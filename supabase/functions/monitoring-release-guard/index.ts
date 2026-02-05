 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 interface CheckResult {
   passed: boolean;
   details: string;
   affectedUrls: string[];
   revenueImpact: string;
 }
 
 interface FailureReport {
   checks: {
     category: CheckResult;
     addToCart: CheckResult;
     bestseller: CheckResult;
     mobileRender: CheckResult;
   };
   summary: string;
   components: string[];
   blockDeploy: boolean;
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
 
   const body = await req.json().catch(() => ({}));
   const triggeredBy = body.triggered_by || "manual";
   const overrideRequested = body.override === true;
   const overrideBy = body.override_by || null;
 
   const runId = crypto.randomUUID();
 
   try {
     const failureReport: FailureReport = {
       checks: {
         category: { passed: true, details: "", affectedUrls: [], revenueImpact: "" },
         addToCart: { passed: true, details: "", affectedUrls: [], revenueImpact: "" },
         bestseller: { passed: true, details: "", affectedUrls: [], revenueImpact: "" },
         mobileRender: { passed: true, details: "", affectedUrls: [], revenueImpact: "" },
       },
       summary: "",
       components: [],
       blockDeploy: false,
     };
 
     // ═══════════════════════════════════════════
     // CHECK 1: Category Integrity
     // ═══════════════════════════════════════════
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
     const categoryBySlug = new Map<string, { id: string; name: string; slug: string }>();
     const categoryById = new Map<string, { id: string; name: string; slug: string }>();
 
     categories?.forEach(cat => {
       categoryProductCount[cat.id] = 0;
       categoryChildren[cat.id] = [];
       categoryBySlug.set(cat.slug, cat);
       categoryById.set(cat.id, cat);
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
 
     activeProducts?.forEach(p => {
       if (p.category) {
         const cat = categoryBySlug.get(p.category) ||
           Array.from(categoryById.values()).find(c => c.name.toLowerCase() === p.category?.toLowerCase());
         if (cat && categoryProductCount[cat.id] !== undefined) {
           categoryProductCount[cat.id]++;
         }
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
       }
     }
 
     if (emptyParents.length > 0) {
       failureReport.checks.category = {
         passed: false,
         details: `${emptyParents.length} parent categories have zero products: ${emptyParents.join(", ")}`,
         affectedUrls: emptyParents.map(name => {
           const cat = Array.from(categoryBySlug.values()).find(c => c.name === name);
           return `${SITE_URL}/products?category=${cat?.slug || name.toLowerCase()}`;
         }),
         revenueImpact: "Category pages will show 0 products to customers, blocking purchases",
       };
       failureReport.components.push("Products.tsx", "CategoryEmptyState.tsx");
     }
 
     // ═══════════════════════════════════════════
     // CHECK 2: Bestseller URL Health
     // ═══════════════════════════════════════════
     const { data: bestsellers } = await supabase
       .from("bestsellers")
       .select("id, slug, product_id, is_active")
       .eq("is_active", true);
 
     const { data: allProducts } = await supabase
       .from("products")
       .select("id, slug, name, is_active");
 
     const productMap = new Map(allProducts?.map(p => [p.id, p]) || []);
     const brokenBestsellers: string[] = [];
 
     for (const bs of bestsellers || []) {
       const product = productMap.get(bs.product_id);
       if (!product || !product.is_active) {
         brokenBestsellers.push(bs.slug);
       }
     }
 
     if (brokenBestsellers.length > 0) {
       failureReport.checks.bestseller = {
         passed: false,
         details: `${brokenBestsellers.length} bestseller URLs point to missing/inactive products`,
         affectedUrls: brokenBestsellers.map(slug => `${SITE_URL}/bestseller/${slug}`),
         revenueImpact: "Ad traffic to bestseller pages will see 404 or empty products",
       };
       failureReport.components.push("BestsellerDetail.tsx");
     }
 
     // ═══════════════════════════════════════════
     // CHECK 3: Add-to-Cart Data Ready
     // ═══════════════════════════════════════════
     const { count: activeProductCount } = await supabase
       .from("products")
       .select("id", { count: "exact", head: true })
       .eq("is_active", true);
 
     if (!activeProductCount || activeProductCount === 0) {
       failureReport.checks.addToCart = {
         passed: false,
         details: "No active products available for purchase",
         affectedUrls: [`${SITE_URL}/products`, `${SITE_URL}/bestsellers`],
         revenueImpact: "Customers cannot add anything to cart - 100% revenue loss",
       };
       failureReport.components.push("AddToCartButton.tsx", "useCart.ts");
     }
 
     // ═══════════════════════════════════════════
     // CHECK 4: Mobile Render (via performance metrics)
     // ═══════════════════════════════════════════
     const { data: recentLCP } = await supabase
       .from("performance_metrics")
       .select("metric_value, page_url")
       .eq("metric_name", "LCP")
       .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
       .order("created_at", { ascending: false })
       .limit(20);
 
     const badLCPPages = recentLCP?.filter(m => m.metric_value > 3000) || [];
     if (badLCPPages.length >= 5) {
       failureReport.checks.mobileRender = {
         passed: false,
         details: `${badLCPPages.length} recent mobile page loads exceeded 3s LCP threshold`,
         affectedUrls: [...new Set(badLCPPages.map(p => p.page_url).filter(Boolean))].slice(0, 5) as string[],
         revenueImpact: "Slow pages cause 40%+ mobile bounce rate increase",
       };
       failureReport.components.push("ProductCard.tsx", "OptimizedImage.tsx");
     }
 
     // ═══════════════════════════════════════════
     // Determine if deploy should be blocked
     // ═══════════════════════════════════════════
     const anyFailed = !failureReport.checks.category.passed ||
                       !failureReport.checks.bestseller.passed ||
                       !failureReport.checks.addToCart.passed ||
                       !failureReport.checks.mobileRender.passed;
 
     failureReport.blockDeploy = anyFailed && !overrideRequested;
 
     if (anyFailed) {
       const failedChecks = Object.entries(failureReport.checks)
         .filter(([_, v]) => !v.passed)
         .map(([k]) => k);
       failureReport.summary = `DEPLOY BLOCKED: ${failedChecks.length} P1 issue(s) detected (${failedChecks.join(", ")})`;
     } else {
       failureReport.summary = "All pre-deploy checks passed ✓";
     }
 
     // ═══════════════════════════════════════════
     // Save result to database
     // ═══════════════════════════════════════════
     await supabase.from("monitoring_release_guards").insert({
       id: runId,
       triggered_by: triggeredBy,
       category_check_passed: failureReport.checks.category.passed,
       add_to_cart_check_passed: failureReport.checks.addToCart.passed,
       bestseller_check_passed: failureReport.checks.bestseller.passed,
       mobile_render_check_passed: failureReport.checks.mobileRender.passed,
       all_checks_passed: !anyFailed,
       blocked: failureReport.blockDeploy,
       override_approved_by: overrideRequested ? overrideBy : null,
       override_approved_at: overrideRequested ? new Date().toISOString() : null,
       failure_report: failureReport,
       affected_components: failureReport.components,
       revenue_impact_summary: anyFailed
         ? Object.values(failureReport.checks).filter(c => !c.passed).map(c => c.revenueImpact).join("; ")
         : null,
     });
 
     // Send alert if blocked
     if (failureReport.blockDeploy) {
       const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
       if (RESEND_API_KEY) {
         await fetch("https://api.resend.com/emails", {
           method: "POST",
           headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
           body: JSON.stringify({
             from: "Release Guard <alerts@getpawsy.pet>",
             to: ["support@getpawsy.pet"],
             subject: `🛑 DEPLOY BLOCKED - P1 Issues Detected`,
             html: `<div style="font-family: sans-serif; max-width: 700px;">
               <h2 style="color: #dc2626;">🛑 Deployment Blocked</h2>
               <p style="font-size: 16px;">${failureReport.summary}</p>
               ${Object.entries(failureReport.checks)
                 .filter(([_, v]) => !v.passed)
                 .map(([k, v]) => `
                   <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 12px 0; border-left: 4px solid #dc2626;">
                     <h3 style="margin: 0 0 8px; color: #991b1b;">${k.toUpperCase()} CHECK FAILED</h3>
                     <p style="margin: 4px 0;"><strong>Issue:</strong> ${v.details}</p>
                     <p style="margin: 4px 0;"><strong>Revenue Impact:</strong> ${v.revenueImpact}</p>
                     <p style="margin: 4px 0; font-size: 13px; color: #666;">Affected: ${v.affectedUrls.slice(0, 3).join(", ")}</p>
                   </div>
                 `).join("")}
               <p style="margin-top: 20px; font-size: 14px; color: #666;">
                 <strong>Components:</strong> ${failureReport.components.join(", ")}<br/>
                 To override, call with <code>{"override": true, "override_by": "your-email"}</code>
               </p>
             </div>`,
           }),
         });
       }
     }
 
     return new Response(JSON.stringify({
       run_id: runId,
       all_checks_passed: !anyFailed,
       blocked: failureReport.blockDeploy,
       override_applied: overrideRequested,
       summary: failureReport.summary,
       checks: {
         category: failureReport.checks.category.passed ? "✅ PASS" : "❌ FAIL",
         add_to_cart: failureReport.checks.addToCart.passed ? "✅ PASS" : "❌ FAIL",
         bestseller: failureReport.checks.bestseller.passed ? "✅ PASS" : "❌ FAIL",
         mobile_render: failureReport.checks.mobileRender.passed ? "✅ PASS" : "❌ FAIL",
       },
       failure_details: anyFailed ? failureReport.checks : null,
       components: failureReport.components,
     }), { status: failureReport.blockDeploy ? 400 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
   } catch (error) {
     console.error("Release guard error:", error);
     return new Response(JSON.stringify({
       error: error instanceof Error ? error.message : "Unknown error",
       blocked: true, // Fail safe - block on errors
     }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
   }
 });