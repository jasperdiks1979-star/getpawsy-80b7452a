import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ShippingNotificationRequest {
  orderId: string;
  trackingNumber: string;
  trackingCarrier: string;
  customerEmail: string;
  customerName?: string;
}

// Carrier tracking URLs
const CARRIER_TRACKING_URLS: Record<string, string> = {
  usps: "https://tools.usps.com/go/TrackConfirmAction?tLabels=",
  ups: "https://www.ups.com/track?tracknum=",
  fedex: "https://www.fedex.com/fedextrack/?trknbr=",
  dhl: "https://www.dhl.com/us-en/home/tracking.html?tracking-id=",
  postnl: "https://postnl.nl/tracktrace/?B=",
  dpd: "https://tracking.dpd.de/status/nl_NL/parcel/",
  cjpacket: "https://track.yw56.com.cn/en/querydel?nums=",
  chinapost: "https://track.yw56.com.cn/en/querydel?nums=",
  yuntrack: "https://www.yuntrack.com/Track/Detail?",
  "4px": "https://track.4px.com/#/result/0/",
  other: "",
};

const CARRIER_NAMES: Record<string, string> = {
  usps: "USPS",
  ups: "UPS",
  fedex: "FedEx",
  dhl: "DHL",
  postnl: "PostNL",
  dpd: "DPD",
  cjpacket: "CJ Packet",
  chinapost: "China Post",
  yuntrack: "Yuntrack",
  "4px": "4PX",
  other: "Vervoerder",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-internal-secret") ?? "";
    if (provided !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const { orderId, trackingNumber, trackingCarrier, customerEmail, customerName }: ShippingNotificationRequest = await req.json();

    if (!orderId || !trackingNumber || !customerEmail) {
      throw new Error("Missing required fields: orderId, trackingNumber, or customerEmail");
    }

    console.log(`[SHIPPING-NOTIFICATION] Sending email for order ${orderId} to ${customerEmail}`);

    const carrier = trackingCarrier || "other";
    const carrierName = CARRIER_NAMES[carrier] || carrier;
    const trackingUrl = CARRIER_TRACKING_URLS[carrier] 
      ? `${CARRIER_TRACKING_URLS[carrier]}${trackingNumber}`
      : null;

    const firstName = customerName?.split(" ")[0] || "there";

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your order is on its way!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                🚚 Your order is on its way!
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Hi ${firstName},
              </p>
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                Great news! Your order has been shipped and is now on its way to you. 🎉
              </p>
              
              <!-- Tracking Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #fff7ed; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 24px;">
                    <p style="margin: 0 0 8px; color: #9a3412; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                      Tracking Information
                    </p>
                    <p style="margin: 0 0 4px; color: #374151; font-size: 14px;">
                      <strong>Carrier:</strong> ${carrierName}
                    </p>
                    <p style="margin: 0 0 16px; color: #374151; font-size: 14px;">
                      <strong>Tracking number:</strong> <code style="background: #ffffff; padding: 2px 8px; border-radius: 4px; font-family: monospace;">${trackingNumber}</code>
                    </p>
                    ${trackingUrl ? `
                    <a href="${trackingUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                      📦 Track your package
                    </a>
                    ` : ''}
                  </td>
                </tr>
              </table>
              
              <!-- Order Reference -->
              <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px;">
                <strong>Order number:</strong> ${orderId.slice(0, 8).toUpperCase()}
              </p>
              
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Please note that it may take a few days for your package to arrive, depending on your location.
              </p>
              
              <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.6;">
                Thank you for your order at GetPawsy! 🐾
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">
                Questions about your order? Contact us!
              </p>
              <a href="https://getpawsy.pet/contact" style="color: #f97316; text-decoration: none; font-weight: 500;">
                Get in touch
              </a>
              <p style="margin: 20px 0 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} GetPawsy. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "GetPawsy <noreply@getpawsy.pet>",
        to: [customerEmail],
        subject: `🚚 Your order is on its way! - Tracking: ${trackingNumber}`,
        html: emailHtml,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      throw new Error(emailData.message || "Failed to send email");
    }

    console.log("[SHIPPING-NOTIFICATION] Email sent successfully:", emailData);

    // Log to database that notification was sent
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    await supabaseAdmin
      .from("orders")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    return new Response(
      JSON.stringify({ success: true, emailId: emailData.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("[SHIPPING-NOTIFICATION] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
