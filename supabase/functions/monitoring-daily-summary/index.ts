 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 serve(async (req: Request): Promise<Response> => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   const supabase = createClient(
     Deno.env.get("SUPABASE_URL") ?? "",
     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
   );
 
   try {
     const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
 
     // Get runs from last 24 hours
     const { data: runs } = await supabase
       .from("monitoring_runs")
       .select("*")
       .gte("started_at", oneDayAgo)
       .order("started_at", { ascending: false });
 
     // Get all active alerts
     const { data: activeAlerts } = await supabase
       .from("monitoring_alerts")
       .select("*")
       .eq("is_active", true)
       .order("severity", { ascending: true });
 
     // Get resolved alerts from last 24h
     const { data: resolvedAlerts } = await supabase
       .from("monitoring_alerts")
       .select("*")
       .eq("is_active", false)
       .gte("resolved_at", oneDayAgo);
 
     // Calculate summary stats
     const p1Runs = runs?.filter(r => r.run_type === 'p1') || [];
     const p2Runs = runs?.filter(r => r.run_type === 'p2') || [];
     
     const p1SuccessRate = p1Runs.length > 0 
       ? (p1Runs.filter(r => r.success).length / p1Runs.length * 100).toFixed(1)
       : 'N/A';
     
     const p2SuccessRate = p2Runs.length > 0
       ? (p2Runs.filter(r => r.success).length / p2Runs.length * 100).toFixed(1)
       : 'N/A';
 
     const p1Alerts = activeAlerts?.filter(a => a.severity === 'P1') || [];
     const p2Alerts = activeAlerts?.filter(a => a.severity === 'P2') || [];
 
     // Build email
     const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
     if (!RESEND_API_KEY) {
       return new Response(
         JSON.stringify({ error: "RESEND_API_KEY not configured" }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const statusColor = p1Alerts.length > 0 ? '#dc2626' : p2Alerts.length > 0 ? '#f59e0b' : '#16a34a';
     const statusText = p1Alerts.length > 0 ? '🚨 CRITICAL' : p2Alerts.length > 0 ? '⚠️ WARNINGS' : '✅ HEALTHY';
 
     const alertRows = (alerts: typeof activeAlerts) => 
       alerts?.map(a => `
         <tr>
           <td style="padding: 8px; border: 1px solid #e5e7eb; background: ${a.severity === 'P1' ? '#fee2e2' : '#fef3c7'};">${a.severity}</td>
           <td style="padding: 8px; border: 1px solid #e5e7eb;">${a.title}</td>
           <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px;">${a.category}</td>
           <td style="padding: 8px; border: 1px solid #e5e7eb; font-size: 12px; color: #666;">${new Date(a.first_detected_at).toLocaleDateString()}</td>
         </tr>
       `).join('') || '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #16a34a;">No active alerts 🎉</td></tr>';
 
     const emailHtml = `
       <!DOCTYPE html>
       <html>
       <head>
         <style>
           body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
           .container { max-width: 700px; margin: 0 auto; padding: 20px; }
           .header { background: ${statusColor}; color: white; padding: 24px; border-radius: 8px 8px 0 0; text-align: center; }
           .content { background: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px; }
           .stats-grid { display: flex; gap: 16px; margin-bottom: 24px; }
           .stat-box { flex: 1; background: white; padding: 16px; border-radius: 8px; text-align: center; border: 1px solid #e5e7eb; }
           .stat-number { font-size: 28px; font-weight: bold; color: #111; }
           .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
           table { width: 100%; border-collapse: collapse; background: white; margin-top: 16px; }
           th { background: #f3f4f6; padding: 12px 8px; text-align: left; border: 1px solid #e5e7eb; font-size: 12px; }
           .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #888; text-align: center; }
         </style>
       </head>
       <body>
         <div class="container">
           <div class="header">
             <h1 style="margin: 0 0 8px;">${statusText}</h1>
             <p style="margin: 0; opacity: 0.9;">GetPawsy Daily Monitoring Report</p>
             <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.8;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
           </div>
           
           <div class="content">
             <div class="stats-grid">
               <div class="stat-box">
                 <div class="stat-number" style="color: ${p1Alerts.length > 0 ? '#dc2626' : '#16a34a'}">${p1Alerts.length}</div>
                 <div class="stat-label">P1 Alerts</div>
               </div>
               <div class="stat-box">
                 <div class="stat-number" style="color: ${p2Alerts.length > 0 ? '#f59e0b' : '#16a34a'}">${p2Alerts.length}</div>
                 <div class="stat-label">P2 Alerts</div>
               </div>
               <div class="stat-box">
                 <div class="stat-number">${resolvedAlerts?.length || 0}</div>
                 <div class="stat-label">Resolved (24h)</div>
               </div>
               <div class="stat-box">
                 <div class="stat-number">${p1Runs.length}</div>
                 <div class="stat-label">P1 Runs</div>
               </div>
             </div>
 
             <h3 style="margin: 0 0 8px;">Monitoring Run Summary</h3>
             <table>
               <tr>
                 <th>Check Type</th>
                 <th>Runs (24h)</th>
                 <th>Success Rate</th>
                 <th>Schedule</th>
               </tr>
               <tr>
                 <td style="padding: 8px; border: 1px solid #e5e7eb;">P1 (Critical)</td>
                 <td style="padding: 8px; border: 1px solid #e5e7eb;">${p1Runs.length}</td>
                 <td style="padding: 8px; border: 1px solid #e5e7eb;">${p1SuccessRate}%</td>
                 <td style="padding: 8px; border: 1px solid #e5e7eb;">Every 30 min</td>
               </tr>
               <tr>
                 <td style="padding: 8px; border: 1px solid #e5e7eb;">P2 (UX/Perf)</td>
                 <td style="padding: 8px; border: 1px solid #e5e7eb;">${p2Runs.length}</td>
                 <td style="padding: 8px; border: 1px solid #e5e7eb;">${p2SuccessRate}%</td>
                 <td style="padding: 8px; border: 1px solid #e5e7eb;">Every 6 hours</td>
               </tr>
             </table>
 
             <h3 style="margin: 24px 0 8px;">Active Alerts</h3>
             <table>
               <tr>
                 <th>Severity</th>
                 <th>Issue</th>
                 <th>Category</th>
                 <th>Since</th>
               </tr>
               ${alertRows(activeAlerts)}
             </table>
 
             ${resolvedAlerts && resolvedAlerts.length > 0 ? `
               <h3 style="margin: 24px 0 8px; color: #16a34a;">✅ Resolved in Last 24h</h3>
               <ul style="margin: 0; padding-left: 20px;">
                 ${resolvedAlerts.map(a => `<li style="margin-bottom: 4px;">${a.title}</li>`).join('')}
               </ul>
             ` : ''}
 
             <div class="footer">
               <p>GetPawsy Automated Monitoring System</p>
               <p>P1 checks: Category health, Product availability, Bestseller URLs, Checkout flow</p>
               <p>P2 checks: LCP performance, Broken images, Core Web Vitals</p>
             </div>
           </div>
         </div>
       </body>
       </html>
     `;
 
     await fetch("https://api.resend.com/emails", {
       method: "POST",
       headers: {
         Authorization: `Bearer ${RESEND_API_KEY}`,
         "Content-Type": "application/json",
       },
       body: JSON.stringify({
         from: "Monitoring <alerts@getpawsy.pet>",
         to: ["support@getpawsy.pet"],
         subject: `${statusText} - GetPawsy Daily Report (${p1Alerts.length} P1, ${p2Alerts.length} P2)`,
         html: emailHtml,
       }),
     });
 
     // Log this run
     await supabase.from("monitoring_runs").insert({
       run_type: "daily_summary",
       started_at: new Date().toISOString(),
       completed_at: new Date().toISOString(),
       success: true,
       details: {
         p1_alerts: p1Alerts.length,
         p2_alerts: p2Alerts.length,
         resolved_24h: resolvedAlerts?.length || 0,
         p1_runs: p1Runs.length,
         p2_runs: p2Runs.length,
       },
     });
 
     return new Response(
       JSON.stringify({
         success: true,
         summary: {
           status: statusText,
           p1_alerts: p1Alerts.length,
           p2_alerts: p2Alerts.length,
           resolved_24h: resolvedAlerts?.length || 0,
           p1_runs_24h: p1Runs.length,
           p2_runs_24h: p2Runs.length,
         },
       }),
       { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   } catch (error) {
     console.error("Daily summary error:", error);
     return new Response(
       JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });