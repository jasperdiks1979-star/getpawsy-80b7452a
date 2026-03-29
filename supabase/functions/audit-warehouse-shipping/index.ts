import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

interface WarehouseInventory {
  countryCode: string;
  totalInventory: number;
  cjInventory: number;
  factoryInventory: number;
}

interface CJVariant {
  vid: string;
  variantNameEn: string;
  variantSku: string;
  variantSellPrice: number;
  inventories?: WarehouseInventory[];
}

interface ShippingResult {
  hasUSWarehouse: boolean;
  usInventory: number;
  uspsAvailable: boolean;
  uspsShippingDays: string | null;
  recommendedShippingTime: string;
}

// Get CJ access token from cache or request new one
async function getAccessToken(supabase: any): Promise<string> {
  const { data: cachedData, error: cacheError } = await supabase
    .from("cj_token_cache")
    .select("access_token, token_expiry")
    .eq("id", "singleton")
    .single();

  if (!cacheError && cachedData) {
    const tokenExpiry = new Date(cachedData.token_expiry).getTime();
    if (Date.now() < tokenExpiry) {
      return cachedData.access_token;
    }
  }

  const apiKey = Deno.env.get("CJ_API_KEY");
  const email = Deno.env.get("CJ_EMAIL");

  if (!apiKey || !email) {
    throw new Error("CJ_API_KEY or CJ_EMAIL not configured");
  }

  const response = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: apiKey }),
  });

  const data = await response.json();

  if (!data.result || !data.data?.accessToken) {
    throw new Error(`CJ authentication failed: ${data.message || "Unknown error"}`);
  }

  const expiryDate = new Date(data.data.accessTokenExpiryDate);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton",
    access_token: data.data.accessToken,
    token_expiry: expiryDate.toISOString(),
    updated_at: new Date().toISOString(),
  });

  return data.data.accessToken;
}

// Get product details including warehouse inventory
async function getProductInventory(accessToken: string, cjProductId: string): Promise<CJVariant[] | null> {
  try {
    const params = new URLSearchParams({
      pid: cjProductId,
      features: 'enable_inventory',
      countryCode: 'US',
    });

    const response = await fetch(`${CJ_API_BASE}/product/query?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'CJ-Access-Token': accessToken,
      },
    });

    const data = await response.json();
    
    if (data.result && data.data?.variants) {
      return data.data.variants;
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching inventory for ${cjProductId}:`, error);
    return null;
  }
}

// Calculate freight options for US to US shipping
async function getUSShippingOptions(
  accessToken: string,
  vid: string
): Promise<Array<{ logisticName: string; logisticPrice: number; logisticAging: string }>> {
  try {
    const response = await fetch(`${CJ_API_BASE}/logistic/freightCalculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": accessToken,
      },
      body: JSON.stringify({
        startCountryCode: "US",
        endCountryCode: "US",
        zip: "10001",
        products: [{ vid, quantity: 1 }],
      }),
    });

    const data = await response.json();

    if (data.result && data.data && data.data.length > 0) {
      return data.data.map((option: any) => ({
        logisticName: option.logisticName,
        logisticPrice: option.logisticPrice,
        logisticAging: option.logisticAging,
      }));
    }
  } catch (error) {
    console.error(`Error calculating freight for vid ${vid}:`, error);
  }

  return [];
}

// Check if shipping option is USPS
function isUSPS(logisticName: string): boolean {
  const uspsKeywords = ['usps', 'united states postal', 'us postal', 'postal service'];
  const lowerName = logisticName.toLowerCase();
  return uspsKeywords.some(keyword => lowerName.includes(keyword));
}

// Parse shipping days from aging string
function parseShippingDays(agingStr: string): { min: number; max: number } {
  if (!agingStr) return { min: 7, max: 14 };
  
  const match = agingStr.match(/(\d+)\s*[-~]\s*(\d+)/);
  if (match) {
    return { min: parseInt(match[1]), max: parseInt(match[2]) };
  }
  
  const singleMatch = agingStr.match(/(\d+)/);
  if (singleMatch) {
    const days = parseInt(singleMatch[1]);
    return { min: days, max: days };
  }
  
  return { min: 7, max: 14 };
}

// Determine recommended shipping time based on shipping options
function getRecommendedShippingTime(
  shippingOptions: Array<{ logisticName: string; logisticAging: string; isUSPS: boolean }>,
  hasUSWarehouse: boolean
): string {
  // If no US warehouse, return international shipping time
  if (!hasUSWarehouse) {
    return "10-20 business days";
  }

  // Prioritize USPS options
  const uspsOptions = shippingOptions.filter(opt => opt.isUSPS);
  
  if (uspsOptions.length > 0) {
    const fastestUSPS = uspsOptions.reduce((fastest, current) => {
      const currentDays = parseShippingDays(current.logisticAging);
      const fastestDays = parseShippingDays(fastest.logisticAging);
      return currentDays.max < fastestDays.max ? current : fastest;
    });
    
    const days = parseShippingDays(fastestUSPS.logisticAging);
    return `${days.min}-${days.max} business days`;
  }
  
  // Fallback to fastest available option for US warehouse
  if (shippingOptions.length > 0) {
    const fastest = shippingOptions.reduce((fastest, current) => {
      const currentDays = parseShippingDays(current.logisticAging);
      const fastestDays = parseShippingDays(fastest.logisticAging);
      return currentDays.max < fastestDays.max ? current : fastest;
    });
    
    const days = parseShippingDays(fastest.logisticAging);
    return `${days.min}-${days.max} business days`;
  }
  
  // Default for US warehouse without specific options
  return "5–10 business days";
}

// Get shipping info for a single product - used during import
async function getProductShippingInfo(
  accessToken: string,
  cjProductId: string
): Promise<ShippingResult> {
  const variants = await getProductInventory(accessToken, cjProductId);
  
  let hasUSWarehouse = false;
  let usInventory = 0;
  let primaryVid = cjProductId;

  if (variants && variants.length > 0) {
    primaryVid = variants[0].vid;
    
    for (const variant of variants) {
      if (variant.inventories) {
        for (const inv of variant.inventories) {
          if (inv.countryCode === "US" && inv.totalInventory > 0) {
            hasUSWarehouse = true;
            usInventory += inv.totalInventory;
          }
        }
      }
    }
  }

  // Get shipping options
  let shippingOptions: Array<{ logisticName: string; logisticAging: string; isUSPS: boolean }> = [];
  let uspsAvailable = false;
  let uspsShippingDays: string | null = null;

  if (hasUSWarehouse) {
    const options = await getUSShippingOptions(accessToken, primaryVid);
    shippingOptions = options.map(opt => ({
      logisticName: opt.logisticName,
      logisticAging: opt.logisticAging,
      isUSPS: isUSPS(opt.logisticName),
    }));

    const uspsOption = shippingOptions.find(opt => opt.isUSPS);
    if (uspsOption) {
      uspsAvailable = true;
      uspsShippingDays = uspsOption.logisticAging;
    }
  }

  const recommendedShippingTime = getRecommendedShippingTime(shippingOptions, hasUSWarehouse);

  return {
    hasUSWarehouse,
    usInventory,
    uspsAvailable,
    uspsShippingDays,
    recommendedShippingTime,
  };
}

// Batch update shipping times for products
async function batchUpdateShippingTimes(
  supabase: any,
  accessToken: string,
  limit: number = 50,
  offset: number = 0,
  onlySlowShipping: boolean = false
): Promise<{ updated: number; failed: number; products: any[] }> {
  // Get products with CJ product IDs
  let query = supabase
    .from("products")
    .select("id, name, cj_product_id, shipping_time")
    .not("cj_product_id", "is", null)
    .eq("is_active", true);

  // Optionally filter to only slow shipping products
  if (onlySlowShipping) {
    query = query.like("shipping_time", "%10-20%");
  }

  const { data: products, error: productsError } = await query.range(offset, offset + limit - 1);

  if (productsError) {
    throw new Error(`Failed to fetch products: ${productsError.message}`);
  }

  const results: any[] = [];
  let updated = 0;
  let failed = 0;

  for (const product of products || []) {
    try {
      const shippingInfo = await getProductShippingInfo(accessToken, product.cj_product_id);
      
      // Only update if the shipping time actually changed
      if (product.shipping_time !== shippingInfo.recommendedShippingTime) {
        const { error: updateError } = await supabase
          .from("products")
          .update({ 
            shipping_time: shippingInfo.recommendedShippingTime,
            updated_at: new Date().toISOString(),
          })
          .eq("id", product.id);

        if (updateError) {
          failed++;
          results.push({
            productId: product.id,
            productName: product.name,
            success: false,
            error: updateError.message,
          });
        } else {
          updated++;
          results.push({
            productId: product.id,
            productName: product.name,
            success: true,
            oldShippingTime: product.shipping_time,
            newShippingTime: shippingInfo.recommendedShippingTime,
            hasUSWarehouse: shippingInfo.hasUSWarehouse,
            uspsAvailable: shippingInfo.uspsAvailable,
          });
        }
      } else {
        // No change needed, still count as success
        results.push({
          productId: product.id,
          productName: product.name,
          success: true,
          oldShippingTime: product.shipping_time,
          newShippingTime: shippingInfo.recommendedShippingTime,
          hasUSWarehouse: shippingInfo.hasUSWarehouse,
          uspsAvailable: shippingInfo.uspsAvailable,
          noChange: true,
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      failed++;
      results.push({
        productId: product.id,
        productName: product.name,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { updated, failed, products: results };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, cjProductId, limit = 20, offset = 0 } = await req.json();
    const accessToken = await getAccessToken(supabaseAdmin);

    // Action: get-shipping-time - Get shipping time for a single product (used during import)
    if (action === "get-shipping-time") {
      if (!cjProductId) {
        throw new Error("cjProductId is required");
      }

      const shippingInfo = await getProductShippingInfo(accessToken, cjProductId);

      return new Response(
        JSON.stringify({
          success: true,
          data: shippingInfo,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Action: sync-slow-shipping - Update only products with 10-20 day shipping
    // This is more efficient and targets products that might have wrong times
    if (action === "sync-slow-shipping") {
      const batchSize = limit || 15; // Smaller batches for faster execution
      const startOffset = offset || 0;
      
      console.log(`[AUDIT-WAREHOUSE] Syncing slow-shipping products from offset ${startOffset}, batch size ${batchSize}`);
      
      const result = await batchUpdateShippingTimes(supabaseAdmin, accessToken, batchSize, startOffset, true);
      
      console.log(`[AUDIT-WAREHOUSE] Batch complete: ${result.updated} updated, ${result.failed} failed, ${result.products.length} processed`);

      return new Response(
        JSON.stringify({
          success: true,
          summary: {
            updated: result.updated,
            failed: result.failed,
            processedCount: result.products.length,
            batchSize,
            offset: startOffset,
          },
          products: result.products,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Action: sync-all-now - Full sync of all products (may timeout for large catalogs)
    if (action === "sync-all-now") {
      console.log("[AUDIT-WAREHOUSE] Starting sync-all-now batch update");
      
      const batchSize = 15; // Smaller batches
      let totalUpdated = 0;
      let totalFailed = 0;
      let processedCount = 0;
      const allResults: any[] = [];

      // Get total count
      const { count: totalCount, error: countError } = await supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .not("cj_product_id", "is", null)
        .eq("is_active", true);

      if (countError) {
        throw new Error(`Failed to count products: ${countError.message}`);
      }

      console.log(`[AUDIT-WAREHOUSE] Processing ${totalCount} products`);

      // Process in batches - limit to prevent timeout
      const maxBatches = 3; // Only do 3 batches per call to stay within timeout
      let batchCount = 0;
      
      for (let currentOffset = 0; currentOffset < (totalCount || 0) && batchCount < maxBatches; currentOffset += batchSize) {
        const result = await batchUpdateShippingTimes(supabaseAdmin, accessToken, batchSize, currentOffset);
        totalUpdated += result.updated;
        totalFailed += result.failed;
        processedCount += result.products.length;
        allResults.push(...result.products);
        batchCount++;
        
        console.log(`[AUDIT-WAREHOUSE] Batch ${batchCount}: Updated ${result.updated}, Failed ${result.failed}`);
      }

      console.log(`[AUDIT-WAREHOUSE] Sync partial complete: ${totalUpdated} updated, ${totalFailed} failed`);

      return new Response(
        JSON.stringify({
          success: true,
          summary: {
            totalProducts: totalCount,
            updated: totalUpdated,
            failed: totalFailed,
            processedCount,
            note: processedCount < (totalCount || 0) ? `Partial sync - call again to continue (processed ${processedCount}/${totalCount})` : undefined,
          },
          sampleResults: allResults.slice(0, 50),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // For admin actions, check authorization
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: { user } } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Check if user is admin
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // Action: update-all - Batch update shipping times for all products
    if (action === "update-all") {
      const result = await batchUpdateShippingTimes(supabaseAdmin, accessToken, limit, offset);

      return new Response(
        JSON.stringify({
          success: true,
          summary: {
            updated: result.updated,
            failed: result.failed,
            processedCount: result.products.length,
            limit,
            offset,
          },
          products: result.products,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Action: count - Get total count of products to process
    if (action === "count") {
      const { count, error } = await supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .not("cj_product_id", "is", null)
        .eq("is_active", true);

      if (error) {
        throw new Error(`Failed to count products: ${error.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          count: count || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'get-shipping-time', 'update-all', 'sync-all-now', or 'count'" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[AUDIT-WAREHOUSE] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
