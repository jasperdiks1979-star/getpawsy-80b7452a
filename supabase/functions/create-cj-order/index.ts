import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

interface CJOrderProduct {
  vid: string;
  quantity: number;
}

interface CJOrderRequest {
  orderNumber: string;
  shippingZip: string;
  shippingCountryCode: string;
  shippingCountry: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  shippingCustomerName: string;
  shippingPhone: string;
  products: CJOrderProduct[];
  remark?: string;
  logisticName?: string;
  fromCountryCode?: string;
}

interface WarehouseOption {
  warehouseCode: string;
  warehouseName: string;
  logisticName: string;
  logisticPrice: number;
  logisticAging: string;
  estimatedDays: number;
  score: number;
}

// CJ Dropshipping warehouse codes with regional priorities
const CJ_WAREHOUSES = [
  { code: 'US', name: 'United States', region: 'americas', priority: 1 },
  { code: 'CN', name: 'China', region: 'asia', priority: 2 },
  { code: 'DE', name: 'Germany', region: 'europe', priority: 1 },
  { code: 'UK', name: 'United Kingdom', region: 'europe', priority: 2 },
  { code: 'AU', name: 'Australia', region: 'oceania', priority: 1 },
  { code: 'TH', name: 'Thailand', region: 'asia', priority: 3 },
];

// Country to region mapping
const COUNTRY_REGIONS: Record<string, string> = {
  // Americas
  US: 'americas', CA: 'americas', MX: 'americas', BR: 'americas',
  // Europe
  NL: 'europe', BE: 'europe', DE: 'europe', FR: 'europe', GB: 'europe',
  ES: 'europe', IT: 'europe', PT: 'europe', AT: 'europe', CH: 'europe',
  PL: 'europe', CZ: 'europe', SE: 'europe', NO: 'europe', DK: 'europe',
  FI: 'europe', IE: 'europe', GR: 'europe', HU: 'europe', RO: 'europe',
  // Asia
  CN: 'asia', JP: 'asia', KR: 'asia', TW: 'asia', HK: 'asia',
  SG: 'asia', TH: 'asia', VN: 'asia', MY: 'asia', PH: 'asia',
  ID: 'asia', IN: 'asia',
  // Oceania
  AU: 'oceania', NZ: 'oceania',
  // Middle East
  AE: 'middle_east', SA: 'middle_east', IL: 'middle_east', TR: 'middle_east',
};

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  variant?: string;
}

// Get CJ access token from cache or request new one
async function getAccessToken(supabase: any): Promise<string> {
  // Check for cached token
  const { data: cachedData, error: cacheError } = await supabase
    .from("cj_token_cache")
    .select("access_token, token_expiry")
    .eq("id", "singleton")
    .single();

  if (!cacheError && cachedData) {
    const tokenExpiry = new Date(cachedData.token_expiry).getTime();
    if (Date.now() < tokenExpiry) {
      console.log("[CREATE-CJ-ORDER] Using cached CJ access token");
      return cachedData.access_token;
    }
    console.log("[CREATE-CJ-ORDER] Cached token expired, requesting new one...");
  }

  const apiKey = Deno.env.get("CJ_API_KEY");
  const email = Deno.env.get("CJ_EMAIL");

  if (!apiKey || !email) {
    throw new Error("CJ_API_KEY or CJ_EMAIL not configured");
  }

  console.log("[CREATE-CJ-ORDER] Requesting new CJ access token...");

  const response = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: email,
      password: apiKey,
    }),
  });

  const data = await response.json();
  console.log("[CREATE-CJ-ORDER] CJ Auth response:", data.result ? "success" : data.message);

  if (!data.result || !data.data?.accessToken) {
    throw new Error(`CJ authentication failed: ${data.message || "Unknown error"}`);
  }

  // Cache the token
  const expiryDate = new Date(data.data.accessTokenExpiryDate);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton",
    access_token: data.data.accessToken,
    refresh_token: data.data.refreshToken,
    token_expiry: expiryDate.toISOString(),
    updated_at: new Date().toISOString(),
  });

  return data.data.accessToken;
}

// Get product details including variant ID
async function getProductVariant(
  supabase: any,
  productId: string,
  variantName?: string
): Promise<{ vid: string; sku: string } | null> {
  const { data: product, error } = await supabase
    .from("products")
    .select("cj_product_id, sku, variants")
    .eq("id", productId)
    .single();

  if (error || !product) {
    console.error("[CREATE-CJ-ORDER] Product not found:", productId);
    return null;
  }

  // Check if product has variants - we MUST use variant ID (vid), not product ID (pid)
  if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
    const variants = product.variants as Array<{
      vid: string;
      variantSku: string;
      variantNameEn?: string;
      variantKey?: string;
    }>;
    
    // If a variant name was specified, try to find matching variant
    if (variantName) {
      const matchingVariant = variants.find(
        (v: any) => 
          v.variantNameEn?.toLowerCase() === variantName.toLowerCase() ||
          v.variantKey?.toLowerCase().includes(variantName.toLowerCase())
      );
      
      if (matchingVariant) {
        console.log("[CREATE-CJ-ORDER] Found matching variant:", matchingVariant.vid);
        return { vid: matchingVariant.vid, sku: matchingVariant.variantSku };
      }
    }
    
    // Use the first variant if no match or no variant name specified
    const firstVariant = variants[0];
    console.log("[CREATE-CJ-ORDER] Using first variant:", firstVariant.vid);
    return { vid: firstVariant.vid, sku: firstVariant.variantSku };
  }

  // Fallback: If no variants, try to use cj_product_id (but this may not work for all products)
  console.warn("[CREATE-CJ-ORDER] Product has no variants, using cj_product_id as fallback");
  if (product.cj_product_id) {
    return { vid: product.cj_product_id, sku: product.sku || "" };
  }

  return null;
}

// Parse shipping aging string to estimated days
function parseShippingDays(agingStr: string): number {
  if (!agingStr) return 30;
  const match = agingStr.match(/(\d+)\s*[-~]\s*(\d+)/);
  if (match) {
    return Math.round((parseInt(match[1]) + parseInt(match[2])) / 2);
  }
  const singleMatch = agingStr.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1]);
  }
  return 30;
}

// Get optimal warehouses for a destination country
function getOptimalWarehouses(destinationCountry: string) {
  const region = COUNTRY_REGIONS[destinationCountry] || 'americas';
  
  return [...CJ_WAREHOUSES].sort((a, b) => {
    const aInRegion = a.region === region;
    const bInRegion = b.region === region;
    
    if (aInRegion && !bInRegion) return -1;
    if (!aInRegion && bInRegion) return 1;
    
    return a.priority - b.priority;
  });
}

// Calculate freight for a single warehouse
async function calculateFreightForWarehouse(
  accessToken: string,
  products: CJOrderProduct[],
  startCountryCode: string,
  endCountryCode: string,
  zip?: string
): Promise<{ logisticName: string; logisticPrice: number; logisticAging: string }[] | null> {
  console.log(`[WAREHOUSE] Calculating freight from ${startCountryCode} to ${endCountryCode}`);

  try {
    const response = await fetch(`${CJ_API_BASE}/logistic/freightCalculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": accessToken,
      },
      body: JSON.stringify({
        startCountryCode,
        endCountryCode,
        zip: zip || "",
        products: products.map(p => ({ vid: p.vid, quantity: p.quantity })),
      }),
    });

    const data = await response.json();

    if (data.result && data.data && data.data.length > 0) {
      return data.data;
    }
  } catch (error) {
    console.error(`[WAREHOUSE] Error calculating freight from ${startCountryCode}:`, error);
  }

  return null;
}

// Multi-warehouse optimization: Find best warehouse based on customer location
async function findOptimalWarehouse(
  accessToken: string,
  products: CJOrderProduct[],
  destinationCountry: string,
  zip?: string
): Promise<WarehouseOption | null> {
  console.log(`[WAREHOUSE-OPT] Finding optimal warehouse for destination: ${destinationCountry}`);
  
  const optimalWarehouses = getOptimalWarehouses(destinationCountry);
  console.log(`[WAREHOUSE-OPT] Checking warehouses in order:`, optimalWarehouses.map(w => w.code));
  
  const warehouseOptions: WarehouseOption[] = [];
  
  // Check top 3 warehouses by regional priority
  const warehousesToCheck = optimalWarehouses.slice(0, 3);
  
  for (const warehouse of warehousesToCheck) {
    const freightOptions = await calculateFreightForWarehouse(
      accessToken,
      products,
      warehouse.code,
      destinationCountry,
      zip
    );
    
    if (freightOptions && freightOptions.length > 0) {
      // Get the best option from this warehouse (cheapest)
      const sortedOptions = freightOptions.sort((a: any, b: any) => a.logisticPrice - b.logisticPrice);
      const bestOption = sortedOptions[0];
      
      const estimatedDays = parseShippingDays(bestOption.logisticAging);
      
      warehouseOptions.push({
        warehouseCode: warehouse.code,
        warehouseName: warehouse.name,
        logisticName: bestOption.logisticName,
        logisticPrice: bestOption.logisticPrice,
        logisticAging: bestOption.logisticAging,
        estimatedDays,
        score: 0, // Will be calculated after we have all options
      });
      
      console.log(`[WAREHOUSE-OPT] ${warehouse.code}: $${bestOption.logisticPrice}, ${bestOption.logisticAging}`);
    }
  }
  
  if (warehouseOptions.length === 0) {
    console.error("[WAREHOUSE-OPT] No warehouse options available");
    return null;
  }
  
  // Calculate scores (lower is better)
  // Factors: price weight 0.4, speed weight 0.6
  const maxPrice = Math.max(...warehouseOptions.map(w => w.logisticPrice));
  const maxDays = Math.max(...warehouseOptions.map(w => w.estimatedDays));
  
  for (const option of warehouseOptions) {
    const priceScore = maxPrice > 0 ? (option.logisticPrice / maxPrice) * 0.4 : 0;
    const speedScore = maxDays > 0 ? (option.estimatedDays / maxDays) * 0.6 : 0;
    option.score = priceScore + speedScore;
  }
  
  // Sort by score and select best
  warehouseOptions.sort((a, b) => a.score - b.score);
  const bestWarehouse = warehouseOptions[0];
  
  console.log(`[WAREHOUSE-OPT] Selected: ${bestWarehouse.warehouseCode} (${bestWarehouse.warehouseName})`);
  console.log(`[WAREHOUSE-OPT] Shipping: ${bestWarehouse.logisticName} - $${bestWarehouse.logisticPrice} - ${bestWarehouse.logisticAging}`);
  console.log(`[WAREHOUSE-OPT] All options:`, warehouseOptions.map(w => `${w.warehouseCode}: $${w.logisticPrice}/${w.estimatedDays}d (score: ${w.score.toFixed(2)})`));
  
  return bestWarehouse;
}

// Legacy function for backwards compatibility
async function calculateFreight(
  accessToken: string,
  products: CJOrderProduct[],
  startCountryCode: string,
  endCountryCode: string,
  zip?: string
): Promise<{ logisticName: string; logisticPrice: number; logisticAging: string } | null> {
  const options = await calculateFreightForWarehouse(accessToken, products, startCountryCode, endCountryCode, zip);
  
  if (options && options.length > 0) {
    const sortedOptions = options.sort((a: any, b: any) => a.logisticPrice - b.logisticPrice);
    return sortedOptions[0];
  }
  
  return null;
}

// Create order in CJ Dropshipping
async function createCJOrder(
  accessToken: string,
  orderData: CJOrderRequest
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  console.log("[CREATE-CJ-ORDER] Creating CJ order:", orderData.orderNumber);
  console.log("[CREATE-CJ-ORDER] Products:", JSON.stringify(orderData.products));
  console.log("[CREATE-CJ-ORDER] Shipping method:", orderData.logisticName);

  const response = await fetch(`${CJ_API_BASE}/shopping/order/createOrder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CJ-Access-Token": accessToken,
    },
    body: JSON.stringify(orderData),
  });

  const data = await response.json();
  console.log("[CREATE-CJ-ORDER] CJ Create order response:", JSON.stringify(data));

  if (data.result && data.data) {
    // CJ API returns orderId directly as data (string) or as data.orderId
    const orderId = typeof data.data === 'string' ? data.data : data.data.orderId;
    if (orderId) {
      return { success: true, orderId };
    }
  }

  return { success: false, error: data.message || "Unknown error" };
}

// Map country codes to full names
const COUNTRY_NAMES: Record<string, string> = {
  NL: "Netherlands",
  BE: "Belgium",
  DE: "Germany",
  FR: "France",
  GB: "United Kingdom",
  US: "United States",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { orderId } = await req.json();

    if (!orderId) {
      throw new Error("Order ID is required");
    }

    console.log("[CREATE-CJ-ORDER] Processing order:", orderId);

    // Get order details
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // Check if order already has CJ order ID
    if (order.cj_order_id) {
      console.log("[CREATE-CJ-ORDER] Order already has CJ order ID:", order.cj_order_id);
      return new Response(
        JSON.stringify({ success: true, cjOrderId: order.cj_order_id, alreadyCreated: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Check order status
    if (order.status !== "paid") {
      throw new Error(`Order is not paid yet. Status: ${order.status}`);
    }

    // Parse shipping address from Stripe format
    const shippingDetails = order.shipping_address as {
      address?: {
        city?: string;
        country?: string;
        line1?: string;
        line2?: string;
        postal_code?: string;
        state?: string;
      };
      name?: string;
      phone?: string;
    } | null;

    if (!shippingDetails?.address) {
      throw new Error("Order has no shipping address");
    }

    const address = shippingDetails.address;
    const countryCode = address.country || "NL";

    // Get access token
    const accessToken = await getAccessToken(supabaseAdmin);

    // Prepare CJ products
    const items = order.items as OrderItem[];
    const cjProducts: CJOrderProduct[] = [];

    for (const item of items) {
      const variantInfo = await getProductVariant(supabaseAdmin, item.id, item.variant);
      
      if (!variantInfo) {
        console.warn(`[CREATE-CJ-ORDER] Could not find CJ variant for product ${item.id}, skipping`);
        continue;
      }

      cjProducts.push({
        vid: variantInfo.vid,
        quantity: item.quantity,
      });
    }

    if (cjProducts.length === 0) {
      throw new Error("No valid CJ products found in order");
    }

    // Use multi-warehouse optimization to find the best warehouse
    console.log("[CREATE-CJ-ORDER] Starting multi-warehouse optimization...");
    const optimalWarehouse = await findOptimalWarehouse(
      accessToken,
      cjProducts,
      countryCode,
      address.postal_code
    );

    if (!optimalWarehouse) {
      // Fallback to legacy single-warehouse approach
      console.log("[CREATE-CJ-ORDER] Multi-warehouse optimization failed, falling back to US warehouse");
      const shippingInfo = await calculateFreight(
        accessToken,
        cjProducts,
        "US",
        countryCode,
        address.postal_code
      );
      
      if (!shippingInfo) {
        throw new Error("No shipping methods available for this order");
      }
      
      // Use legacy approach
      const cjOrderData: CJOrderRequest = {
        orderNumber: orderId.slice(0, 20),
        shippingZip: address.postal_code || "",
        shippingCountryCode: countryCode,
        shippingCountry: COUNTRY_NAMES[countryCode] || countryCode,
        shippingProvince: address.state || "",
        shippingCity: address.city || "",
        shippingAddress: [address.line1, address.line2].filter(Boolean).join(", "),
        shippingCustomerName: shippingDetails.name || "Customer",
        shippingPhone: shippingDetails.phone || "",
        products: cjProducts,
        fromCountryCode: "US",
        logisticName: shippingInfo.logisticName,
        remark: `GetPawsy Order ${orderId.slice(0, 8)}`,
      };

      const result = await createCJOrder(accessToken, cjOrderData);
      
      if (!result.success) {
        await supabaseAdmin
          .from("orders")
          .update({
            cj_order_status: `error: ${result.error}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        throw new Error(`CJ order creation failed: ${result.error}`);
      }

      await supabaseAdmin
        .from("orders")
        .update({
          cj_order_id: result.orderId,
          cj_order_status: "created",
          cj_order_created_at: new Date().toISOString(),
          cj_shipping_info: {
            warehouse: "US",
            logisticName: shippingInfo.logisticName,
            logisticPrice: shippingInfo.logisticPrice,
            estimatedDays: null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      return new Response(
        JSON.stringify({ success: true, cjOrderId: result.orderId, warehouse: "US" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Create CJ order with optimized warehouse
    const cjOrderData: CJOrderRequest = {
      orderNumber: orderId.slice(0, 20),
      shippingZip: address.postal_code || "",
      shippingCountryCode: countryCode,
      shippingCountry: COUNTRY_NAMES[countryCode] || countryCode,
      shippingProvince: address.state || "",
      shippingCity: address.city || "",
      shippingAddress: [address.line1, address.line2].filter(Boolean).join(", "),
      shippingCustomerName: shippingDetails.name || "Customer",
      shippingPhone: shippingDetails.phone || "",
      products: cjProducts,
      fromCountryCode: optimalWarehouse.warehouseCode,
      logisticName: optimalWarehouse.logisticName,
      remark: `GetPawsy Order ${orderId.slice(0, 8)} [WH:${optimalWarehouse.warehouseCode}]`,
    };

    console.log(`[CREATE-CJ-ORDER] Using warehouse: ${optimalWarehouse.warehouseCode} (${optimalWarehouse.warehouseName})`);
    console.log(`[CREATE-CJ-ORDER] Shipping: ${optimalWarehouse.logisticName} - $${optimalWarehouse.logisticPrice} - ${optimalWarehouse.logisticAging}`);

    const result = await createCJOrder(accessToken, cjOrderData);

    if (!result.success) {
      // Update order with error
      await supabaseAdmin
        .from("orders")
        .update({
          cj_order_status: `error: ${result.error}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      throw new Error(`CJ order creation failed: ${result.error}`);
    }

    // Update order with CJ order ID and warehouse info
    await supabaseAdmin
      .from("orders")
      .update({
        cj_order_id: result.orderId,
        cj_order_status: "created",
        cj_order_created_at: new Date().toISOString(),
        cj_shipping_info: {
          warehouse: optimalWarehouse.warehouseCode,
          warehouseName: optimalWarehouse.warehouseName,
          logisticName: optimalWarehouse.logisticName,
          logisticPrice: optimalWarehouse.logisticPrice,
          estimatedDays: optimalWarehouse.estimatedDays,
          optimizationScore: optimalWarehouse.score,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    console.log("[CREATE-CJ-ORDER] CJ order created successfully:", result.orderId);
    console.log("[CREATE-CJ-ORDER] Warehouse used:", optimalWarehouse.warehouseCode);

    return new Response(
      JSON.stringify({ 
        success: true, 
        cjOrderId: result.orderId,
        warehouse: {
          code: optimalWarehouse.warehouseCode,
          name: optimalWarehouse.warehouseName,
          logisticName: optimalWarehouse.logisticName,
          logisticPrice: optimalWarehouse.logisticPrice,
          estimatedDays: optimalWarehouse.estimatedDays,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[CREATE-CJ-ORDER] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
