import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeliveryNotificationRequest {
  orderId: string;
  customerEmail: string;
  customerName?: string;
}

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
    const { orderId, customerEmail, customerName }: DeliveryNotificationRequest = await req.json();

    if (!orderId || !customerEmail) {
      throw new Error("Missing required fields: orderId and customerEmail");
    }

    console.log(`[SEND-DELIVERY-NOTIFICATION] Sending to ${customerEmail} for order ${orderId}`);

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your order has been delivered!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
      <div style="width: 80px; height: 80px; background-color: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 40px;">✅</span>
      </div>
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
        Your order has been delivered!
      </h1>
      <p style="color: rgba(255,255,255,0.9); margin: 15px 0 0; font-size: 16px;">
        Great news - your package has arrived!
      </p>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
        Hi ${customerName || "there"},
      </p>
      
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
        Wonderful news! Your order <strong style="color: #10b981;">#${orderId.slice(0, 8).toUpperCase()}</strong> has been successfully delivered. We hope you're happy with your new purchase! 🎉
      </p>

      <!-- Success Box -->
      <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; padding: 25px; margin: 25px 0; border-left: 4px solid #10b981;">
        <div style="display: flex; align-items: center; margin-bottom: 10px;">
          <span style="font-size: 24px; margin-right: 10px;">📦</span>
          <span style="color: #065f46; font-weight: 600; font-size: 16px;">Delivery confirmed</span>
        </div>
        <p style="color: #047857; margin: 0; font-size: 14px;">
          Your order was delivered today to your shipping address.
        </p>
      </div>

      <!-- Pet Care Tip -->
      <div style="background-color: #fef3c7; border-radius: 12px; padding: 20px; margin: 25px 0;">
        <p style="color: #92400e; font-size: 14px; margin: 0; line-height: 1.6;">
          <strong>💡 Tip:</strong> Let your pet get used to new products gradually. Start with short introductions and reward positive behavior!
        </p>
      </div>

      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 25px 0;">
        Happy with your purchase? We'd love to hear from you! Share your experience with other pet lovers.
      </p>

      <!-- Review CTA -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://getpawsy.pet" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Shop More Products
        </a>
      </div>

      <!-- Questions Box -->
      <div style="background-color: #f3f4f6; border-radius: 12px; padding: 20px; margin-top: 30px;">
        <p style="color: #4b5563; font-size: 14px; margin: 0; line-height: 1.6;">
          <strong>Questions or issues?</strong><br>
          Our customer service team is here to help! Contact us via our website.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #1f2937; padding: 30px; text-align: center;">
      <p style="color: #9ca3af; font-size: 14px; margin: 0 0 10px;">
        Thank you for shopping at GetPawsy! 🐾
      </p>
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        © ${new Date().getFullYear()} GetPawsy. All rights reserved.
      </p>
    </div>
  </div>
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
        subject: `✅ Your order has been delivered! - Order #${orderId.slice(0, 8).toUpperCase()}`,
        html: emailHtml,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      throw new Error(emailData.message || "Failed to send email");
    }

    console.log("[SEND-DELIVERY-NOTIFICATION] Email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ success: true, emailId: emailData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[SEND-DELIVERY-NOTIFICATION] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
