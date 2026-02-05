 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 // ⚠️ SAFETY: This function is READ-ONLY
 // Generates a summary report without modifying any business data
 
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
     const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
     const todayDate = now.toISOString().split("T")[0];
 
     // ════════════════════════════════════════════
     // Gather All Data for Summary
     // ════════════════════════════════════════════
 
     // 1. Latest GO/NO-GO status
     const { data: latestGoNogo } = await supabase
       .from("monitoring_runs")
       .select("*")
       .eq("run_type", "daily_go_nogo")
       .order("completed_at", { ascending: false })
       .limit(1)
       .single();
 
     const goNogoDetails = latestGoNogo?.details as any;
     const currentStatus = goNogoDetails?.status || "UNKNOWN";
     const currentScore = goNogoDetails?.score || 0;
     const statusEmoji = currentStatus === "GO" ? "🟢" : currentStatus === "CAUTION" ? "🟠" : "🔴";
 
     // 2. Yesterday's status for comparison
     const { data: yesterdayGoNogo } = await supabase
       .from("monitoring_runs")
       .select("details")
       .eq("run_type", "daily_go_nogo")
       .lt("completed_at", now.toISOString().split("T")[0])
       .order("completed_at", { ascending: false })
       .limit(1)
       .single();
 
     const yesterdayStatus = (yesterdayGoNogo?.details as any)?.status || "UNKNOWN";
     const yesterdayScore = (yesterdayGoNogo?.details as any)?.score || 0;
 
     // 3. Incidents in last 24h
     const { data: recentIncidents } = await supabase
       .from("monitoring_alerts")
       .select("*")
       .gte("created_at", yesterday.toISOString())
       .order("severity", { ascending: true });
 
     const p1Incidents = recentIncidents?.filter(i => i.severity === "P1") || [];
     const p2Incidents = recentIncidents?.filter(i => i.severity === "P2") || [];
 
     // 4. Actions taken in last 24h
     const { data: recentAuditLogs } = await supabase
       .from("monitoring_audit_logs")
       .select("*")
       .gte("timestamp", yesterday.toISOString())
       .order("timestamp", { ascending: false });
 
     const rollbacks = recentAuditLogs?.filter(l => l.action_type === "rollback") || [];
     const fallbacks = recentAuditLogs?.filter(l => l.action_type === "self_healing") || [];
     const budgetTapers = recentAuditLogs?.filter(l => l.action_type === "budget_taper") || [];
     const adPauses = recentAuditLogs?.filter(l => l.action_type?.includes("ad_")) || [];
 
     // 5. Active predictive alerts
     const { data: predictiveAlerts } = await supabase
       .from("monitoring_predictive_alerts")
       .select("*")
       .eq("is_active", true);
 
     // 6. Nightly checkout test result
     const { data: nightlyTest } = await supabase
       .from("monitoring_runs")
       .select("success, details")
       .eq("run_type", "nightly_order_test")
       .gte("completed_at", yesterday.toISOString())
       .order("completed_at", { ascending: false })
       .limit(1)
       .single();
 
     // ════════════════════════════════════════════
     // Build Context for AI
     // ════════════════════════════════════════════
     const whatChanged: string[] = [];
     
     if (currentStatus !== yesterdayStatus) {
       whatChanged.push(`Status changed from ${yesterdayStatus} to ${currentStatus}`);
     }
     if (Math.abs(currentScore - yesterdayScore) >= 5) {
       whatChanged.push(`Score ${currentScore > yesterdayScore ? "improved" : "dropped"} from ${yesterdayScore}% to ${currentScore}%`);
     }
     if (p1Incidents.length > 0) {
       whatChanged.push(`${p1Incidents.length} new P1 incidents detected`);
     }
     if (rollbacks.length > 0) {
       whatChanged.push(`${rollbacks.length} auto-rollback(s) executed`);
     }
     if (budgetTapers.length > 0) {
       whatChanged.push(`Budget tapering recommended for ${budgetTapers.length} platform(s)`);
     }
 
     const currentRisks = [
       ...(goNogoDetails?.blocking_issues || []).map((i: string) => ({ type: "blocking", description: i })),
       ...(goNogoDetails?.warnings || []).map((w: string) => ({ type: "warning", description: w })),
       ...(predictiveAlerts || []).map(a => ({ 
         type: "predictive", 
         description: `Risk of NO-GO in ~${a.estimated_hours_to_nogo}h: ${(a.indicators as any[])?.map((i: any) => i.name).join(", ")}`
       })),
     ];
 
     const actionsTaken = [
       ...rollbacks.map(r => ({ type: "rollback", description: r.action_taken })),
       ...fallbacks.map(f => ({ type: "fallback", description: f.action_taken })),
       ...budgetTapers.map(b => ({ type: "budget_taper", description: b.action_taken })),
       ...adPauses.map(a => ({ type: "ad_action", description: a.action_taken })),
     ];
 
     // ════════════════════════════════════════════
     // Generate AI Summary using Lovable AI
     // ════════════════════════════════════════════
     const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
     
     let aiSummary = "";
     let recommendation = "";
     let confidenceLevel = "medium";
 
     if (LOVABLE_API_KEY) {
       const prompt = `You are a concise e-commerce operations analyst. Generate a 60-second daily briefing for a shop owner about their store's health for running paid ads.
 
 Current Status: ${statusEmoji} ${currentStatus} (Score: ${currentScore}%)
 Yesterday's Status: ${yesterdayStatus} (Score: ${yesterdayScore}%)
 
 What Changed Since Yesterday:
 ${whatChanged.length > 0 ? whatChanged.map(c => `- ${c}`).join("\n") : "- No significant changes"}
 
 Incidents Detected (24h):
 - P1 (Critical): ${p1Incidents.length} ${p1Incidents.length > 0 ? `(${p1Incidents.map(i => i.title).join(", ")})` : ""}
 - P2 (Warning): ${p2Incidents.length}
 
 Actions Taken:
 ${actionsTaken.length > 0 ? actionsTaken.map(a => `- ${a.type}: ${a.description}`).join("\n") : "- No automated actions taken"}
 
 Current Risks:
 ${currentRisks.length > 0 ? currentRisks.map(r => `- [${r.type}] ${r.description}`).join("\n") : "- No active risks"}
 
 Nightly Checkout Test: ${nightlyTest?.success ? "✅ PASSED" : nightlyTest ? "❌ FAILED" : "⚠️ NOT RUN"}
 
 Write a brief summary (3-4 sentences max) in plain English that:
 1. States the overall health status clearly
 2. Highlights the most important change or risk
 3. Ends with a clear recommendation: "Scale ads", "Maintain current spend", "Investigate before scaling", or "Pause ads immediately"
 
 Be direct and actionable. No technical jargon.`;
 
       try {
         const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
           method: "POST",
           headers: {
             Authorization: `Bearer ${LOVABLE_API_KEY}`,
             "Content-Type": "application/json",
           },
           body: JSON.stringify({
             model: "google/gemini-2.5-flash",
             messages: [
               { role: "system", content: "You are a concise e-commerce operations analyst. Keep responses under 100 words." },
               { role: "user", content: prompt },
             ],
           }),
         });
 
         if (aiResponse.ok) {
           const aiData = await aiResponse.json();
           aiSummary = aiData.choices?.[0]?.message?.content || "";
 
           // Extract recommendation from summary
           if (aiSummary.toLowerCase().includes("scale ads")) {
             recommendation = "Scale ads";
             confidenceLevel = "high";
           } else if (aiSummary.toLowerCase().includes("pause")) {
             recommendation = "Pause";
             confidenceLevel = "high";
           } else if (aiSummary.toLowerCase().includes("investigate")) {
             recommendation = "Investigate";
             confidenceLevel = "medium";
           } else {
             recommendation = "Maintain";
             confidenceLevel = "medium";
           }
         }
       } catch (aiError) {
         console.error("AI generation error:", aiError);
       }
     }
 
     // Fallback summary if AI fails
     if (!aiSummary) {
       if (currentStatus === "GO" && p1Incidents.length === 0) {
         aiSummary = `Your store is healthy with a ${currentScore}% health score. No critical issues detected in the last 24 hours. The checkout flow is working correctly. Recommendation: Scale ads confidently.`;
         recommendation = "Scale ads";
         confidenceLevel = "high";
       } else if (currentStatus === "CAUTION") {
         aiSummary = `Your store health is at ${currentScore}% with ${goNogoDetails?.warnings?.length || 0} warning(s). ${whatChanged[0] || "Minor issues detected."}. The checkout is ${nightlyTest?.success ? "working" : "untested"}. Recommendation: Maintain current spend while investigating.`;
         recommendation = "Investigate";
         confidenceLevel = "medium";
       } else {
         aiSummary = `⚠️ Your store is in NO-GO status (${currentScore}%). ${goNogoDetails?.blocking_issues?.[0] || "Critical issues detected."}. Ads should be paused until issues are resolved. Recommendation: Pause ads immediately.`;
         recommendation = "Pause";
         confidenceLevel = "high";
       }
     }
 
     // ════════════════════════════════════════════
     // Store Summary
     // ════════════════════════════════════════════
     const { data: existingSummary } = await supabase
       .from("monitoring_ai_summaries")
       .select("id")
       .eq("summary_date", todayDate)
       .single();
 
     const summaryData = {
       summary_date: todayDate,
       status: currentStatus,
       status_emoji: statusEmoji,
       score: currentScore,
       ai_summary: aiSummary,
       what_changed: whatChanged,
       incidents: { p1: p1Incidents.length, p2: p2Incidents.length, details: recentIncidents?.slice(0, 5) },
       actions_taken: actionsTaken,
       current_risks: currentRisks,
       confidence_level: confidenceLevel,
       recommendation,
       model_used: LOVABLE_API_KEY ? "google/gemini-2.5-flash" : "fallback",
     };
 
     if (existingSummary) {
       await supabase
         .from("monitoring_ai_summaries")
         .update(summaryData)
         .eq("id", existingSummary.id);
     } else {
       await supabase.from("monitoring_ai_summaries").insert(summaryData);
     }
 
     // Log to audit
     await supabase.from("monitoring_audit_logs").insert({
       severity: "INFO",
       action_type: "daily_ai_summary",
       trigger_condition: "Scheduled daily summary generation",
       action_taken: `Generated AI summary: ${recommendation}`,
       action_result: "summary_created",
       is_recommendation: false,
       metadata: { status: currentStatus, score: currentScore, recommendation },
     });
 
     // ════════════════════════════════════════════
     // Send Email Summary
     // ════════════════════════════════════════════
     const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
     if (RESEND_API_KEY) {
       const statusColor = currentStatus === "GO" ? "#16a34a" : currentStatus === "CAUTION" ? "#f59e0b" : "#dc2626";
       const statusBg = currentStatus === "GO" ? "#ecfdf5" : currentStatus === "CAUTION" ? "#fef3c7" : "#fee2e2";
 
       await fetch("https://api.resend.com/emails", {
         method: "POST",
         headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
         body: JSON.stringify({
           from: "Daily Briefing <alerts@getpawsy.pet>",
           to: ["support@getpawsy.pet"],
           subject: `${statusEmoji} Daily Briefing: ${recommendation} - GetPawsy (${todayDate})`,
           html: `
             <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
               <div style="background: ${statusBg}; padding: 24px; border-radius: 12px; border-left: 6px solid ${statusColor}; margin-bottom: 20px;">
                 <div style="text-align: center;">
                   <span style="font-size: 48px;">${statusEmoji}</span>
                   <h1 style="margin: 8px 0; color: ${statusColor}; font-size: 28px;">${currentStatus}</h1>
                   <p style="margin: 0; font-size: 18px; color: ${statusColor};">${currentScore}% Health Score</p>
                 </div>
               </div>
 
               <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                 <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">${aiSummary}</p>
               </div>
 
               <div style="background: ${statusColor}; color: white; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                 <p style="margin: 0; font-size: 14px; opacity: 0.9;">TODAY'S RECOMMENDATION</p>
                 <p style="margin: 8px 0 0; font-size: 20px; font-weight: bold;">${recommendation.toUpperCase()}</p>
               </div>
 
               ${whatChanged.length > 0 ? `
               <div style="margin-bottom: 20px;">
                 <h3 style="margin: 0 0 12px; font-size: 14px; color: #6b7280;">WHAT CHANGED</h3>
                 <ul style="margin: 0; padding-left: 20px; color: #374151;">
                   ${whatChanged.map(c => `<li style="margin-bottom: 4px;">${c}</li>`).join("")}
                 </ul>
               </div>` : ""}
 
               <div style="display: flex; gap: 12px; margin-bottom: 20px;">
                 <div style="flex: 1; background: ${p1Incidents.length > 0 ? "#fee2e2" : "#f3f4f6"}; padding: 12px; border-radius: 6px; text-align: center;">
                   <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${p1Incidents.length > 0 ? "#dc2626" : "#374151"};">${p1Incidents.length}</p>
                   <p style="margin: 4px 0 0; font-size: 12px; color: #6b7280;">P1 Incidents</p>
                 </div>
                 <div style="flex: 1; background: ${p2Incidents.length > 0 ? "#fef3c7" : "#f3f4f6"}; padding: 12px; border-radius: 6px; text-align: center;">
                   <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${p2Incidents.length > 0 ? "#f59e0b" : "#374151"};">${p2Incidents.length}</p>
                   <p style="margin: 4px 0 0; font-size: 12px; color: #6b7280;">P2 Incidents</p>
                 </div>
                 <div style="flex: 1; background: ${nightlyTest?.success ? "#ecfdf5" : "#fee2e2"}; padding: 12px; border-radius: 6px; text-align: center;">
                   <p style="margin: 0; font-size: 24px;">${nightlyTest?.success ? "✅" : nightlyTest ? "❌" : "⚠️"}</p>
                   <p style="margin: 4px 0 0; font-size: 12px; color: #6b7280;">Checkout Test</p>
                 </div>
               </div>
 
               ${actionsTaken.length > 0 ? `
               <div style="margin-bottom: 20px; background: #f3f4f6; padding: 16px; border-radius: 8px;">
                 <h3 style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">AUTOMATED ACTIONS (24H)</h3>
                 <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #4b5563;">
                   ${actionsTaken.slice(0, 5).map(a => `<li>${a.type}: ${a.description.slice(0, 60)}...</li>`).join("")}
                 </ul>
               </div>` : ""}
 
               <p style="margin: 20px 0 0; font-size: 11px; color: #9ca3af; text-align: center;">
                 GetPawsy Automated Monitoring • Generated by AI • ${new Date().toLocaleString()}
               </p>
             </div>`,
         }),
       });
     }
 
     return new Response(JSON.stringify({
       success: true,
       summary: {
         date: todayDate,
         status: currentStatus,
         status_emoji: statusEmoji,
         score: currentScore,
         recommendation,
         confidence_level: confidenceLevel,
         ai_summary: aiSummary,
         what_changed: whatChanged,
         incidents: { p1: p1Incidents.length, p2: p2Incidents.length },
         actions_taken: actionsTaken.length,
         current_risks: currentRisks.length,
       },
       safety_confirmation: "⚠️ READ-ONLY operation. No business data modified.",
     }), { 
       status: 200, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   } catch (error) {
     console.error("AI summary error:", error);
     return new Response(JSON.stringify({ 
       error: error instanceof Error ? error.message : "Unknown error" 
     }), { 
       status: 500, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   }
 });