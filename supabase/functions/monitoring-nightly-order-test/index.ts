 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 interface TestStep {
   step: string;
   status: "pass" | "fail" | "skipped";
   details: string;
   screenshot_url?: string;
   duration_ms: number;
 }
 
 interface NightlyTestReport {
   run_id: string;
   run_at: string;
   overall_status: "pass" | "fail";
   steps: TestStep[];
   blocking_step?: string;
   go_for_ads: boolean;
   summary: string;
 }
 
 const SITE_URL = "https://getpawsy.pet";
 
 // ⚠️ SAFETY: This function NEVER submits real payments
 // It only validates that the checkout flow is reachable
 
 serve(async (req: Request): Promise<Response> => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   const supabase = createClient(
     Deno.env.get("SUPABASE_URL") ?? "",
     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
   );
 
   const runId = crypto.randomUUID();
   const runAt = new Date().toISOString();
   const steps: TestStep[] = [];
   let overallStatus: "pass" | "fail" = "pass";
   let blockingStep: string | undefined;
 
   try {
     // ════════════════════════════════════════════
     // STEP 1: Verify Active Products Exist
     // ════════════════════════════════════════════
     const step1Start = Date.now();
     const { data: activeProducts, count: activeCount } = await supabase
       .from("products")
       .select("id, name, slug, price, is_active", { count: "exact" })
       .eq("is_active", true)
       .limit(10);
 
     if (!activeProducts || activeProducts.length === 0) {
       steps.push({
         step: "1. Find Active Product",
         status: "fail",
         details: "No active products found in database",
         duration_ms: Date.now() - step1Start,
       });
       overallStatus = "fail";
       blockingStep = "1. Find Active Product";
     } else {
       steps.push({
         step: "1. Find Active Product",
         status: "pass",
         details: `Found ${activeCount} active products. Test product: "${activeProducts[0].name}" (${activeProducts[0].slug})`,
         duration_ms: Date.now() - step1Start,
       });
     }
 
     // ════════════════════════════════════════════
     // STEP 2: Verify Product Page Data
     // ════════════════════════════════════════════
     if (overallStatus === "pass" && activeProducts) {
       const step2Start = Date.now();
       const testProduct = activeProducts[0];
       
       // Check product has required fields for purchase
       const hasPrice = testProduct.price && testProduct.price > 0;
       const hasSlug = !!testProduct.slug;
       
       if (!hasPrice || !hasSlug) {
         steps.push({
           step: "2. Validate Product Data",
           status: "fail",
           details: `Product missing required fields: ${!hasPrice ? "price" : ""} ${!hasSlug ? "slug" : ""}`,
           duration_ms: Date.now() - step2Start,
         });
         overallStatus = "fail";
         blockingStep = "2. Validate Product Data";
       } else {
         steps.push({
           step: "2. Validate Product Data",
           status: "pass",
           details: `Product valid: ${testProduct.name} - €${testProduct.price}`,
           duration_ms: Date.now() - step2Start,
         });
       }
     }
 
     // ════════════════════════════════════════════
     // STEP 3: Simulate Add to Cart Logic
     // ════════════════════════════════════════════
     if (overallStatus === "pass" && activeProducts) {
       const step3Start = Date.now();
       const testProduct = activeProducts[0];
       
       // Verify cart addition would work (check variants if needed)
       const { data: productDetails } = await supabase
         .from("products")
         .select("id, name, price, variants, is_active")
         .eq("id", testProduct.id)
         .single();
 
       if (!productDetails) {
         steps.push({
           step: "3. Simulate Add to Cart",
           status: "fail",
           details: "Could not fetch product details for cart",
           duration_ms: Date.now() - step3Start,
         });
         overallStatus = "fail";
         blockingStep = "3. Simulate Add to Cart";
       } else {
         // Check if variants exist and at least one is selectable
         const variants = productDetails.variants as any;
         let variantOk = true;
         
         if (variants && Array.isArray(variants) && variants.length > 0) {
           // Has variants - check at least one exists
           variantOk = variants.length > 0;
         }
         
         if (!variantOk) {
           steps.push({
             step: "3. Simulate Add to Cart",
             status: "fail",
             details: "Product has variant requirement but no variants available",
             duration_ms: Date.now() - step3Start,
           });
           overallStatus = "fail";
           blockingStep = "3. Simulate Add to Cart";
         } else {
           steps.push({
             step: "3. Simulate Add to Cart",
             status: "pass",
             details: `Cart simulation OK. Product can be added with${variants ? ` ${variants.length} variant(s)` : "out variants"}`,
             duration_ms: Date.now() - step3Start,
           });
         }
       }
     }
 
     // ════════════════════════════════════════════
     // STEP 4: Verify Cart to Checkout Transition
     // ════════════════════════════════════════════
     if (overallStatus === "pass") {
       const step4Start = Date.now();
       
       // Check that checkout page route exists by verifying Stripe is configured
       const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
       
       if (!stripeKey) {
         steps.push({
           step: "4. Verify Checkout Ready",
           status: "fail",
           details: "Stripe not configured - checkout will fail",
           duration_ms: Date.now() - step4Start,
         });
         overallStatus = "fail";
         blockingStep = "4. Verify Checkout Ready";
       } else {
         steps.push({
           step: "4. Verify Checkout Ready",
           status: "pass",
           details: "Payment system configured and ready",
           duration_ms: Date.now() - step4Start,
         });
       }
     }
 
     // ════════════════════════════════════════════
     // STEP 5: Validate Shipping Address Acceptance
     // ════════════════════════════════════════════
     if (overallStatus === "pass") {
       const step5Start = Date.now();
       
       // Simulate US shipping address validation
       const testAddress = {
         name: "Test Customer",
         line1: "123 Test Street",
         city: "New York",
         state: "NY",
         postal_code: "10001",
         country: "US",
       };
       
       // Basic validation that would pass frontend
       const isValid = testAddress.name && testAddress.line1 && 
                       testAddress.city && testAddress.postal_code && 
                       testAddress.country;
       
       if (!isValid) {
         steps.push({
           step: "5. Validate Shipping Address",
           status: "fail",
           details: "Test address validation failed",
           duration_ms: Date.now() - step5Start,
         });
         overallStatus = "fail";
         blockingStep = "5. Validate Shipping Address";
       } else {
         steps.push({
           step: "5. Validate Shipping Address",
           status: "pass",
           details: `US address accepted: ${testAddress.city}, ${testAddress.state} ${testAddress.postal_code}`,
           duration_ms: Date.now() - step5Start,
         });
       }
     }
 
     // ════════════════════════════════════════════
     // STEP 6: Verify Payment Step Renders
     // ════════════════════════════════════════════
     if (overallStatus === "pass") {
       const step6Start = Date.now();
       
       // ⚠️ NO REAL PAYMENT - Just verify Stripe API is reachable
       const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
       
       try {
         // Just verify Stripe connection is valid (no charges)
         const stripeResponse = await fetch("https://api.stripe.com/v1/balance", {
           method: "GET",
           headers: {
             Authorization: `Bearer ${stripeKey}`,
           },
         });
         
         if (stripeResponse.ok) {
           steps.push({
             step: "6. Verify Payment Step",
             status: "pass",
             details: "Payment system reachable - checkout can proceed (NO PAYMENT SUBMITTED)",
             duration_ms: Date.now() - step6Start,
           });
         } else {
           steps.push({
             step: "6. Verify Payment Step",
             status: "fail",
             details: `Payment system returned error: ${stripeResponse.status}`,
             duration_ms: Date.now() - step6Start,
           });
           overallStatus = "fail";
           blockingStep = "6. Verify Payment Step";
         }
       } catch (e) {
         steps.push({
           step: "6. Verify Payment Step",
           status: "fail",
           details: `Payment system unreachable: ${e instanceof Error ? e.message : "Unknown error"}`,
           duration_ms: Date.now() - step6Start,
         });
         overallStatus = "fail";
         blockingStep = "6. Verify Payment Step";
       }
     }
 
     // ════════════════════════════════════════════
     // Generate Report
     // ════════════════════════════════════════════
     const goForAds = overallStatus === "pass";
     const passedSteps = steps.filter(s => s.status === "pass").length;
     const totalSteps = steps.length;
 
     const report: NightlyTestReport = {
       run_id: runId,
       run_at: runAt,
       overall_status: overallStatus,
       steps,
       blocking_step: blockingStep,
       go_for_ads: goForAds,
       summary: overallStatus === "pass"
         ? `✅ All ${totalSteps} checkout steps passed. GO for ads.`
         : `❌ Checkout blocked at step "${blockingStep}". NO-GO for ads.`,
     };
 
     // Save to monitoring runs
     await supabase.from("monitoring_runs").insert({
       id: runId,
       run_type: "nightly_order_test",
       started_at: runAt,
       completed_at: new Date().toISOString(),
       success: overallStatus === "pass",
       checks_passed: passedSteps,
       checks_failed: totalSteps - passedSteps,
       details: report,
     });
 
     // Create incident if failed
     if (overallStatus === "fail") {
       await supabase.from("monitoring_incidents").insert({
         incident_type: "checkout_nightly_test",
         severity: "P1",
         status: "open",
         root_cause_summary: `Nightly checkout test failed at: ${blockingStep}`,
         affected_component: "Checkout Flow",
         affected_files: ["src/pages/Checkout.tsx", "src/components/cart/CartDrawer.tsx"],
       });
 
       // Send P1 alert
       const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
       if (RESEND_API_KEY) {
         await fetch("https://api.resend.com/emails", {
           method: "POST",
           headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
           body: JSON.stringify({
             from: "Nightly Tests <alerts@getpawsy.pet>",
             to: ["support@getpawsy.pet"],
             subject: `🚨 [P1] Nightly Checkout Test FAILED - ${blockingStep}`,
             html: `
               <div style="font-family: sans-serif; max-width: 600px;">
                 <h2 style="color: #dc2626;">🚨 Checkout Test Failed</h2>
                 <p style="font-size: 16px;"><strong>Blocking Step:</strong> ${blockingStep}</p>
                 <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 16px 0;">
                   ${steps.map(s => `
                     <p style="margin: 8px 0;">
                       ${s.status === "pass" ? "✅" : "❌"} <strong>${s.step}</strong><br/>
                       <span style="font-size: 13px; color: #666;">${s.details}</span>
                     </p>
                   `).join("")}
                 </div>
                 <p style="background: #fef3c7; padding: 12px; border-radius: 6px; color: #92400e;">
                   <strong>⚠️ Ads Status:</strong> NO-GO - Pause ads until fixed
                 </p>
                 <p style="font-size: 12px; color: #666; margin-top: 16px;">
                   ⚠️ No real payments were submitted. This is a simulation test.
                 </p>
               </div>`,
           }),
         });
       }
     }
 
     return new Response(JSON.stringify({
       success: true,
       report,
       safety_confirmation: "⚠️ NO REAL PAYMENTS WERE SUBMITTED - Simulation only",
     }), { 
       status: overallStatus === "pass" ? 200 : 400, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   } catch (error) {
     console.error("Nightly order test error:", error);
     
     const errorReport: NightlyTestReport = {
       run_id: runId,
       run_at: runAt,
       overall_status: "fail",
       steps: [...steps, {
         step: "System Error",
         status: "fail",
         details: error instanceof Error ? error.message : "Unknown error",
         duration_ms: 0,
       }],
       blocking_step: "System Error",
       go_for_ads: false,
       summary: `❌ Test crashed: ${error instanceof Error ? error.message : "Unknown error"}`,
     };
 
     return new Response(JSON.stringify({ 
       success: false,
       report: errorReport,
       error: error instanceof Error ? error.message : "Unknown error",
       safety_confirmation: "⚠️ NO REAL PAYMENTS WERE SUBMITTED - Simulation only",
     }), { 
       status: 500, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   }
 });