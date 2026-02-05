 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 interface TaperAction {
   platform: string;
   trigger_type: string;
   trigger_id: string | null;
   original_budget_percent: number;
   tapered_budget_percent: number;
   taper_reason: string;
   affected_urls: string[];
   is_recommendation: boolean;
 }
 
 // ⚠️ SAFETY RULES:
 // - NEVER exceed 50% reduction without human confirmation
 // - NEVER reduce when status is GO
 // - All actions are reversible
 // - Budget actions are RECOMMENDATIONS only (no direct API calls)
 
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
     const actions: TaperAction[] = [];
 
     // ════════════════════════════════════════════
     // Get Current Status & Predictive Alerts
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
     const currentScore = goNogoDetails?.score || 100;
     const affectedPages = goNogoDetails?.affected_pages || [];
 
     // Check for active predictive alerts
     const { data: activePredictiveAlerts } = await supabase
       .from("monitoring_predictive_alerts")
       .select("*")
       .eq("is_active", true)
       .order("created_at", { ascending: false });
 
     const hasPredictiveAlert = activePredictiveAlerts && activePredictiveAlerts.length > 0;
     const highRiskAlert = activePredictiveAlerts?.find(a => a.risk_level === "high");
 
     // ════════════════════════════════════════════
     // Determine Taper Level
     // ════════════════════════════════════════════
     let taperPercent = 0;
     let triggerType = "";
     let triggerId: string | null = null;
     let taperReason = "";
 
     // SAFETY: Never reduce when GO
    if (currentStatus === "GO" && !hasPredictiveAlert) {  
       // Check for existing tapers to revert
       const { data: existingTapers } = await supabase
         .from("monitoring_budget_tapers")
         .select("*")
         .is("reverted_at", null)
         .order("created_at", { ascending: false });
 
       if (existingTapers && existingTapers.length > 0) {
         // Recommend reverting all tapers
         for (const taper of existingTapers) {
           await supabase
             .from("monitoring_budget_tapers")
             .update({ 
               reverted_at: now.toISOString(), 
               revert_reason: "Status returned to GO - safe to restore budgets" 
             })
             .eq("id", taper.id);
 
           await supabase.from("monitoring_audit_logs").insert({
             severity: "INFO",
             action_type: "budget_restore",
             trigger_condition: "GO status restored",
             affected_urls: taper.affected_urls,
             action_taken: `Recommended: Restore ${taper.platform} budget from ${taper.tapered_budget_percent}% to 100%`,
             action_result: "recommendation_created",
             is_recommendation: true,
             metadata: { platform: taper.platform, previous_taper: taper.tapered_budget_percent },
           });
         }
 
         // Send restore notification
         const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
         if (RESEND_API_KEY) {
           await fetch("https://api.resend.com/emails", {
             method: "POST",
             headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
             body: JSON.stringify({
               from: "Budget Controller <alerts@getpawsy.pet>",
               to: ["support@getpawsy.pet"],
               subject: `✅ [ALL CLEAR] Restore Ad Budgets - Status is GO`,
               html: `
                 <div style="font-family: sans-serif; max-width: 600px;">
                   <div style="background: #ecfdf5; padding: 20px; border-radius: 12px; border-left: 6px solid #16a34a;">
                     <h2 style="margin: 0; color: #065f46;">✅ Safe to Restore Ad Budgets</h2>
                     <p style="margin: 8px 0 0; color: #047857;">
                       Store health has returned to <strong>🟢 GO</strong>.
                       You can restore all previously tapered budgets.
                     </p>
                   </div>
                   <p style="margin-top: 16px;">Platforms affected: ${existingTapers.map(t => t.platform).join(", ")}</p>
                 </div>`,
             }),
           });
         }
 
         return new Response(JSON.stringify({
           success: true,
           action: "restore",
           message: "Status is GO - recommended restoring all budgets",
           tapers_reverted: existingTapers.length,
           safety_confirmation: "⚠️ All actions are recommendations only. No direct API calls made.",
         }), { 
           status: 200, 
           headers: { ...corsHeaders, "Content-Type": "application/json" } 
         });
       }
 
       return new Response(JSON.stringify({
         success: true,
         action: "none",
         message: "Status is GO - no tapering needed",
         current_status: currentStatus,
         safety_confirmation: "⚠️ No budget changes when status is GO.",
       }), { 
         status: 200, 
         headers: { ...corsHeaders, "Content-Type": "application/json" } 
       });
     }
 
     // ════════════════════════════════════════════
     // Calculate Taper Amount
     // ════════════════════════════════════════════
     
     // High-risk predictive alert: 50% reduction (max without human confirmation)
     if (highRiskAlert) {
       taperPercent = 50;
       triggerType = "predictive_alert";
       triggerId = highRiskAlert.id;
       taperReason = `High-risk predictive alert: ${(highRiskAlert.indicators as any[])?.map((i: any) => i.name).join(", ")}`;
     }
    // NO-GO status: handled by ad-pause-controller, not tapering
    // Budget taper is for SOFT LANDINGS only (CAUTION or predictive alerts)
    else if (currentStatus === "NO-GO") {
      // Don't taper on NO-GO - the ad-pause-controller handles full pauses
      return new Response(JSON.stringify({
        success: true,
        action: "none",
        message: "NO-GO status - use ad-pause-controller for full pause, not budget taper",
        current_status: currentStatus,
        current_score: currentScore,
        safety_confirmation: "⚠️ Budget tapering is for soft landings only. Full pauses handled separately.",
      }), { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
     // CAUTION status with predictive alert: 40% reduction
     else if (currentStatus === "CAUTION" && hasPredictiveAlert) {
       taperPercent = 40;
       triggerType = "caution_with_prediction";
       triggerId = activePredictiveAlerts![0].id;
       taperReason = `CAUTION status (${currentScore}%) with active predictive alert`;
     }
     // CAUTION status alone: 25% reduction
     else if (currentStatus === "CAUTION") {
       taperPercent = 25;
       triggerType = "caution_status";
       triggerId = latestGoNogo?.id || null;
       taperReason = `CAUTION status with score ${currentScore}%`;
     }
     // Predictive alert alone (still GO but trending negative): 25% reduction
     else if (hasPredictiveAlert) {
       taperPercent = 25;
       triggerType = "predictive_alert";
       triggerId = activePredictiveAlerts![0].id;
       taperReason = `Predictive alert: ${(activePredictiveAlerts![0].indicators as any[])?.map((i: any) => i.name).join(", ")}`;
     }
 
     // ════════════════════════════════════════════
     // Generate Taper Recommendations
     // ════════════════════════════════════════════
     if (taperPercent > 0) {
       const platforms = ["google_ads", "pinterest"];
       const allAffectedUrls = [
         ...affectedPages,
         ...(activePredictiveAlerts?.flatMap(a => a.affected_urls || []) || [])
       ];
 
       // Check for existing active tapers
       const { data: existingTapers } = await supabase
         .from("monitoring_budget_tapers")
         .select("platform, tapered_budget_percent")
         .is("reverted_at", null);
 
       const existingTaperMap = new Map(existingTapers?.map(t => [t.platform, t.tapered_budget_percent]) || []);
 
       for (const platform of platforms) {
         const existingTaperPercent = existingTaperMap.get(platform);
         
         // Only create new taper if more aggressive than existing
         if (!existingTaperPercent || (100 - taperPercent) < existingTaperPercent) {
           const action: TaperAction = {
             platform,
             trigger_type: triggerType,
             trigger_id: triggerId,
             original_budget_percent: 100,
             tapered_budget_percent: 100 - taperPercent,
             taper_reason: taperReason,
             affected_urls: [...new Set(allAffectedUrls)].slice(0, 10),
             is_recommendation: true, // Always recommendation - no direct API calls
           };
 
           actions.push(action);
 
           // Store taper action
           await supabase.from("monitoring_budget_tapers").insert({
             platform: action.platform,
             trigger_type: action.trigger_type,
             trigger_id: action.trigger_id,
             original_budget_percent: action.original_budget_percent,
             tapered_budget_percent: action.tapered_budget_percent,
             taper_reason: action.taper_reason,
             affected_urls: action.affected_urls,
             is_recommendation: true,
           });
 
           // Audit log
           await supabase.from("monitoring_audit_logs").insert({
             severity: taperPercent >= 40 ? "P1" : "P2",
             action_type: "budget_taper",
             trigger_condition: taperReason,
             affected_urls: action.affected_urls,
             action_taken: `Recommended: Reduce ${platform} budget to ${action.tapered_budget_percent}%`,
             action_result: "recommendation_created",
             is_recommendation: true,
             metadata: { 
               platform, 
               taper_percent: taperPercent,
               trigger_type: triggerType,
             },
           });
         }
       }
 
       // Send notification
       if (actions.length > 0) {
         const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
         if (RESEND_API_KEY) {
           const color = taperPercent >= 40 ? "#dc2626" : "#f59e0b";
           const bgColor = taperPercent >= 40 ? "#fee2e2" : "#fef3c7";
 
           await fetch("https://api.resend.com/emails", {
             method: "POST",
             headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
             body: JSON.stringify({
               from: "Budget Controller <alerts@getpawsy.pet>",
               to: ["support@getpawsy.pet"],
               subject: `📉 [SOFT LANDING] Reduce Ad Budgets by ${taperPercent}%`,
               html: `
                 <div style="font-family: sans-serif; max-width: 600px;">
                   <div style="background: ${bgColor}; padding: 20px; border-radius: 12px; border-left: 6px solid ${color};">
                     <h2 style="margin: 0; color: ${color};">📉 Budget Taper Recommended</h2>
                     <p style="margin: 8px 0 0; color: #666;">
                       Reduce budgets by <strong>${taperPercent}%</strong> to minimize ad waste.
                     </p>
                   </div>
 
                   <div style="margin-top: 16px; background: #f3f4f6; padding: 16px; border-radius: 8px;">
                     <h3 style="margin: 0 0 8px;">Reason:</h3>
                     <p style="margin: 0;">${taperReason}</p>
                   </div>
 
                   <h3 style="margin-top: 20px;">Recommended Actions:</h3>
                   ${actions.map(a => `
                     <div style="background: #f9fafb; padding: 12px; border-radius: 6px; margin: 8px 0; border: 1px solid #e5e7eb;">
                       <strong>${a.platform.toUpperCase()}</strong>: 
                       Reduce budget from 100% to <strong>${a.tapered_budget_percent}%</strong>
                       ${a.affected_urls.length > 0 ? `
                         <div style="font-size: 12px; color: #666; margin-top: 4px;">
                           Focus on campaigns targeting: ${a.affected_urls.slice(0, 3).join(", ")}
                         </div>
                       ` : ""}
                     </div>
                   `).join("")}
 
                   <p style="margin-top: 20px; padding: 12px; background: #ecfdf5; border-radius: 6px; font-size: 13px;">
                     ✅ <strong>Safety:</strong> This is a recommendation only. Budgets will auto-restore when status returns to 🟢 GO.
                   </p>
                 </div>`,
             }),
           });
         }
       }
     }
 
     return new Response(JSON.stringify({
       success: true,
       action: taperPercent > 0 ? "taper" : "none",
       current_status: currentStatus,
       current_score: currentScore,
       has_predictive_alert: hasPredictiveAlert,
       taper_percent: taperPercent,
       taper_reason: taperReason || "No tapering needed",
       actions_created: actions.length,
       actions,
       safety_confirmation: "⚠️ All actions are RECOMMENDATIONS only. No direct ad platform API calls. Never exceeds 50% without human confirmation. Fully reversible.",
     }), { 
       status: 200, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   } catch (error) {
     console.error("Budget taper error:", error);
     return new Response(JSON.stringify({ 
       error: error instanceof Error ? error.message : "Unknown error" 
     }), { 
       status: 500, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   }
 });