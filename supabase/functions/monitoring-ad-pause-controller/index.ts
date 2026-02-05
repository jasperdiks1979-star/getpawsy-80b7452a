 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 interface AdPauseAction {
   action_type: "pause" | "resume" | "recommendation";
   platform: string;
   campaign_ids: string[];
   affected_urls: string[];
   trigger_reason: string;
   trigger_status: string;
   is_recommendation: boolean;
 }
 
 // ⚠️ SAFETY: This function NEVER modifies prices, inventory, or creates orders
 // All ad platform actions are reversible
 
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
     const mode = body.mode || "check"; // "check" | "execute"
     
     // ════════════════════════════════════════════
     // Get Latest GO/NO-GO Status
     // ════════════════════════════════════════════
     const { data: latestGoNogo } = await supabase
       .from("monitoring_runs")
       .select("id, success, details, completed_at")
       .eq("run_type", "daily_go_nogo")
       .order("completed_at", { ascending: false })
       .limit(1)
       .single();
 
     const goNogoDetails = latestGoNogo?.details as any;
     const currentStatus = goNogoDetails?.status || "UNKNOWN";
     const blockingIssues = goNogoDetails?.blocking_issues || [];
     const affectedPages = goNogoDetails?.affected_pages || [];
 
     // ════════════════════════════════════════════
     // Check for Active P1 Issues
     // ════════════════════════════════════════════
     const { data: activeP1Alerts } = await supabase
       .from("monitoring_alerts")
       .select("*")
       .eq("is_active", true)
       .eq("severity", "P1");
 
     const p1Urls = activeP1Alerts?.flatMap(a => a.affected_urls || []) || [];
     const allAffectedUrls = [...new Set([...affectedPages, ...p1Urls])];
 
     // ════════════════════════════════════════════
     // Determine Required Action
     // ════════════════════════════════════════════
     const actions: AdPauseAction[] = [];
     const shouldPause = currentStatus === "NO-GO" || (activeP1Alerts && activeP1Alerts.length > 0);
 
     // Check for existing pause actions that haven't been reverted
     const { data: existingPauses } = await supabase
       .from("monitoring_ad_actions")
       .select("*")
       .eq("action_type", "pause")
       .is("reverted_at", null)
       .order("created_at", { ascending: false });
 
     const hasPendingPause = existingPauses && existingPauses.length > 0;
 
     // ════════════════════════════════════════════
     // Check for Ad Platform Integrations
     // ════════════════════════════════════════════
     const hasPinterestIntegration = !!Deno.env.get("PINTEREST_ACCESS_TOKEN");
     // Note: Google Ads requires OAuth - check for future integration
     const hasGoogleAdsIntegration = false;
 
     if (shouldPause && !hasPendingPause) {
       // ════════════════════════════════════════════
       // Generate PAUSE Actions
       // ════════════════════════════════════════════
       
       // Pinterest Ads
       if (hasPinterestIntegration) {
         actions.push({
           action_type: "recommendation", // Pinterest API doesn't support pause via this token
           platform: "pinterest",
           campaign_ids: [],
           affected_urls: allAffectedUrls,
           trigger_reason: blockingIssues.join("; ") || "P1 issue detected",
           trigger_status: currentStatus,
           is_recommendation: true,
         });
       }
 
       // Google Ads (always recommendation for now)
       actions.push({
         action_type: "recommendation",
         platform: "google_ads",
         campaign_ids: [],
         affected_urls: allAffectedUrls,
         trigger_reason: blockingIssues.join("; ") || "P1 issue detected",
         trigger_status: currentStatus,
         is_recommendation: true,
       });
 
     } else if (!shouldPause && hasPendingPause) {
       // ════════════════════════════════════════════
       // Generate RESUME Actions
       // ════════════════════════════════════════════
       for (const pause of existingPauses || []) {
         actions.push({
           action_type: "recommendation",
           platform: pause.platform,
           campaign_ids: pause.campaign_ids || [],
           affected_urls: pause.affected_urls || [],
           trigger_reason: "Status returned to GO - safe to resume ads",
           trigger_status: currentStatus,
           is_recommendation: true,
         });
       }
     }
 
     // ════════════════════════════════════════════
     // Execute or Store Actions
     // ════════════════════════════════════════════
     const results: any[] = [];
 
     for (const action of actions) {
       // Store action in database
       const { data: storedAction, error: storeError } = await supabase
         .from("monitoring_ad_actions")
         .insert({
           action_type: action.action_type === "recommendation" ? "recommendation" : action.action_type,
           platform: action.platform,
           campaign_ids: action.campaign_ids,
           affected_urls: action.affected_urls,
           trigger_reason: action.trigger_reason,
           trigger_status: action.trigger_status,
           is_recommendation: action.is_recommendation,
         })
         .select()
         .single();
 
       if (storeError) {
         console.error("Failed to store ad action:", storeError);
       }
 
       // Log to audit trail
       await supabase.from("monitoring_audit_logs").insert({
         severity: shouldPause ? "P1" : "INFO",
         action_type: `ad_${action.action_type}`,
         trigger_condition: action.trigger_reason,
         affected_urls: action.affected_urls,
         action_taken: action.is_recommendation 
           ? `Recommended: ${action.action_type} ${action.platform} campaigns`
           : `Executed: ${action.action_type} ${action.platform} campaigns`,
         action_result: action.is_recommendation ? "pending_human_action" : "executed",
         is_recommendation: action.is_recommendation,
         related_run_id: latestGoNogo?.id,
         metadata: { platform: action.platform, campaign_ids: action.campaign_ids },
       });
 
       results.push({
         ...action,
         stored_id: storedAction?.id,
         status: action.is_recommendation ? "recommendation_created" : "executed",
       });
     }
 
     // ════════════════════════════════════════════
     // Send Alert if Actions Required
     // ════════════════════════════════════════════
     if (actions.length > 0) {
       const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
       if (RESEND_API_KEY) {
         const pauseActions = actions.filter(a => a.action_type !== "resume");
         const resumeActions = actions.filter(a => a.action_type === "resume" || 
           (a.trigger_reason.includes("safe to resume")));
 
         if (pauseActions.length > 0) {
           await fetch("https://api.resend.com/emails", {
             method: "POST",
             headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
             body: JSON.stringify({
               from: "Ad Controller <alerts@getpawsy.pet>",
               to: ["support@getpawsy.pet"],
               subject: `🚨 [ACTION REQUIRED] Pause Ads - ${currentStatus}`,
               html: `
                 <div style="font-family: sans-serif; max-width: 600px;">
                   <h2 style="color: #dc2626;">⏸️ Ad Pause Recommended</h2>
                   <p>The store health status is <strong style="color: #dc2626;">${currentStatus}</strong>.</p>
                   
                   <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 16px 0;">
                     <h3 style="margin: 0 0 8px; color: #991b1b;">Blocking Issues:</h3>
                     <ul style="margin: 0; padding-left: 20px;">
                       ${blockingIssues.map((i: string) => `<li>${i}</li>`).join("")}
                     </ul>
                   </div>
 
                   <h3>Recommended Actions:</h3>
                   ${pauseActions.map(a => `
                     <div style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin: 8px 0;">
                       <strong>${a.platform.toUpperCase()}</strong>: Pause campaigns targeting:
                       <ul style="margin: 8px 0 0; padding-left: 20px; font-size: 13px;">
                         ${a.affected_urls.slice(0, 5).map((u: string) => `<li>${u}</li>`).join("")}
                       </ul>
                     </div>
                   `).join("")}
 
                   <p style="margin-top: 20px; font-size: 12px; color: #666;">
                     ⚠️ This is a recommendation. Please manually pause affected campaigns.
                   </p>
                 </div>`,
             }),
           });
         }
 
         if (resumeActions.length > 0) {
           await fetch("https://api.resend.com/emails", {
             method: "POST",
             headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
             body: JSON.stringify({
               from: "Ad Controller <alerts@getpawsy.pet>",
               to: ["support@getpawsy.pet"],
               subject: `✅ [ALL CLEAR] Resume Ads - Status is ${currentStatus}`,
               html: `
                 <div style="font-family: sans-serif; max-width: 600px;">
                   <h2 style="color: #16a34a;">▶️ Safe to Resume Ads</h2>
                   <p>The store health status has returned to <strong style="color: #16a34a;">${currentStatus}</strong>.</p>
                   <p>You can now resume the previously paused ad campaigns.</p>
                 </div>`,
             }),
           });
         }
       }
     }
 
     // Mark previous pauses as reverted if status is GO
     if (!shouldPause && hasPendingPause) {
       await supabase
         .from("monitoring_ad_actions")
         .update({ reverted_at: new Date().toISOString() })
         .eq("action_type", "pause")
         .is("reverted_at", null);
     }
 
     return new Response(JSON.stringify({
       success: true,
       current_status: currentStatus,
       should_pause: shouldPause,
       actions_created: results.length,
       actions: results,
       safety_confirmation: "⚠️ NO prices, inventory, or orders modified. All actions are reversible.",
     }), { 
       status: 200, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   } catch (error) {
     console.error("Ad pause controller error:", error);
     return new Response(JSON.stringify({ 
       error: error instanceof Error ? error.message : "Unknown error" 
     }), { 
       status: 500, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   }
 });