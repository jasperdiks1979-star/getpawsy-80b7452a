import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LookupRequest {
  orderId: string;
  email: string;
  accessToken?: string;
}

// Simple in-memory rate limiting by IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per IP

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

// Clean up old entries periodically
function cleanupRateLimitMap() {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client IP for rate limiting
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                     req.headers.get("cf-connecting-ip") || 
                     "unknown";
    
    // Check rate limit
    const { allowed, remaining } = checkRateLimit(clientIp);
    if (!allowed) {
      console.log("[LOOKUP-GUEST-ORDER] Rate limit exceeded for IP:", clientIp);
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": "60"
          } 
        }
      );
    }

    // Periodically cleanup old rate limit entries
    if (Math.random() < 0.1) {
      cleanupRateLimitMap();
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { orderId, email, accessToken }: LookupRequest = await req.json();

    // Validate inputs
    if (!orderId || typeof orderId !== "string") {
      return new Response(
        JSON.stringify({ error: "Order ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate order ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId.trim())) {
      return new Response(
        JSON.stringify({ error: "Invalid order ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email length
    if (email.length > 255) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Build the query - we use service role to bypass RLS
    // Then validate the request is legitimate
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, created_at, tracking_number, tracking_carrier, customer_email, total_amount, order_access_token, user_id")
      .eq("id", orderId.trim())
      .single();

    if (error || !order) {
      console.log("[LOOKUP-GUEST-ORDER] Order not found:", orderId);
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Security checks:
    // 1. Email must match
    if (order.customer_email?.toLowerCase() !== normalizedEmail) {
      console.log("[LOOKUP-GUEST-ORDER] Email mismatch for order:", orderId);
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. For guest orders (no user_id), we require the access token for extra security
    // If the order was placed by a guest and has an access token, require it
    if (!order.user_id && order.order_access_token) {
      if (!accessToken || accessToken !== order.order_access_token) {
        console.log("[LOOKUP-GUEST-ORDER] Access token missing or invalid for guest order:", orderId);
        // For guest orders without valid token, return limited info
        // This allows lookup by email but doesn't expose full details
        return new Response(
          JSON.stringify({
            order: {
              id: order.id,
              status: order.status,
              created_at: order.created_at,
              // Don't expose tracking details without valid token
              tracking_number: null,
              tracking_carrier: null,
              total_amount: order.total_amount,
            },
            requiresToken: true,
            message: "For full order details, please use the tracking link sent to your email."
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Return order details (excluding sensitive fields)
    const safeOrder = {
      id: order.id,
      status: order.status,
      created_at: order.created_at,
      tracking_number: order.tracking_number,
      tracking_carrier: order.tracking_carrier,
      total_amount: order.total_amount,
    };

    console.log("[LOOKUP-GUEST-ORDER] Order found:", orderId);

    return new Response(
      JSON.stringify({ order: safeOrder }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[LOOKUP-GUEST-ORDER] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
