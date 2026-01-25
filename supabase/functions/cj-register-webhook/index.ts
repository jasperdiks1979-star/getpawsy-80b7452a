import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Get CJ access token (cached)
async function getCJAccessToken(): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check for cached token
  const { data: cached } = await supabase
    .from("cj_token_cache")
    .select("access_token, token_expiry")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (cached && new Date(cached.token_expiry) > new Date()) {
    return cached.access_token;
  }

  // Get new token
  const email = Deno.env.get("CJ_EMAIL");
  const password = Deno.env.get("CJ_PASSWORD");

  if (!email || !password) {
    throw new Error("CJ credentials not configured");
  }

  const response = await fetch(
    "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }
  );

  const data = await response.json();
  if (!data.result || !data.data?.accessToken) {
    throw new Error(data.message || "Failed to get CJ access token");
  }

  const accessToken = data.data.accessToken;
  const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  // Cache the token
  await supabase.from("cj_token_cache").upsert({
    id: "main",
    access_token: accessToken,
    token_expiry: tokenExpiry,
    updated_at: new Date().toISOString(),
  });

  return accessToken;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin authorization
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get CJ access token
    const accessToken = await getCJAccessToken();

    // Build webhook callback URL
    const webhookUrl = `${supabaseUrl}/functions/v1/cj-webhook`;

    console.log("Registering webhook URL:", webhookUrl);

    // Register webhooks via CJ API
    const response = await fetch(
      "https://developers.cjdropshipping.com/api2.0/v1/webhook/set",
      {
        method: "POST",
        headers: {
          "CJ-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product: {
            type: "ENABLE",
            callbackUrls: [webhookUrl],
          },
          stock: {
            type: "ENABLE",
            callbackUrls: [webhookUrl],
          },
          order: {
            type: "ENABLE",
            callbackUrls: [webhookUrl],
          },
          logistics: {
            type: "ENABLE",
            callbackUrls: [webhookUrl],
          },
        }),
      }
    );

    const result = await response.json();

    console.log("CJ webhook registration response:", result);

    if (!result.result) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.message || "Failed to register webhooks",
          code: result.code 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Webhooks registered successfully",
        webhookUrl 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook registration error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
