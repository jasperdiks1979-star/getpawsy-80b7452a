import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1x1 transparent GIF
const TRACKING_PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), c => c.charCodeAt(0));

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("c");
  const email = url.searchParams.get("e");
  const eventType = url.searchParams.get("t") || "open";
  const linkUrl = url.searchParams.get("url");

  if (!campaignId || !email) {
    // Return pixel anyway to not break email
    if (eventType === "open") {
      return new Response(TRACKING_PIXEL, {
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    }
    return new Response("Missing parameters", { status: 400 });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const userAgent = req.headers.get("user-agent") || undefined;
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : undefined;

    const decodedEmail = decodeURIComponent(email);

    // Check if this is a unique event for this email/campaign
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

    // Get current campaign counts
    const { data: campaign } = await supabaseAdmin
      .from("email_campaigns")
      .select("open_count, click_count, unique_opens, unique_clicks")
      .eq("id", campaignId)
      .single();

    if (campaign) {
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
    }

    // For click events, redirect to the actual URL
    if (eventType === "click" && linkUrl) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: decodeURIComponent(linkUrl),
        },
      });
    }

    // For open events, return tracking pixel
    return new Response(TRACKING_PIXEL, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Error tracking event:", error);
    
    // Still return pixel/redirect to not break user experience
    if (eventType === "click" && linkUrl) {
      return new Response(null, {
        status: 302,
        headers: { Location: decodeURIComponent(linkUrl) },
      });
    }
    
    return new Response(TRACKING_PIXEL, {
      headers: { "Content-Type": "image/gif" },
    });
  }
};

serve(handler);
