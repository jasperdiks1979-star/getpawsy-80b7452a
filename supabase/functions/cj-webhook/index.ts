import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CJWebhookPayload {
  messageId: string;
  type: "ORDER" | "ORDERSPLIT" | "STOCK" | "PRODUCT" | "VARIANT";
  messageType: "INSERT" | "UPDATE" | "DELETE" | "ORDER_CONNECTED";
  params: Record<string, unknown>;
}

interface OrderParams {
  orderNumber?: string;
  cjOrderId?: string | number;
  orderStatus?: string;
  logisticName?: string;
  trackNumber?: string;
  trackingUrl?: string;
  createDate?: string;
  updateDate?: string;
  payDate?: string;
  deliveryDate?: string;
  completeDate?: string;
}

interface StockParams {
  [vid: string]: Array<{
    vid: string;
    areaId: string;
    areaEn: string;
    countryCode: string;
    storageNum: number;
  }>;
}

interface OrderRecord {
  id: string;
  status: string;
  tracking_number: string | null;
  customer_email: string | null;
  shipping_address: { name?: string } | null;
  cj_shipping_info: Record<string, unknown> | null;
}

interface ProductRecord {
  id: string;
  variants: Array<{ vid?: string; stock?: number }> | null;
  stock: number | null;
}

// Map CJ order status to our internal status
function mapCJStatusToOrderStatus(cjStatus: string): string {
  const statusMap: Record<string, string> = {
    CREATED: "processing",
    PENDING: "processing",
    AWAITING_PAYMENT: "processing",
    IN_CART: "processing",
    UNSHIPPED: "processing",
    SHIPPED: "shipped",
    DELIVERED: "delivered",
    CANCELLED: "cancelled",
    ON_HOLD: "processing",
    COMPLETED: "delivered",
  };
  
  return statusMap[cjStatus?.toUpperCase()] || "processing";
}

// Map carrier name to our internal carrier code
function mapCarrierName(logisticName: string): string {
  const carrierMap: Record<string, string> = {
    "CJPacket": "cjpacket",
    "CJ Packet": "cjpacket",
    "USPS": "usps",
    "UPS": "ups",
    "FedEx": "fedex",
    "DHL": "dhl",
    "PostNL": "postnl",
    "China Post": "chinapost",
    "Yuntrack": "yuntrack",
    "Yanwen": "yanwen",
    "4PX": "4px",
  };

  for (const [key, value] of Object.entries(carrierMap)) {
    if (logisticName?.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  
  return "other";
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle GET requests (browser access, health checks)
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ 
        status: "ok", 
        service: "CJ Dropshipping Webhook Handler",
        message: "Webhook endpoint is active. Send POST requests from CJ Dropshipping.",
        timestamp: new Date().toISOString(),
      }), 
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed. Use POST." }), 
      { 
        status: 405, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }

  const startTime = Date.now();

  try {
    // ---- Webhook authenticity check ----
    // CJ supports either a shared secret in a header (configured in CJ dashboard)
    // or an HMAC-SHA256 signature. Reject when the expected secret is set
    // but the request does not present it.
    const expectedSecret = Deno.env.get("CJ_WEBHOOK_SECRET");
    if (expectedSecret) {
      const provided =
        req.headers.get("x-cj-secret") ??
        req.headers.get("x-webhook-secret") ??
        req.headers.get("x-cj-signature") ??
        "";
      // Plain shared-secret equality (CJ may also pass an HMAC; treat both the
      // same — only callers that know the secret can forge a valid header).
      let ok = provided === expectedSecret;
      if (!ok && provided && provided.length === 64) {
        try {
          const bodyText = await req.clone().text();
          const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(expectedSecret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
          );
          const sig = await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(bodyText),
          );
          const hex = Array.from(new Uint8Array(sig))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          ok = hex === provided.toLowerCase();
        } catch (_e) {
          ok = false;
        }
      }
      if (!ok) {
        console.warn("[CJ-WEBHOOK] Rejected request: missing/invalid signature");
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      console.warn("[CJ-WEBHOOK] CJ_WEBHOOK_SECRET not configured; accepting webhook without verification");
    }

    // Check if request has a body
    const contentLength = req.headers.get("content-length");
    const contentType = req.headers.get("content-type");
    
    if (!contentLength || contentLength === "0") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Empty request body. Expected JSON payload from CJ Dropshipping." 
        }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Parse JSON body safely
    let payload: CJWebhookPayload;
    try {
      const bodyText = await req.text();
      if (!bodyText || bodyText.trim() === "") {
        return new Response(
          JSON.stringify({ success: false, error: "Empty JSON body" }), 
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      payload = JSON.parse(bodyText);
    } catch (parseError) {
      console.error("[CJ-WEBHOOK] JSON parse error:", parseError);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON format" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    if (!payload.messageId || !payload.type) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: messageId and type" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // deno-lint-ignore no-explicit-any
    const supabaseAdmin: SupabaseClient<any> = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    
    console.log(`[CJ-WEBHOOK] Received ${payload.type} webhook:`, JSON.stringify(payload));

    // Log the webhook event
    await supabaseAdmin.from("cj_webhook_logs").insert({
      message_id: payload.messageId,
      webhook_type: payload.type,
      message_type: payload.messageType,
      payload: payload.params,
      processed: false,
    });

    // Process based on webhook type
    switch (payload.type) {
      case "ORDER":
        await processOrderWebhook(supabaseAdmin, payload.messageType, payload.params as OrderParams);
        break;
      
      case "ORDERSPLIT":
        await processOrderSplitWebhook(supabaseAdmin, payload.params);
        break;
      
      case "STOCK":
        await processStockWebhook(supabaseAdmin, payload.params as StockParams);
        break;
      
      case "PRODUCT":
      case "VARIANT":
        // Log but don't process product updates automatically
        console.log(`[CJ-WEBHOOK] ${payload.type} update received - logged for review`);
        break;
      
      default:
        console.log(`[CJ-WEBHOOK] Unknown webhook type: ${payload.type}`);
    }

    // Mark webhook as processed
    await supabaseAdmin
      .from("cj_webhook_logs")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("message_id", payload.messageId);

    const duration = Date.now() - startTime;
    console.log(`[CJ-WEBHOOK] Processed in ${duration}ms`);

    // CJ requires 200 OK response within 3 seconds
    return new Response(JSON.stringify({ success: true, messageId: payload.messageId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[CJ-WEBHOOK] Error:", error);
    
    // Still return 200 to prevent CJ from retrying
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// deno-lint-ignore no-explicit-any
async function processOrderWebhook(
  supabase: SupabaseClient<any>,
  messageType: string,
  params: OrderParams
) {
  const cjOrderId = String(params.cjOrderId);
  const orderNumber = params.orderNumber;

  console.log(`[CJ-WEBHOOK] Processing ORDER ${messageType} for CJ Order: ${cjOrderId}`);

  // Find the order by CJ order ID or our order number
  const { data, error: findError } = await supabase
    .from("orders")
    .select("id, status, tracking_number, customer_email, shipping_address")
    .or(`cj_order_id.eq.${cjOrderId},id.eq.${orderNumber}`)
    .single();

  if (findError || !data) {
    console.log(`[CJ-WEBHOOK] Order not found for CJ ID: ${cjOrderId}`);
    return;
  }

  const order = data as OrderRecord;

  // Prepare update data
  const updateData: Record<string, unknown> = {
    cj_order_status: params.orderStatus,
    updated_at: new Date().toISOString(),
  };

  // Map CJ status to our status
  const newStatus = mapCJStatusToOrderStatus(params.orderStatus || "");
  if (newStatus !== order.status && newStatus !== "processing") {
    updateData.status = newStatus;
  }

  // Track notifications to send
  let shouldSendShippingNotification = false;
  let shouldSendDeliveryNotification = false;

  // Update tracking info if available
  if (params.trackNumber && params.trackNumber !== order.tracking_number) {
    updateData.tracking_number = params.trackNumber;
    updateData.tracking_carrier = mapCarrierName(params.logisticName || "");
    
    // Build shipping info from webhook data
    updateData.cj_shipping_info = {
      trackingNumber: params.trackNumber,
      logisticName: params.logisticName,
      trackingUrl: params.trackingUrl,
      status: params.orderStatus,
      deliveryDate: params.deliveryDate,
      lastUpdated: new Date().toISOString(),
      source: "webhook",
    };

    shouldSendShippingNotification = true;
    console.log(`[CJ-WEBHOOK] New tracking number: ${params.trackNumber}`);
  }

  // Check for delivery
  if (params.completeDate || params.orderStatus?.toUpperCase() === "DELIVERED" || params.orderStatus?.toUpperCase() === "COMPLETED") {
    if (order.status !== "delivered") {
      updateData.status = "delivered";
      shouldSendDeliveryNotification = true;
    }
  }

  // Update order in database
  const { error: updateError } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", order.id);

  if (updateError) {
    console.error(`[CJ-WEBHOOK] Failed to update order:`, updateError);
    return;
  }

  console.log(`[CJ-WEBHOOK] Order ${order.id} updated successfully`);

  // Send shipping notification
  if (shouldSendShippingNotification && order.customer_email) {
    try {
      const customerName = order.shipping_address?.name || "";

      console.log(`[CJ-WEBHOOK] Sending shipping notification to ${order.customer_email}`);

      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-shipping-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            trackingNumber: params.trackNumber,
            trackingCarrier: updateData.tracking_carrier,
            customerEmail: order.customer_email,
            customerName,
          }),
        }
      );
    } catch (notifyError) {
      console.error(`[CJ-WEBHOOK] Failed to send shipping notification:`, notifyError);
    }
  }

  // Send delivery notification
  if (shouldSendDeliveryNotification && order.customer_email) {
    try {
      const customerName = order.shipping_address?.name || "";

      console.log(`[CJ-WEBHOOK] Sending delivery notification to ${order.customer_email}`);

      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-delivery-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({
            orderId: order.id,
            customerEmail: order.customer_email,
            customerName,
          }),
        }
      );
    } catch (deliveryError) {
      console.error(`[CJ-WEBHOOK] Failed to send delivery notification:`, deliveryError);
    }
  }
}

// deno-lint-ignore no-explicit-any
async function processOrderSplitWebhook(
  supabase: SupabaseClient<any>,
  params: Record<string, unknown>
) {
  const originalOrderId = params.originalOrderId as string;
  const splitOrderList = params.splitOrderList as Array<{
    orderCode: string;
    orderStatus: number;
    productList: Array<{ sku: string; vid: string; quantity: number }>;
  }>;

  console.log(`[CJ-WEBHOOK] Order ${originalOrderId} was split into ${splitOrderList?.length || 0} orders`);

  // Find the original order
  const { data } = await supabase
    .from("orders")
    .select("id, cj_shipping_info")
    .eq("cj_order_id", originalOrderId)
    .single();

  if (data) {
    const order = data as OrderRecord;
    // Store split order info
    await supabase
      .from("orders")
      .update({
        cj_shipping_info: {
          ...(order.cj_shipping_info || {}),
          orderSplit: true,
          splitOrders: splitOrderList,
          splitTime: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    console.log(`[CJ-WEBHOOK] Stored split order info for order ${order.id}`);
  }
}

// deno-lint-ignore no-explicit-any
async function processStockWebhook(
  supabase: SupabaseClient<any>,
  params: StockParams
) {
  console.log(`[CJ-WEBHOOK] Processing stock update for ${Object.keys(params).length} variants`);

  for (const [vid, stockData] of Object.entries(params)) {
    // Calculate total stock across all warehouses
    const totalStock = stockData.reduce((sum, item) => sum + (item.storageNum || 0), 0);

    // Find products with this variant
    const { data: products } = await supabase
      .from("products")
      .select("id, variants, stock")
      .not("variants", "is", null);

    if (!products) continue;

    for (const productData of products) {
      const product = productData as ProductRecord;
      const variants = product.variants;
      if (!variants) continue;

      const hasVariant = variants.some(v => v.vid === vid);
      if (hasVariant) {
        // Update variant stock
        const updatedVariants = variants.map(v => {
          if (v.vid === vid) {
            return { ...v, stock: totalStock };
          }
          return v;
        });

        // Calculate total product stock
        const productStock = updatedVariants.reduce(
          (sum, v) => sum + (v.stock || 0), 
          0
        );

        await supabase
          .from("products")
          .update({
            variants: updatedVariants,
            stock: productStock,
            updated_at: new Date().toISOString(),
          })
          .eq("id", product.id);

        console.log(`[CJ-WEBHOOK] Updated stock for product ${product.id}, variant ${vid}: ${totalStock}`);
      }
    }
  }
}
