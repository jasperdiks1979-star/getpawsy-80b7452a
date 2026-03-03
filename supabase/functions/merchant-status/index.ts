import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));

    if (!user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ ok: false, error: "Admin required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get token record
    const { data: tokenData } = await supabase
      .from("merchant_oauth_tokens")
      .select("is_connected, merchant_center_id, token_created_at, token_refreshed_at, last_error, last_error_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get last sync
    const { data: lastSync } = await supabase
      .from("merchant_sync_logs")
      .select("status, started_at, completed_at, total_products, products_with_issues, error_message")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const merchantId = Deno.env.get("GOOGLE_MERCHANT_ID");

    return new Response(
      JSON.stringify({
        ok: true,
        status: {
          connected: tokenData?.is_connected ?? false,
          merchantCenterId: tokenData?.merchant_center_id || merchantId || null,
          tokenCreatedAt: tokenData?.token_created_at || null,
          tokenRefreshedAt: tokenData?.token_refreshed_at || null,
          lastError: tokenData?.last_error || null,
          lastErrorAt: tokenData?.last_error_at || null,
          lastSync: lastSync
            ? {
                status: lastSync.status,
                startedAt: lastSync.started_at,
                completedAt: lastSync.completed_at,
                totalProducts: lastSync.total_products,
                productsWithIssues: lastSync.products_with_issues,
                errorMessage: lastSync.error_message,
              }
            : null,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[merchant-status] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
