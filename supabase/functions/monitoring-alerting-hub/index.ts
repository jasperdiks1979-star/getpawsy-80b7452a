 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 type AlertSeverity = "P1" | "P2";
 type AlertTrigger = 
   | "new_p1_issue"
   | "regressed_issue"
   | "auto_rollback"
   | "self_healing"
   | "checkout_failure"
   | "ads_blocked";
 
 interface AlertPayload {
   severity: AlertSeverity;
   trigger: AlertTrigger;
   summary: string;
   affected_urls: string[];
   screenshots?: string[];
   root_cause?: string;
   action_taken: "rollback" | "fallback" | "none";
   suggested_next_step: string;
   timestamp: string;
   grouped_count?: number;
 }
 
 interface EmailPayload {
   subject: string;
   plain_text: string;
   html: string;
   json: AlertPayload;
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
     const body = await req.json().catch(() => ({}));
     const mode = body.mode || "check"; // "check" | "send"
     const forceAlert = body.force === true;
 
     // ════════════════════════════════════════════
     // Collect all alert sources
     // ════════════════════════════════════════════
     const now = new Date();
     const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
     const pendingAlerts: AlertPayload[] = [];
 
     // 1. NEW or REGRESSED P1 Issues
     const { data: activeAlerts } = await supabase
       .from("monitoring_alerts")
       .select("*")
       .eq("is_active", true)
       .eq("severity", "P1")
       .eq("notification_sent", false);
 
     for (const alert of activeAlerts || []) {
       pendingAlerts.push({
         severity: "P1",
         trigger: "new_p1_issue",
         summary: `${alert.title}: ${alert.description}`,
         affected_urls: alert.affected_urls || [],
         root_cause: alert.suggested_fix,
         action_taken: "none",
         suggested_next_step: alert.suggested_fix || "Investigate immediately",
         timestamp: alert.last_detected_at,
       });
     }
 
     // 2. Auto-Rollback Executed
     const { data: recentRollbacks } = await supabase
       .from("monitoring_auto_actions")
       .select("*")
       .eq("action_type", "rollback")
       .gte("created_at", oneHourAgo.toISOString())
       .is("error_message", null);
 
     for (const rollback of recentRollbacks || []) {
       pendingAlerts.push({
         severity: "P1",
         trigger: "auto_rollback",
         summary: `Auto-rollback executed for ${rollback.target_component}`,
         affected_urls: [],
         root_cause: JSON.stringify(rollback.action_details),
         action_taken: "rollback",
         suggested_next_step: "Review rollback and apply permanent fix",
         timestamp: rollback.created_at,
       });
     }
 
     // 3. Self-Healing UI Activated
     const { data: recentHealing } = await supabase
       .from("monitoring_self_healing_logs")
       .select("*")
       .gte("created_at", oneHourAgo.toISOString());
 
     for (const heal of recentHealing || []) {
       pendingAlerts.push({
         severity: "P2",
         trigger: "self_healing",
         summary: `Self-healing activated for ${heal.component_name}: ${heal.trigger_reason}`,
         affected_urls: heal.affected_url ? [heal.affected_url] : [],
         root_cause: heal.permanent_fix_suggestion,
         action_taken: "fallback",
         suggested_next_step: heal.permanent_fix_suggestion || "Apply permanent fix",
         timestamp: heal.created_at,
       });
     }
 
     // 4. Checkout Smoke Test Failures
     const { data: checkoutIncidents } = await supabase
       .from("monitoring_incidents")
       .select("*")
       .eq("incident_type", "checkout")
       .eq("status", "open")
       .gte("detected_at", oneHourAgo.toISOString());
 
     for (const incident of checkoutIncidents || []) {
       pendingAlerts.push({
         severity: "P1",
         trigger: "checkout_failure",
         summary: `Checkout smoke test failed: ${incident.root_cause_summary}`,
         affected_urls: [`${SITE_URL}/checkout`],
         root_cause: incident.root_cause_summary,
         action_taken: incident.fallback_activated ? "fallback" : "none",
         suggested_next_step: "Verify checkout flow immediately",
         timestamp: incident.detected_at,
       });
     }
 
     // 5. Ads Landing Pages Marked 🔴 Blocked
     const { data: blockedAdsPages } = await supabase
       .from("monitoring_ad_landing_pages")
       .select("*")
       .eq("health_status", "blocked")
       .eq("is_active", true);
 
     if (blockedAdsPages && blockedAdsPages.length > 0) {
       pendingAlerts.push({
         severity: "P1",
         trigger: "ads_blocked",
         summary: `${blockedAdsPages.length} ad landing page(s) blocked - pause ads immediately`,
         affected_urls: blockedAdsPages.map(p => `${SITE_URL}${p.url_path}`),
         root_cause: blockedAdsPages.map(p => p.risk_reason).filter(Boolean).join("; "),
         action_taken: "none",
         suggested_next_step: blockedAdsPages[0]?.alternative_url 
           ? `Switch ads to: ${blockedAdsPages[0].alternative_url}` 
           : "Fix landing pages or pause ads",
         timestamp: now.toISOString(),
         grouped_count: blockedAdsPages.length,
       });
     }
 
     // ════════════════════════════════════════════
     // Group alerts by trigger type
     // ════════════════════════════════════════════
     const groupedAlerts: Record<string, AlertPayload[]> = {};
     for (const alert of pendingAlerts) {
       if (!groupedAlerts[alert.trigger]) {
         groupedAlerts[alert.trigger] = [];
       }
       groupedAlerts[alert.trigger].push(alert);
     }
 
     // Create consolidated payloads
     const consolidatedPayloads: EmailPayload[] = [];
     
     for (const [trigger, alerts] of Object.entries(groupedAlerts)) {
       const highestSeverity = alerts.some(a => a.severity === "P1") ? "P1" : "P2";
       const allUrls = [...new Set(alerts.flatMap(a => a.affected_urls))];
       
       const summary = alerts.length === 1 
         ? alerts[0].summary 
         : `${alerts.length} ${trigger.replace(/_/g, " ")} alerts`;
 
       const consolidatedAlert: AlertPayload = {
         severity: highestSeverity,
         trigger: trigger as AlertTrigger,
         summary,
         affected_urls: allUrls.slice(0, 10),
         root_cause: alerts.map(a => a.root_cause).filter(Boolean).join("; ").slice(0, 500),
         action_taken: alerts[0].action_taken,
         suggested_next_step: alerts[0].suggested_next_step,
         timestamp: now.toISOString(),
         grouped_count: alerts.length,
       };
 
       // Generate email payload
       const subjectEmoji = highestSeverity === "P1" ? "🚨" : "⚠️";
       const subject = `${subjectEmoji} [${highestSeverity}] ${summary} - GetPawsy`;
 
       const plainText = `
 ALERT: ${summary}
 
 Severity: ${highestSeverity}
 Trigger: ${trigger}
 Time: ${now.toISOString()}
 
 Affected URLs:
 ${allUrls.slice(0, 5).map(u => `- ${u}`).join("\n")}
 
 Root Cause: ${consolidatedAlert.root_cause || "Unknown"}
 
 Action Taken: ${consolidatedAlert.action_taken}
 
 Next Step: ${consolidatedAlert.suggested_next_step}
 `.trim();
 
       const html = `
 <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px;">
   <div style="background: ${highestSeverity === 'P1' ? '#fee2e2' : '#fef3c7'}; padding: 20px; border-radius: 8px; border-left: 4px solid ${highestSeverity === 'P1' ? '#dc2626' : '#f59e0b'};">
     <h2 style="margin: 0 0 12px; color: ${highestSeverity === 'P1' ? '#dc2626' : '#92400e'};">${subjectEmoji} ${summary}</h2>
     <table style="width: 100%; font-size: 14px; color: #333;">
       <tr><td style="padding: 4px 0;"><strong>Severity:</strong></td><td>${highestSeverity}</td></tr>
       <tr><td style="padding: 4px 0;"><strong>Trigger:</strong></td><td>${trigger.replace(/_/g, " ")}</td></tr>
       <tr><td style="padding: 4px 0;"><strong>Time:</strong></td><td>${now.toLocaleString()}</td></tr>
       <tr><td style="padding: 4px 0;"><strong>Action Taken:</strong></td><td>${consolidatedAlert.action_taken}</td></tr>
     </table>
   </div>
   
   ${allUrls.length > 0 ? `
   <div style="margin-top: 16px;">
     <h3 style="margin: 0 0 8px; font-size: 14px; color: #666;">Affected URLs:</h3>
     <ul style="margin: 0; padding-left: 20px; font-size: 13px;">
       ${allUrls.slice(0, 5).map(u => `<li><a href="${u}" style="color: #2563eb;">${u}</a></li>`).join("")}
     </ul>
   </div>` : ""}
   
   ${consolidatedAlert.root_cause ? `
   <div style="margin-top: 16px; background: #f3f4f6; padding: 12px; border-radius: 6px;">
     <h3 style="margin: 0 0 8px; font-size: 14px; color: #374151;">Root Cause:</h3>
     <p style="margin: 0; font-size: 13px; color: #4b5563;">${consolidatedAlert.root_cause}</p>
   </div>` : ""}
   
   <div style="margin-top: 16px; background: #ecfdf5; padding: 12px; border-radius: 6px;">
     <h3 style="margin: 0 0 8px; font-size: 14px; color: #065f46;">Next Step:</h3>
     <p style="margin: 0; font-size: 13px; color: #047857; font-weight: 500;">${consolidatedAlert.suggested_next_step}</p>
   </div>
 </div>`;
 
       consolidatedPayloads.push({
         subject,
         plain_text: plainText,
         html,
         json: consolidatedAlert,
       });
     }
 
     // ════════════════════════════════════════════
     // Send alerts if mode === "send"
     // ════════════════════════════════════════════
     let emailsSent = 0;
     
     if (mode === "send" && (consolidatedPayloads.length > 0 || forceAlert)) {
       const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
       
       if (RESEND_API_KEY && consolidatedPayloads.length > 0) {
         // Send only P1 alerts immediately, batch P2
         const p1Payloads = consolidatedPayloads.filter(p => p.json.severity === "P1");
         
         for (const payload of p1Payloads) {
           await fetch("https://api.resend.com/emails", {
             method: "POST",
             headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
             body: JSON.stringify({
               from: "Monitoring <alerts@getpawsy.pet>",
               to: ["support@getpawsy.pet"],
               subject: payload.subject,
               html: payload.html,
             }),
           });
           emailsSent++;
         }
 
         // Mark alerts as notified
         if (activeAlerts && activeAlerts.length > 0) {
           await supabase
             .from("monitoring_alerts")
             .update({ notification_sent: true })
             .in("id", activeAlerts.map(a => a.id));
         }
       }
     }
 
     return new Response(JSON.stringify({
       success: true,
       mode,
       pending_alerts: pendingAlerts.length,
       grouped_payloads: consolidatedPayloads.length,
       emails_sent: emailsSent,
       sample_payload: consolidatedPayloads[0] || null,
       alerts_by_trigger: Object.fromEntries(
         Object.entries(groupedAlerts).map(([k, v]) => [k, v.length])
       ),
     }), { 
       status: 200, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   } catch (error) {
     console.error("Alerting hub error:", error);
     return new Response(JSON.stringify({ 
       error: error instanceof Error ? error.message : "Unknown error" 
     }), { 
       status: 500, 
       headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
   }
 });