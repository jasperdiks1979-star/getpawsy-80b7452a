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
  const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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

    const { designType, designUrl, productName, quantity } = await req.json();

    if (!designType || !designUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Design type and URL are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get CJ access token
    const accessToken = await getCJAccessToken();

    console.log(`Uploading ${designType} design to CJ:`, { productName, designUrl });

    // CJ Custom Print API endpoint for submitting custom designs
    // Note: This uses CJ's POD (Print on Demand) / Custom product API
    const response = await fetch(
      "https://developers.cjdropshipping.com/api2.0/v1/product/custom/add",
      {
        method: "POST",
        headers: {
          "CJ-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productName: productName || `GetPawsy ${designType}`,
          printArea: designType,
          printImageUrl: designUrl,
          quantity: quantity || 500,
          remark: `Branded packaging - ${designType}`,
        }),
      }
    );

    const result = await response.json();

    console.log("CJ custom design response:", result);

    // Note: CJ may not have a direct design upload API for all custom products
    // In that case, designs need to be submitted through their Custom Product portal
    if (!result.result) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.message || "CJ API call failed",
          code: result.code,
          note: "Custom packaging designs may need to be submitted through CJ's Custom Product portal at app.cjdropshipping.com"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Design submitted to CJ",
        data: result.data
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Design upload error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
