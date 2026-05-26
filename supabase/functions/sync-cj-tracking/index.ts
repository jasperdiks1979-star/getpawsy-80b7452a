import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

interface TrackingInfo {
  trackingNumber: string;
  logisticName: string;
  trackingStatus: string;
  trackingDetails: Array<{
    date: string;
    status: string;
    description: string;
  }>;
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
      console.log("[SYNC-CJ-TRACKING] Using cached CJ access token");
      return cachedData.access_token;
    }
    console.log("[SYNC-CJ-TRACKING] Cached token expired, requesting new one...");
  }

  // CJ API 2.0 uses apiKey only (not email+password)
  const apiKey = Deno.env.get("CJ_API_KEY");

  if (!apiKey) {
    throw new Error("CJ_API_KEY not configured");
  }

  console.log("[SYNC-CJ-TRACKING] Requesting new CJ access token with apiKey...");

  const response = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });

  const data = await response.json();
  
  if (!data.result || !data.data?.accessToken) {
    throw new Error(`CJ authentication failed: ${data.message || "Unknown error"}`);
  }

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

// Get order details from CJ API
async function getCJOrderDetails(accessToken: string, cjOrderId: string): Promise<{
  status: string;
  trackingNumber?: string;
  logisticName?: string;
} | null> {
  console.log("[SYNC-CJ-TRACKING] Fetching CJ order details for:", cjOrderId);

  const response = await fetch(`${CJ_API_BASE}/shopping/order/getOrderDetail?orderId=${cjOrderId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "CJ-Access-Token": accessToken,
    },
  });

  const data = await response.json();
  console.log("[SYNC-CJ-TRACKING] CJ order details response:", JSON.stringify(data));

  if (data.result && data.data) {
    const orderData = data.data;
    return {
      status: orderData.orderStatus || "unknown",
      trackingNumber: orderData.trackNumber || orderData.trackingNumber,
      logisticName: orderData.logisticName,
    };
  }

  return null;
}

// Get tracking info from CJ API
async function getCJTrackingInfo(accessToken: string, trackingNumber: string): Promise<TrackingInfo | null> {
  console.log("[SYNC-CJ-TRACKING] Fetching tracking info for:", trackingNumber);

  const response = await fetch(`${CJ_API_BASE}/logistic/getTrackInfo?trackNumber=${trackingNumber}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "CJ-Access-Token": accessToken,
    },
  });

  const data = await response.json();
  console.log("[SYNC-CJ-TRACKING] CJ tracking response:", JSON.stringify(data));

  if (data.result && data.data) {
    const trackData = data.data;
    return {
      trackingNumber: trackingNumber,
      logisticName: trackData.logisticName || "",
      trackingStatus: trackData.status || "in_transit",
      trackingDetails: (trackData.trackInfo || []).map((info: any) => ({
        date: info.date || info.acceptTime,
        status: info.status || "",
        description: info.content || info.acceptAddress || "",
      })),
    };
  }

  return null;
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get optional orderId from request body (for single order sync)
    let singleOrderId: string | null = null;
    try {
      const body = await req.json();
      singleOrderId = body.orderId || null;
    } catch {
      // No body or invalid JSON, sync all orders
    }

    // Get access token
    const accessToken = await getAccessToken(supabaseAdmin);

    let ordersToSync: any[] = [];

    if (singleOrderId) {
      // Sync single order
      const { data, error } = await supabaseAdmin
        .from("orders")
        .select("id, cj_order_id, cj_order_status, tracking_number, status, customer_email, shipping_address")
        .eq("id", singleOrderId)
        .not("cj_order_id", "is", null)
        .single();

      if (error) {
        throw new Error(`Order not found: ${singleOrderId}`);
      }
      ordersToSync = [data];
    } else {
      // Get all orders with CJ order ID that are not yet delivered
      const { data: orders, error: ordersError } = await supabaseAdmin
        .from("orders")
        .select("id, cj_order_id, cj_order_status, tracking_number, status, customer_email, shipping_address")
        .not("cj_order_id", "is", null)
        .not("status", "in", "(delivered,cancelled)")
        .order("created_at", { ascending: false })
        .limit(50); // Process max 50 orders at a time

      if (ordersError) {
        throw new Error(`Failed to fetch orders: ${ordersError.message}`);
      }

      ordersToSync = orders || [];
    }

    console.log(`[SYNC-CJ-TRACKING] Syncing ${ordersToSync.length} orders...`);

    const results: Array<{
      orderId: string;
      success: boolean;
      status?: string;
      trackingNumber?: string;
      error?: string;
    }> = [];

    for (const order of ordersToSync) {
      try {
        console.log(`[SYNC-CJ-TRACKING] Processing order ${order.id} (CJ: ${order.cj_order_id})`);

        // Get CJ order details
        const cjDetails = await getCJOrderDetails(accessToken, order.cj_order_id);

        if (!cjDetails) {
          results.push({
            orderId: order.id,
            success: false,
            error: "Could not fetch CJ order details",
          });
          continue;
        }

        const updateData: Record<string, any> = {
          cj_order_status: cjDetails.status,
          updated_at: new Date().toISOString(),
        };

        // Update order status based on CJ status
        const newStatus = mapCJStatusToOrderStatus(cjDetails.status);
        if (newStatus !== order.status && newStatus !== "processing") {
          updateData.status = newStatus;
        }

        // Track if we have new tracking info to send notification
        let shouldSendShippingNotification = false;
        let shouldSendDeliveryNotification = false;
        let newTrackingNumber: string | null = null;
        let newTrackingCarrier: string | null = null;

        // If tracking number available, update it
        if (cjDetails.trackingNumber && cjDetails.trackingNumber !== order.tracking_number) {
          updateData.tracking_number = cjDetails.trackingNumber;
          updateData.tracking_carrier = mapCarrierName(cjDetails.logisticName || "");
          newTrackingNumber = cjDetails.trackingNumber;
          newTrackingCarrier = updateData.tracking_carrier;
          shouldSendShippingNotification = true; // New tracking = send shipping notification

          // Get detailed tracking info
          const trackingInfo = await getCJTrackingInfo(accessToken, cjDetails.trackingNumber);
          if (trackingInfo) {
            updateData.cj_shipping_info = {
              trackingNumber: trackingInfo.trackingNumber,
              logisticName: trackingInfo.logisticName,
              status: trackingInfo.trackingStatus,
              details: trackingInfo.trackingDetails,
              lastUpdated: new Date().toISOString(),
            };
          }
        } else if (order.tracking_number) {
          // Refresh tracking info for existing tracking number
          const trackingInfo = await getCJTrackingInfo(accessToken, order.tracking_number);
          if (trackingInfo) {
            updateData.cj_shipping_info = {
              trackingNumber: trackingInfo.trackingNumber,
              logisticName: trackingInfo.logisticName,
              status: trackingInfo.trackingStatus,
              details: trackingInfo.trackingDetails,
              lastUpdated: new Date().toISOString(),
            };

            const statusLower = trackingInfo.trackingStatus?.toLowerCase() || "";
            const latestDetail = trackingInfo.trackingDetails?.[0]?.description?.toLowerCase() || "";

            // Check for delivery issues - detect problems in tracking status
            const issueKeywords = ["failed", "exception", "returned", "undeliverable", "refused", "held", "customs", "problem", "unable"];
            const hasDeliveryIssue = issueKeywords.some(keyword => 
              statusLower.includes(keyword) || latestDetail.includes(keyword)
            );

            if (hasDeliveryIssue) {
              // Determine issue type
              let issueType: "failed_delivery" | "returned" | "stuck" | "exception" | "lost" = "exception";
              let issueDescription = `Tracking status: ${trackingInfo.trackingStatus}`;

              if (statusLower.includes("return") || latestDetail.includes("return")) {
                issueType = "returned";
                issueDescription = "Het pakket wordt teruggestuurd naar de afzender.";
              } else if (statusLower.includes("fail") || latestDetail.includes("fail") || latestDetail.includes("unable")) {
                issueType = "failed_delivery";
                issueDescription = "Aflevering is mislukt. Het pakket kon niet worden bezorgd.";
              } else if (statusLower.includes("held") || statusLower.includes("customs")) {
                issueType = "stuck";
                issueDescription = "Het pakket is vastgehouden, mogelijk bij de douane.";
              } else if (statusLower.includes("refused")) {
                issueType = "failed_delivery";
                issueDescription = "Het pakket is geweigerd door de ontvanger.";
              }

              if (latestDetail) {
                issueDescription += ` Details: ${trackingInfo.trackingDetails?.[0]?.description}`;
              }

              // Send admin notification
              try {
                const shippingAddress = order.shipping_address as { name?: string } | null;
                const customerName = shippingAddress?.name || "";

                console.log(`[SYNC-CJ-TRACKING] Delivery issue detected for order ${order.id}: ${issueType}`);

                await fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-delivery-issue`,
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
                      trackingNumber: order.tracking_number,
                      issueType,
                      issueDescription,
                    }),
                  }
                );
              } catch (issueNotifyError) {
                console.error(`[SYNC-CJ-TRACKING] Error sending issue notification:`, issueNotifyError);
              }
            }

            // Check if package is delivered
            if (statusLower.includes("deliver") && !hasDeliveryIssue) {
              // Only send delivery notification if status is changing to delivered
              if (order.status !== "delivered") {
                shouldSendDeliveryNotification = true;
              }
              updateData.status = "delivered";
            }
          }
        }

        // Send shipping notification email if we have new tracking info
        if (shouldSendShippingNotification && order.customer_email && newTrackingNumber) {
          try {
            const shippingAddress = order.shipping_address as { name?: string } | null;
            const customerName = shippingAddress?.name || "";
            
            console.log(`[SYNC-CJ-TRACKING] Sending shipping notification to ${order.customer_email}`);
            
            const notifyResponse = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-shipping-notification`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
                  "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
                },
                body: JSON.stringify({
                  orderId: order.id,
                  trackingNumber: newTrackingNumber,
                  trackingCarrier: newTrackingCarrier,
                  customerEmail: order.customer_email,
                  customerName,
                }),
              }
            );
            
            if (notifyResponse.ok) {
              console.log(`[SYNC-CJ-TRACKING] Shipping notification sent for order ${order.id}`);
            } else {
              const errorText = await notifyResponse.text();
              console.error(`[SYNC-CJ-TRACKING] Failed to send shipping notification: ${errorText}`);
            }
          } catch (notifyError) {
            console.error(`[SYNC-CJ-TRACKING] Error sending shipping notification:`, notifyError);
            // Don't fail the sync if notification fails
          }
        }

        // Send delivery notification email if order just got delivered
        if (shouldSendDeliveryNotification && order.customer_email) {
          try {
            const shippingAddress = order.shipping_address as { name?: string } | null;
            const customerName = shippingAddress?.name || "";
            
            console.log(`[SYNC-CJ-TRACKING] Sending delivery notification to ${order.customer_email}`);
            
            const deliveryResponse = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-delivery-notification`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
                  "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
                },
                body: JSON.stringify({
                  orderId: order.id,
                  customerEmail: order.customer_email,
                  customerName,
                }),
              }
            );
            
            if (deliveryResponse.ok) {
              console.log(`[SYNC-CJ-TRACKING] Delivery notification sent for order ${order.id}`);
            } else {
              const errorText = await deliveryResponse.text();
              console.error(`[SYNC-CJ-TRACKING] Failed to send delivery notification: ${errorText}`);
            }
          } catch (deliveryError) {
            console.error(`[SYNC-CJ-TRACKING] Error sending delivery notification:`, deliveryError);
            // Don't fail the sync if notification fails
          }
        }

        // Update order
        const { error: updateError } = await supabaseAdmin
          .from("orders")
          .update(updateData)
          .eq("id", order.id);

        if (updateError) {
          throw new Error(`Failed to update order: ${updateError.message}`);
        }

        results.push({
          orderId: order.id,
          success: true,
          status: updateData.status || order.status,
          trackingNumber: updateData.tracking_number || order.tracking_number,
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (orderError) {
        const errorMessage = orderError instanceof Error ? orderError.message : "Unknown error";
        console.error(`[SYNC-CJ-TRACKING] Error processing order ${order.id}:`, errorMessage);
        results.push({
          orderId: order.id,
          success: false,
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[SYNC-CJ-TRACKING] Completed. ${successCount}/${results.length} orders synced successfully.`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: successCount,
        total: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[SYNC-CJ-TRACKING] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
