 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 interface AlertPayload {
   type: "score_drop" | "critical" | "checkout_fail" | "qa_fail" | "budget_action";
   severity: "predictive" | "P1" | "P2";
   title: string;
   summary: string;
   urls: string[];
   campaigns: string[];
   score?: { current: number; previous: number; delta: number };
   screenshots?: string[];
   action: string;
   timestamp: string;
 }
 
 interface SlackPayload {
   text: string;
   blocks: any[];
 }
 
 interface WhatsAppPayload {
   to: string;
   type: "text";
   text: { body: string };
 }
 
 function buildSlackPayload(alert: AlertPayload): SlackPayload {
   const emoji = alert.severity === "P1" ? "🔴" : alert.severity === "predictive" ? "🔮" : "🟠";
   const blocks = [
     {
       type: "header",
       text: { type: "plain_text", text: `${emoji} ${alert.title}`, emoji: true }
     },
     {
       type: "section",
       text: { type: "mrkdwn", text: alert.summary }
     },
   ];
 
   if (alert.score) {
     blocks.push({
       type: "section",
       text: { type: "mrkdwn", text: `*Score:* ${alert.score.previous} → ${alert.score.current} (*Delta:* ${alert.score.delta > 0 ? "+" : ""}${alert.score.delta})` }
     });
   }
 
   if (alert.urls.length > 0) {
     blocks.push({
       type: "section",
       text: { type: "mrkdwn", text: `*Affected URLs:*\n${alert.urls.slice(0, 5).map(u => `• ${u}`).join("\n")}` }
     });
   }
 
   blocks.push({
     type: "section",
     text: { type: "mrkdwn", text: `*Recommended Action:* ${alert.action}` }
   });
 
   blocks.push({
     type: "section",
     text: { type: "mrkdwn", text: `_Severity: ${alert.severity} | ${alert.timestamp}_` }
   });
 
   return {
     text: `${emoji} ${alert.title}`,
     blocks,
   };
 }
 
 function buildWhatsAppPayload(alert: AlertPayload, phoneNumber: string): WhatsAppPayload {
   const emoji = alert.severity === "P1" ? "🔴" : alert.severity === "predictive" ? "🔮" : "🟠";
   let body = `${emoji} *${alert.title}*\n\n${alert.summary}`;
   
   if (alert.score) {
     body += `\n\n📊 Score: ${alert.score.previous} → ${alert.score.current} (${alert.score.delta > 0 ? "+" : ""}${alert.score.delta})`;
   }
   
   if (alert.urls.length > 0) {
     body += `\n\n🔗 Affected: ${alert.urls.slice(0, 3).join(", ")}`;
   }
   
   body += `\n\n✅ *Action:* ${alert.action}`;
   body += `\n\n_${alert.severity} | ${alert.timestamp}_`;
 
   return {
     to: phoneNumber,
     type: "text",
     text: { body }
   };
 }
 
 function buildEmailPayload(alert: AlertPayload): { subject: string; html: string; text: string } {
   const emoji = alert.severity === "P1" ? "🔴" : alert.severity === "predictive" ? "🔮" : "🟠";
   
   const subject = `${emoji} ${alert.title}`;
   
   const html = `
     <div style="font-family: sans-serif; max-width: 600px;">
       <h2 style="color: ${alert.severity === "P1" ? "#dc2626" : alert.severity === "predictive" ? "#7c3aed" : "#f59e0b"};">
         ${emoji} ${alert.title}
       </h2>
       <p>${alert.summary}</p>
       ${alert.score ? `
         <div style="background: #f3f4f6; padding: 12px; border-radius: 8px; margin: 16px 0;">
           <strong>Score Change:</strong> ${alert.score.previous} → ${alert.score.current} 
           (${alert.score.delta > 0 ? "+" : ""}${alert.score.delta})
         </div>
       ` : ""}
       ${alert.urls.length > 0 ? `
         <div style="margin: 16px 0;">
           <strong>Affected URLs:</strong>
           <ul>${alert.urls.slice(0, 5).map(u => `<li>${u}</li>`).join("")}</ul>
         </div>
       ` : ""}
       <div style="background: #dcfce7; padding: 12px; border-radius: 8px; border-left: 4px solid #16a34a;">
         <strong>Recommended Action:</strong> ${alert.action}
       </div>
       <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
         Severity: ${alert.severity} | ${alert.timestamp}
       </p>
     </div>
   `;
   
   const text = `${emoji} ${alert.title}\n\n${alert.summary}\n\n${alert.score ? `Score: ${alert.score.previous} → ${alert.score.current}\n\n` : ""}Action: ${alert.action}\n\n${alert.timestamp}`;
 
   return { subject, html, text };
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
     const now = new Date();
     const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
 
     // Get undelivered alerts
     const { data: pendingAlerts } = await supabase
       .from("monitoring_realtime_alerts")
       .select("*")
       .eq("delivered_lovable", false)
       .eq("is_suppressed", false)
       .gte("created_at", oneHourAgo.toISOString())
       .order("created_at", { ascending: true });
 
     if (!pendingAlerts || pendingAlerts.length === 0) {
       return new Response(JSON.stringify({
         success: true,
         message: "No pending alerts",
         alerts_processed: 0,
       }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
     }
 
     // Group alerts by group_key to prevent spam
     const groupedAlerts = new Map<string, typeof pendingAlerts>();
     const ungroupedAlerts: typeof pendingAlerts = [];
 
     for (const alert of pendingAlerts) {
       if (alert.alert_group_key) {
         const existing = groupedAlerts.get(alert.alert_group_key);
         if (existing) {
           existing.push(alert);
         } else {
           groupedAlerts.set(alert.alert_group_key, [alert]);
         }
       } else {
         ungroupedAlerts.push(alert);
       }
     }
 
     const processedAlerts: any[] = [];
     const deliveryPayloads: any[] = [];
 
     // Process grouped alerts (consolidate into one)
     for (const [groupKey, alerts] of groupedAlerts) {
       const primaryAlert = alerts[0];
       const allUrls = [...new Set(alerts.flatMap(a => a.affected_urls || []))];
       const allCampaigns = [...new Set(alerts.flatMap(a => a.affected_campaigns || []))];
 
       const alertPayload: AlertPayload = {
         type: primaryAlert.alert_type as any,
         severity: primaryAlert.severity as any,
         title: alerts.length > 1 
           ? `${primaryAlert.title} (+${alerts.length - 1} similar)`
           : primaryAlert.title,
         summary: primaryAlert.summary,
         urls: allUrls,
         campaigns: allCampaigns,
         score: primaryAlert.current_score ? {
           current: primaryAlert.current_score,
           previous: primaryAlert.previous_score,
           delta: primaryAlert.score_delta,
         } : undefined,
         screenshots: primaryAlert.screenshot_urls,
         action: primaryAlert.recommended_action || "Investigate",
         timestamp: new Date(primaryAlert.created_at).toISOString(),
       };
 
       deliveryPayloads.push({
         lovable: alertPayload,
         slack: buildSlackPayload(alertPayload),
         whatsapp: buildWhatsAppPayload(alertPayload, "PLACEHOLDER"),
         email: buildEmailPayload(alertPayload),
       });
 
       // Mark all grouped alerts as delivered
       for (const alert of alerts) {
         await supabase.from("monitoring_realtime_alerts")
           .update({
             delivered_lovable: true,
             is_grouped: alerts.length > 1,
             grouped_count: alerts.length,
           })
           .eq("id", alert.id);
       }
 
       processedAlerts.push({
         group_key: groupKey,
         count: alerts.length,
         severity: primaryAlert.severity,
         title: alertPayload.title,
       });
     }
 
     // Process ungrouped alerts individually
     for (const alert of ungroupedAlerts) {
       const alertPayload: AlertPayload = {
         type: alert.alert_type as any,
         severity: alert.severity as any,
         title: alert.title,
         summary: alert.summary,
         urls: alert.affected_urls || [],
         campaigns: alert.affected_campaigns || [],
         score: alert.current_score ? {
           current: alert.current_score,
           previous: alert.previous_score,
           delta: alert.score_delta,
         } : undefined,
         screenshots: alert.screenshot_urls,
         action: alert.recommended_action || "Investigate",
         timestamp: new Date(alert.created_at).toISOString(),
       };
 
       deliveryPayloads.push({
         lovable: alertPayload,
         slack: buildSlackPayload(alertPayload),
         whatsapp: buildWhatsAppPayload(alertPayload, "PLACEHOLDER"),
         email: buildEmailPayload(alertPayload),
       });
 
       await supabase.from("monitoring_realtime_alerts")
         .update({ delivered_lovable: true })
         .eq("id", alert.id);
 
       processedAlerts.push({
         id: alert.id,
         severity: alert.severity,
         title: alert.title,
       });
     }
 
     // Log to audit
     for (const payload of deliveryPayloads) {
       await supabase.from("monitoring_audit_logs").insert({
         action_type: "realtime_alert",
         action_taken: "alert_dispatched",
         severity: payload.lovable.severity,
         trigger_condition: payload.lovable.type,
         affected_urls: payload.lovable.urls,
         metadata: {
           title: payload.lovable.title,
           channels_ready: ["lovable", "slack", "whatsapp", "email"],
         },
         action_result: "dispatched",
       });
     }
 
     return new Response(JSON.stringify({
       success: true,
       alerts_processed: processedAlerts.length,
       processed: processedAlerts,
       delivery_payloads: deliveryPayloads.map(p => ({
         lovable: p.lovable,
         slack_ready: true,
         whatsapp_ready: true,
         email_ready: true,
       })),
       example_slack_payload: deliveryPayloads[0]?.slack,
       example_whatsapp_payload: deliveryPayloads[0]?.whatsapp,
       example_email_payload: deliveryPayloads[0]?.email,
     }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
   } catch (error) {
     console.error("Realtime alerts error:", error);
     return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
   }
 });