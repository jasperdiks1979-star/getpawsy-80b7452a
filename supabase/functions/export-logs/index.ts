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
    // Authenticate user — require admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authSupabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Check admin role
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      frontend_error_summary: {} as Record<string, number>,
      monitoring_audit_logs: auditLogs.data || [],
      monitoring_alerts: alertLogs.data || [],
    };

    // Build summary
    for (const err of frontendErrors.data || []) {
      const key = `${err.error_type}:${err.component_name}`;
      exportData.frontend_error_summary[key] = (exportData.frontend_error_summary[key] || 0) + 1;
    }

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
