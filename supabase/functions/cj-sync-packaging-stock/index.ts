import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapping of our packaging types to CJ product IDs
// These would need to be set up when you create custom products at CJ
const PACKAGING_CJ_MAPPING: Record<string, string> = {
  sticker: "", // Fill in with actual CJ product ID when available
  thank_you_card: "",
  poly_mailer_small: "",
  poly_mailer_medium: "",
};

// Get CJ access token (cached)
async function getCJAccessToken(): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: cached } = await supabase
    .from("cj_token_cache")
    .select("access_token, token_expiry")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (cached && new Date(cached.token_expiry) > new Date()) {
    return cached.access_token;
  }

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if this is a cron job call (service role) or admin call
    const authHeader = req.headers.get("Authorization");
    const isServiceRole = authHeader?.includes(Deno.env.get("SUPABASE_ANON_KEY") || "");
    
    if (!isServiceRole && authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
    }

    // Get our packaging inventory
    const { data: inventory, error: invError } = await supabase
      .from("packaging_inventory")
      .select("*");

    if (invError) {
      throw new Error(`Failed to fetch inventory: ${invError.message}`);
    }

    // Get CJ access token
    const accessToken = await getCJAccessToken();

    const syncResults: Array<{
      itemType: string;
      cjProductId: string;
      cjStock: number | null;
      localStock: number;
      synced: boolean;
      error?: string;
    }> = [];

    // For each packaging item, check if we have a CJ product ID configured
    for (const item of inventory || []) {
      const cjProductId = PACKAGING_CJ_MAPPING[item.item_type];
      
      if (!cjProductId) {
        syncResults.push({
          itemType: item.item_type,
          cjProductId: "Not configured",
          cjStock: null,
          localStock: item.quantity,
          synced: false,
          error: "No CJ product ID configured for this packaging type",
        });
        continue;
      }

      try {
        // Query CJ for stock info
        const stockResponse = await fetch(
          `https://developers.cjdropshipping.com/api2.0/v1/product/stock?pid=${cjProductId}`,
          {
            method: "GET",
            headers: {
              "CJ-Access-Token": accessToken,
            },
          }
        );

        const stockData = await stockResponse.json();

        if (stockData.result && stockData.data) {
          // Sum up stock from all warehouses
          const totalStock = Array.isArray(stockData.data)
            ? stockData.data.reduce((sum: number, w: { storageNum?: number }) => 
                sum + (w.storageNum || 0), 0)
            : stockData.data.storageNum || 0;

          // Update our local inventory with CJ warehouse stock
          await supabase
            .from("packaging_inventory")
            .update({ 
              quantity: totalStock,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          syncResults.push({
            itemType: item.item_type,
            cjProductId,
            cjStock: totalStock,
            localStock: item.quantity,
            synced: true,
          });
        } else {
          syncResults.push({
            itemType: item.item_type,
            cjProductId,
            cjStock: null,
            localStock: item.quantity,
            synced: false,
            error: stockData.message || "Failed to fetch CJ stock",
          });
        }
      } catch (error) {
        syncResults.push({
          itemType: item.item_type,
          cjProductId,
          cjStock: null,
          localStock: item.quantity,
          synced: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const syncedCount = syncResults.filter(r => r.synced).length;

    console.log(`Packaging stock sync complete: ${syncedCount}/${syncResults.length} items synced`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced ${syncedCount} of ${syncResults.length} packaging items`,
        results: syncResults,
        note: syncedCount === 0 
          ? "No CJ product IDs are configured yet. Set up custom products at CJ first, then update the PACKAGING_CJ_MAPPING in the edge function."
          : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Packaging stock sync error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
