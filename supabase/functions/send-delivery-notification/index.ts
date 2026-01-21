import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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

  try {
    const { orderId, customerEmail, customerName }: DeliveryNotificationRequest = await req.json();

    if (!orderId || !customerEmail) {
      throw new Error("Missing required fields: orderId and customerEmail");
    }

    console.log(`[SEND-DELIVERY-NOTIFICATION] Sending to ${customerEmail} for order ${orderId}`);

    const emailHtml = `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Je bestelling is afgeleverd!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
      <div style="width: 80px; height: 80px; background-color: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 40px;">✅</span>
      </div>
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
        Je bestelling is afgeleverd!
      </h1>
      <p style="color: rgba(255,255,255,0.9); margin: 15px 0 0; font-size: 16px;">
        Goed nieuws - je pakket is aangekomen!
      </p>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
        Beste ${customerName || "klant"},
      </p>
      
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
        Geweldig nieuws! Je bestelling <strong style="color: #10b981;">#${orderId.slice(0, 8).toUpperCase()}</strong> is succesvol afgeleverd. We hopen dat je blij bent met je nieuwe aankoop! 🎉
      </p>

      <!-- Success Box -->
      <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; padding: 25px; margin: 25px 0; border-left: 4px solid #10b981;">
        <div style="display: flex; align-items: center; margin-bottom: 10px;">
          <span style="font-size: 24px; margin-right: 10px;">📦</span>
          <span style="color: #065f46; font-weight: 600; font-size: 16px;">Aflevering bevestigd</span>
        </div>
        <p style="color: #047857; margin: 0; font-size: 14px;">
          Je bestelling is vandaag afgeleverd op het bezorgadres.
        </p>
      </div>

      <!-- Pet Care Tip -->
      <div style="background-color: #fef3c7; border-radius: 12px; padding: 20px; margin: 25px 0;">
        <p style="color: #92400e; font-size: 14px; margin: 0; line-height: 1.6;">
          <strong>💡 Tip:</strong> Laat je huisdier rustig wennen aan nieuwe producten. Begin met korte introducties en beloon positief gedrag!
        </p>
      </div>

      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 25px 0;">
        Tevreden met je aankoop? We horen het graag! Deel je ervaring met andere dierenliefhebbers.
      </p>

      <!-- Review CTA -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://getpawsy.lovable.app" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Bekijk meer producten
        </a>
      </div>

      <!-- Questions Box -->
      <div style="background-color: #f3f4f6; border-radius: 12px; padding: 20px; margin-top: 30px;">
        <p style="color: #4b5563; font-size: 14px; margin: 0; line-height: 1.6;">
          <strong>Vragen of problemen?</strong><br>
          Ons klantenservice team staat voor je klaar! Neem contact met ons op via onze website.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #1f2937; padding: 30px; text-align: center;">
      <p style="color: #9ca3af; font-size: 14px; margin: 0 0 10px;">
        Bedankt voor je aankoop bij GetPawsy! 🐾
      </p>
      <p style="color: #6b7280; font-size: 12px; margin: 0;">
        © ${new Date().getFullYear()} GetPawsy. Alle rechten voorbehouden.
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const emailResponse = await resend.emails.send({
      from: "GetPawsy <orders@getpawsy.com>",
      to: [customerEmail],
      subject: `✅ Je bestelling is afgeleverd! - Order #${orderId.slice(0, 8).toUpperCase()}`,
      html: emailHtml,
    });

    console.log("[SEND-DELIVERY-NOTIFICATION] Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.id }),
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
