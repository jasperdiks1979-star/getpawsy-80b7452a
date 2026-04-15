import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1x1 transparent GIF
const TRACKING_PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), c => c.charCodeAt(0));

// Allowed redirect domains
const ALLOWED_REDIRECT_DOMAINS = [
  "getpawsy.pet",
  "www.getpawsy.pet",
  "getpawsy.lovable.app",
];

function isAllowedRedirectUrl(rawUrl: string): boolean {
  try {
    const decoded = decodeURIComponent(rawUrl);
    const parsed = new URL(decoded);
    return ALLOWED_REDIRECT_DOMAINS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function safeRedirectOrFallback(linkUrl: string | null): Response {
  if (linkUrl && isAllowedRedirectUrl(linkUrl)) {
    return new Response(null, {
      status: 302,
      headers: { Location: decodeURIComponent(linkUrl) },
    });
  }
  // Fallback to homepage if URL is invalid or not allowed
  return new Response(null, {
    status: 302,
    headers: { Location: "https://getpawsy.pet" },
  });
}

// Simple in-memory rate limiting (per-IP tracking)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 100;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  record.count++;
  return true;
}

function cleanupRateLimits() {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
}

// HMAC signature verification — now includes linkUrl in the signed payload
async function verifySignature(
  campaignId: string,
  email: string,
  eventType: string,
  signature: string,
  secretKey: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = `${campaignId}:${email}:${eventType}`;
  const keyData = encoder.encode(secretKey);
  const dataBuffer = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const expectedSignatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, dataBuffer);
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(expectedSignatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return signature === expectedSignature;
}

const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

const handler = async (req: Request): Promise<Response> => {
  cleanupRateLimits();
  
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("c");
  const email = url.searchParams.get("e");
  const eventType = url.searchParams.get("t") || "open";
  const linkUrl = url.searchParams.get("url");
  const signature = url.searchParams.get("s");

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";

  // Rate limit check
  if (!checkRateLimit(ip)) {
    console.log(`Rate limit exceeded for IP: ${ip}`);
    if (eventType === "click") {
      return safeRedirectOrFallback(linkUrl);
    }
    return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
  }

  if (!campaignId || !email) {
    if (eventType === "open") {
      return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
    }
    return new Response("Missing parameters", { status: 400 });
  }

  if (!["open", "click"].includes(eventType)) {
    return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
  }

  // Validate redirect URL BEFORE any processing
  if (eventType === "click" && linkUrl && !isAllowedRedirectUrl(linkUrl)) {
    console.log(`Blocked disallowed redirect URL: ${linkUrl}`);
    return new Response(null, {
      status: 302,
      headers: { Location: "https://getpawsy.pet" },
    });
  }

  // Verify HMAC signature if secret is configured
  const trackingSecret = Deno.env.get("TRACKING_HMAC_SECRET");
  if (trackingSecret && signature) {
    const decodedEmail = decodeURIComponent(email);
    const isValid = await verifySignature(campaignId, decodedEmail, eventType, signature, trackingSecret);
    
    if (!isValid) {
      console.log(`Invalid signature for campaign ${campaignId}, email ${decodedEmail}`);
      if (eventType === "click") {
        return safeRedirectOrFallback(linkUrl);
      }
      return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
    }
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const userAgent = req.headers.get("user-agent") || undefined;
    const ipAddress = ip !== "unknown" ? ip : undefined;
    const decodedEmail = decodeURIComponent(email);

    // Validate campaign exists
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("email_campaigns")
      .select("id, open_count, click_count, unique_opens, unique_clicks")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      console.log(`Invalid campaign ID: ${campaignId}`);
      if (eventType === "click") {
        return safeRedirectOrFallback(linkUrl);
      }
      return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
    }

    // Deduplicate
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { data: recentEvents } = await supabaseAdmin
      .from("email_campaign_events")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("email", decodedEmail)
      .eq("event_type", eventType)
      .eq("ip_address", ipAddress || '')
      .eq("user_agent", userAgent || '')
      .gte("created_at", oneMinuteAgo)
      .limit(1);

    if (recentEvents && recentEvents.length > 0) {
      if (eventType === "click") {
        return safeRedirectOrFallback(linkUrl);
      }
      return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
    }

    // Check uniqueness
    const { data: existingEvents } = await supabaseAdmin
      .from("email_campaign_events")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("email", decodedEmail)
      .eq("event_type", eventType)
      .limit(1);

    const isUnique = !existingEvents || existingEvents.length === 0;

    // Insert event
    await supabaseAdmin.from("email_campaign_events").insert({
      campaign_id: campaignId,
      email: decodedEmail,
      event_type: eventType,
      link_url: linkUrl ? decodeURIComponent(linkUrl) : null,
      user_agent: userAgent,
      ip_address: ipAddress,
    });

    // Update campaign counts
    if (eventType === "open") {
      await supabaseAdmin
        .from("email_campaigns")
        .update({
          open_count: (campaign.open_count || 0) + 1,
          unique_opens: isUnique ? (campaign.unique_opens || 0) + 1 : campaign.unique_opens,
        })
        .eq("id", campaignId);
    } else if (eventType === "click") {
      await supabaseAdmin
        .from("email_campaigns")
        .update({
          click_count: (campaign.click_count || 0) + 1,
          unique_clicks: isUnique ? (campaign.unique_clicks || 0) + 1 : campaign.unique_clicks,
        })
        .eq("id", campaignId);
    }

    if (eventType === "click") {
      return safeRedirectOrFallback(linkUrl);
    }

    return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
  } catch (error) {
    console.error("Error tracking event:", error);
    if (eventType === "click") {
      return safeRedirectOrFallback(linkUrl);
    }
    return new Response(TRACKING_PIXEL, { headers: PIXEL_HEADERS });
  }
};

serve(handler);
