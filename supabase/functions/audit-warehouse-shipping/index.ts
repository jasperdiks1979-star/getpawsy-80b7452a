import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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

interface ProductShippingAudit {
  productId: string;
  productName: string;
  cjProductId: string;
  hasUSWarehouse: boolean;
  usInventory: number;
  warehouses: string[];
  uspsAvailable: boolean;
  uspsShippingDays: string | null;
  uspsShippingPrice: number | null;
  allShippingOptions: Array<{
    logisticName: string;
    logisticPrice: number;
    logisticAging: string;
    isUSPS: boolean;
  }>;
  recommendedShippingTime: string;
  currentShippingTime: string | null;
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
        zip: "10001", // NYC zip for testing
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
  if (!agingStr) return { min: 30, max: 30 };
  
  const match = agingStr.match(/(\d+)\s*[-~]\s*(\d+)/);
  if (match) {
    return { min: parseInt(match[1]), max: parseInt(match[2]) };
  }
  
  const singleMatch = agingStr.match(/(\d+)/);
  if (singleMatch) {
    const days = parseInt(singleMatch[1]);
    return { min: days, max: days };
  }
  
  return { min: 30, max: 30 };
}

// Determine recommended shipping time based on shipping options
function getRecommendedShippingTime(shippingOptions: Array<{ logisticName: string; logisticAging: string; isUSPS: boolean }>): string {
  // Prioritize USPS options
  const uspsOptions = shippingOptions.filter(opt => opt.isUSPS);
  
  if (uspsOptions.length > 0) {
    // Use the USPS option with shortest delivery time
    const fastestUSPS = uspsOptions.reduce((fastest, current) => {
      const currentDays = parseShippingDays(current.logisticAging);
      const fastestDays = parseShippingDays(fastest.logisticAging);
      return currentDays.max < fastestDays.max ? current : fastest;
    });
    
    const days = parseShippingDays(fastestUSPS.logisticAging);
    return `${days.min}-${days.max} business days (USPS)`;
  }
  
  // Fallback to fastest available option
  if (shippingOptions.length > 0) {
    const fastest = shippingOptions.reduce((fastest, current) => {
      const currentDays = parseShippingDays(current.logisticAging);
      const fastestDays = parseShippingDays(fastest.logisticAging);
      return currentDays.max < fastestDays.max ? current : fastest;
    });
    
    const days = parseShippingDays(fastest.logisticAging);
    return `${days.min}-${days.max} business days`;
  }
  
  return "7-21 business days";
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

    // Check authorization
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

    const { action, productIds, limit = 50, offset = 0 } = await req.json();

    const accessToken = await getAccessToken(supabaseAdmin);

    if (action === "audit-all" || action === "audit-batch") {
      // Get products with CJ product IDs
      let query = supabaseAdmin
        .from("products")
        .select("id, name, cj_product_id, shipping_time, variants")
        .not("cj_product_id", "is", null)
        .eq("is_active", true);

      if (productIds && productIds.length > 0) {
        query = query.in("id", productIds);
      }

      const { data: products, error: productsError } = await query
        .range(offset, offset + limit - 1);

      if (productsError) {
        throw new Error(`Failed to fetch products: ${productsError.message}`);
      }

      const auditResults: ProductShippingAudit[] = [];
      const usWarehouseProducts: string[] = [];
      const noUSWarehouseProducts: string[] = [];
      const uspsAvailableProducts: string[] = [];

      for (const product of products || []) {
        console.log(`Auditing product: ${product.name} (${product.cj_product_id})`);

        // Get variant inventory info
        const variants = await getProductInventory(accessToken, product.cj_product_id);
        
        let hasUSWarehouse = false;
        let usInventory = 0;
        const warehouses = new Set<string>();
        let primaryVid = product.cj_product_id;

        if (variants && variants.length > 0) {
          primaryVid = variants[0].vid;
          
          for (const variant of variants) {
            if (variant.inventories) {
              for (const inv of variant.inventories) {
                warehouses.add(inv.countryCode);
                if (inv.countryCode === "US" && inv.totalInventory > 0) {
                  hasUSWarehouse = true;
                  usInventory += inv.totalInventory;
                }
              }
            }
          }
        }

        // Get shipping options for US warehouse
        let shippingOptions: Array<{ logisticName: string; logisticPrice: number; logisticAging: string; isUSPS: boolean }> = [];
        let uspsAvailable = false;
        let uspsShippingDays: string | null = null;
        let uspsShippingPrice: number | null = null;

        if (hasUSWarehouse) {
          const options = await getUSShippingOptions(accessToken, primaryVid);
          shippingOptions = options.map(opt => ({
            ...opt,
            isUSPS: isUSPS(opt.logisticName),
          }));

          const uspsOption = shippingOptions.find(opt => opt.isUSPS);
          if (uspsOption) {
            uspsAvailable = true;
            uspsShippingDays = uspsOption.logisticAging;
            uspsShippingPrice = uspsOption.logisticPrice;
            uspsAvailableProducts.push(product.id);
          }

          usWarehouseProducts.push(product.id);
        } else {
          noUSWarehouseProducts.push(product.id);
        }

        const recommendedShippingTime = getRecommendedShippingTime(shippingOptions);

        auditResults.push({
          productId: product.id,
          productName: product.name,
          cjProductId: product.cj_product_id,
          hasUSWarehouse,
          usInventory,
          warehouses: Array.from(warehouses),
          uspsAvailable,
          uspsShippingDays,
          uspsShippingPrice,
          allShippingOptions: shippingOptions,
          recommendedShippingTime,
          currentShippingTime: product.shipping_time,
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const totalProducts = products?.length || 0;

      return new Response(
        JSON.stringify({
          success: true,
          summary: {
            totalAudited: totalProducts,
            usWarehouseCount: usWarehouseProducts.length,
            noUSWarehouseCount: noUSWarehouseProducts.length,
            uspsAvailableCount: uspsAvailableProducts.length,
            usWarehousePercentage: totalProducts > 0 ? Math.round((usWarehouseProducts.length / totalProducts) * 100) : 0,
          },
          products: auditResults,
          productIds: {
            usWarehouse: usWarehouseProducts,
            noUSWarehouse: noUSWarehouseProducts,
            uspsAvailable: uspsAvailableProducts,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "update-shipping-times") {
      // Update shipping times for US warehouse products
      const { productUpdates } = await req.json();

      if (!productUpdates || !Array.isArray(productUpdates)) {
        throw new Error("productUpdates array required");
      }

      const updateResults = [];

      for (const update of productUpdates) {
        const { productId, shippingTime } = update;

        const { error } = await supabaseAdmin
          .from("products")
          .update({ 
            shipping_time: shippingTime,
            updated_at: new Date().toISOString(),
          })
          .eq("id", productId);

        updateResults.push({
          productId,
          success: !error,
          error: error?.message,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          updated: updateResults.filter(r => r.success).length,
          failed: updateResults.filter(r => !r.success).length,
          results: updateResults,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'audit-all', 'audit-batch', or 'update-shipping-times'" }),
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
