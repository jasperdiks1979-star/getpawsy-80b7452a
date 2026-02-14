import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch all log sources in parallel
    const [cronLogs, frontendErrors, auditLogs, alertLogs] = await Promise.all([
      supabase
        .from("cron_job_logs")
        .select("*")
        .gte("started_at", twentyFourHoursAgo)
        .order("started_at", { ascending: false }),
      supabase
        .from("frontend_error_logs")
        .select("id, error_type, component_name, error_message, created_at")
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("monitoring_audit_logs")
        .select("*")
        .gte("timestamp", twentyFourHoursAgo)
        .order("timestamp", { ascending: false }),
      supabase
        .from("monitoring_alerts")
        .select("*")
        .gte("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false }),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      period: "last_24_hours",
      cron_job_logs: cronLogs.data || [],
      frontend_error_logs: frontendErrors.data || [],
      frontend_error_summary: {},
      monitoring_audit_logs: auditLogs.data || [],
      monitoring_alerts: alertLogs.data || [],
    };

    // Build summary
    const summary: Record<string, number> = {};
    for (const err of (frontendErrors.data || [])) {
      const key = `${err.error_type}:${err.component_name}`;
      summary[key] = (summary[key] || 0) + 1;
    }
    exportData.frontend_error_summary = summary;

    const json = JSON.stringify(exportData, null, 2);
    const filename = `getpawsy-logs-${new Date().toISOString().split("T")[0]}.json`;

    return new Response(json, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
