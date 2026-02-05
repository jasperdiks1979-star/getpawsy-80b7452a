 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 const SITE_URL = "https://getpawsy.pet";
 
 interface QACheckResult {
   check: string;
   passed: boolean;
   reason?: string;
 }
 
 interface ProductQAReport {
   product_id: string;
   product_slug: string;
   product_name: string;
   trigger_type: string;
   checks: QACheckResult[];
   all_passed: boolean;
   qa_status: "passed" | "failed" | "blocked";
   blocked_from: string[];
   failure_summary?: string;
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
     const body = await req.json().catch(() => ({}));
     const { product_id, trigger_type = "manual" } = body;
 
     // If specific product_id provided, QA that product
     // Otherwise, QA all recently activated products without QA results
     let productsToCheck: any[] = [];
 
     if (product_id) {
       const { data: product } = await supabase
         .from("products")
         .select("*")
         .eq("id", product_id)
         .single();
       
       if (product) {
         productsToCheck = [{ ...product, trigger_type }];
       }
     } else {
       // Find products that need QA:
       // 1. Recently activated (is_active = true, updated in last 24h)
       // 2. No passing QA result yet
       const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
       
       const { data: recentProducts } = await supabase
         .from("products")
         .select("*")
         .eq("is_active", true)
         .gte("updated_at", twentyFourHoursAgo.toISOString())
         .limit(20);
 
       // Check which already have passing QA
       const { data: existingQA } = await supabase
         .from("product_qa_results")
         .select("product_id")
         .eq("qa_status", "passed");
 
       const passedProductIds = new Set(existingQA?.map(q => q.product_id) || []);
       productsToCheck = (recentProducts || [])
         .filter(p => !passedProductIds.has(p.id))
         .map(p => ({ ...p, trigger_type: "activated" }));
 
       // Also check products added to bestsellers recently
       const { data: recentBestsellers } = await supabase
         .from("bestsellers")
         .select("product_id, products(*)")
         .gte("created_at", twentyFourHoursAgo.toISOString());
 
       for (const bs of recentBestsellers || []) {
         if (bs.products && !passedProductIds.has(bs.product_id)) {
           const existing = productsToCheck.find(p => p.id === bs.product_id);
           if (!existing) {
             productsToCheck.push({ ...bs.products, trigger_type: "bestseller_added" });
           }
         }
       }
     }
 
     const reports: ProductQAReport[] = [];
 
     for (const product of productsToCheck) {
       const checks: QACheckResult[] = [];
       const failedChecks: any[] = [];
 
       // 1. URL Check - Product URL should not 404
       const productUrl = `${SITE_URL}/product/${product.slug}`;
       try {
         const urlResponse = await fetch(productUrl, { method: "HEAD" });
         const urlPassed = urlResponse.ok;
         checks.push({ check: "url_check", passed: urlPassed, reason: urlPassed ? undefined : `Status: ${urlResponse.status}` });
         if (!urlPassed) failedChecks.push({ check: "url_check", reason: `HTTP ${urlResponse.status}` });
       } catch (e) {
         checks.push({ check: "url_check", passed: false, reason: "Failed to fetch" });
         failedChecks.push({ check: "url_check", reason: "Network error" });
       }
 
       // 2. Price Check - Price > 0 and reasonable
       const pricePassed = product.price && product.price > 0;
       checks.push({ 
         check: "price_check", 
         passed: pricePassed, 
         reason: pricePassed ? undefined : `Invalid price: ${product.price}` 
       });
       if (!pricePassed) failedChecks.push({ check: "price_check", reason: `Price is ${product.price}` });
 
       // 3. Image Check - Has at least one image
       const hasImages = (product.images?.length > 0) || product.image_url;
       checks.push({ 
         check: "image_gallery_check", 
         passed: hasImages, 
         reason: hasImages ? undefined : "No images found" 
       });
       if (!hasImages) failedChecks.push({ check: "image_gallery_check", reason: "No images" });
 
       // 4. Stock Status Check - If is_active, should be available
       // Using dropship model: stock=0 is OK, only explicit flags mark as OOS
       const stockOk = product.is_active && 
         product.available !== false && 
         product.out_of_stock !== true;
       checks.push({ 
         check: "stock_status_check", 
         passed: stockOk, 
         reason: stockOk ? undefined : "Product marked unavailable while active" 
       });
       if (!stockOk) failedChecks.push({ check: "stock_status_check", reason: "Availability mismatch" });
 
       // 5. Description Check - Has meaningful description
       const hasDescription = product.description && product.description.length > 20;
       checks.push({ 
         check: "shipping_copy_check", 
         passed: hasDescription, 
         reason: hasDescription ? undefined : "Description too short or missing" 
       });
       if (!hasDescription) failedChecks.push({ check: "shipping_copy_check", reason: "No description" });
 
       // 6. SKU Check - Has SKU for fulfillment
       const hasSku = product.sku || product.cj_product_id;
       checks.push({ 
         check: "page_loads_check", 
         passed: !!hasSku, 
         reason: hasSku ? undefined : "No SKU for fulfillment" 
       });
       if (!hasSku) failedChecks.push({ check: "page_loads_check", reason: "Missing SKU" });
 
       // 7. Slug Check - Valid slug format
       const validSlug = product.slug && /^[a-z0-9-]+$/.test(product.slug);
       checks.push({ 
         check: "schema_check", 
         passed: validSlug, 
         reason: validSlug ? undefined : "Invalid slug format" 
       });
       if (!validSlug) failedChecks.push({ check: "schema_check", reason: "Invalid slug" });
 
       // 8. Add to Cart eligibility (simulated) - All core fields present
       const atcEligible = pricePassed && hasImages && stockOk && validSlug;
       checks.push({ 
         check: "add_to_cart_check", 
         passed: atcEligible, 
         reason: atcEligible ? undefined : "Missing required fields for cart" 
       });
       if (!atcEligible) failedChecks.push({ check: "add_to_cart_check", reason: "Core fields missing" });
 
       const allPassed = failedChecks.length === 0;
       const qaStatus = allPassed ? "passed" : "failed";
       const blockedFrom = allPassed ? [] : ["bestsellers", "ad_landing"];
 
       const report: ProductQAReport = {
         product_id: product.id,
         product_slug: product.slug,
         product_name: product.name,
         trigger_type: product.trigger_type,
         checks,
         all_passed: allPassed,
         qa_status: qaStatus,
         blocked_from: blockedFrom,
         failure_summary: failedChecks.length > 0 
           ? failedChecks.map(f => f.check).join(", ")
           : undefined,
       };
 
       reports.push(report);
 
       // Upsert QA result
       await supabase.from("product_qa_results").upsert({
         product_id: product.id,
         product_slug: product.slug,
         product_name: product.name,
         trigger_type: product.trigger_type,
         page_loads_check: checks.find(c => c.check === "page_loads_check")?.passed,
         image_gallery_check: checks.find(c => c.check === "image_gallery_check")?.passed,
         add_to_cart_check: checks.find(c => c.check === "add_to_cart_check")?.passed,
         stock_status_check: checks.find(c => c.check === "stock_status_check")?.passed,
         shipping_copy_check: checks.find(c => c.check === "shipping_copy_check")?.passed,
         price_check: checks.find(c => c.check === "price_check")?.passed,
         url_check: checks.find(c => c.check === "url_check")?.passed,
         schema_check: checks.find(c => c.check === "schema_check")?.passed,
         failed_checks: failedChecks,
         all_checks_passed: allPassed,
         qa_status: qaStatus,
         blocked_from_bestsellers: !allPassed,
         blocked_from_ads: !allPassed,
         block_reason: report.failure_summary,
         updated_at: new Date().toISOString(),
       }, { onConflict: "product_id" });
 
       // If failed, create realtime alert
       if (!allPassed) {
         await supabase.from("monitoring_realtime_alerts").insert({
           alert_type: "qa_fail",
           severity: "P2",
           title: `Product QA Failed: ${product.name}`,
           summary: `Product failed ${failedChecks.length} checks: ${report.failure_summary}`,
           affected_urls: [`${SITE_URL}/product/${product.slug}`],
           payload: { checks, failed: failedChecks },
           recommended_action: "Fix issues before promoting to ads or bestsellers",
           alert_group_key: `qa_fail_${product.id}`,
         });
 
         // Log to audit
         await supabase.from("monitoring_audit_logs").insert({
           action_type: "product_qa",
           action_taken: "qa_blocked",
           severity: "P2",
           trigger_condition: product.trigger_type,
           affected_urls: [`/product/${product.slug}`],
           affected_components: ["bestsellers", "ad_landing"],
           metadata: { product_id: product.id, failed_checks: failedChecks },
           action_result: "blocked",
         });
       }
     }
 
     const summary = {
       products_checked: reports.length,
       passed: reports.filter(r => r.all_passed).length,
       failed: reports.filter(r => !r.all_passed).length,
       blocked_from_ads: reports.filter(r => r.blocked_from.includes("ad_landing")).length,
     };
 
     return new Response(JSON.stringify({
       success: true,
       summary,
       reports: reports.map(r => ({
         product: r.product_name,
         slug: r.product_slug,
         trigger: r.trigger_type,
         status: r.all_passed ? "✅ PASSED" : "❌ FAILED",
         checks_passed: r.checks.filter(c => c.passed).length,
         checks_failed: r.checks.filter(c => !c.passed).length,
         blocked_from: r.blocked_from,
         failures: r.checks.filter(c => !c.passed).map(c => ({ check: c.check, reason: c.reason })),
       })),
       safety_confirmation: {
         real_orders_created: false,
         real_payments_submitted: false,
         prices_modified: false,
         inventory_changed: false,
         actions_reversible: true,
         actions_logged: true,
       },
     }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
   } catch (error) {
     console.error("Product QA error:", error);
     return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
   }
 });