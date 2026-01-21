import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeliveryIssueRequest {
  orderId: string;
  customerEmail: string;
  customerName?: string;
  trackingNumber?: string;
  issueType: "failed_delivery" | "returned" | "stuck" | "exception" | "lost";
  issueDescription: string;
}

const ISSUE_LABELS: Record<string, string> = {
  failed_delivery: "Aflevering mislukt",
  returned: "Pakket retour",
  stuck: "Pakket vastgelopen",
  exception: "Verzendprobleem",
  lost: "Pakket vermist",
};

const ISSUE_ICONS: Record<string, string> = {
  failed_delivery: "🚫",
  returned: "↩️",
  stuck: "⏸️",
  exception: "⚠️",
  lost: "❓",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, customerEmail, customerName, trackingNumber, issueType, issueDescription }: DeliveryIssueRequest = await req.json();

    if (!orderId || !issueType) {
      throw new Error("Missing required fields: orderId and issueType");
    }

    console.log(`[NOTIFY-DELIVERY-ISSUE] Sending admin notification for order ${orderId}, issue: ${issueType}`);

    const issueLabel = ISSUE_LABELS[issueType] || issueType;
    const issueIcon = ISSUE_ICONS[issueType] || "⚠️";

    const emailHtml = `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Afleveringsprobleem - Actie vereist</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px; text-align: center;">
              <span style="font-size: 48px;">${issueIcon}</span>
              <h1 style="margin: 15px 0 0; color: #ffffff; font-size: 24px; font-weight: 700;">
                Afleveringsprobleem Gedetecteerd
              </h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">
                ${issueLabel}
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Er is een probleem gedetecteerd met de aflevering van een bestelling. Directe actie kan nodig zijn.
              </p>
              
              <!-- Order Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #fef2f2; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #dc2626;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px; color: #991b1b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                      Bestellinggegevens
                    </p>
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 4px 0; color: #6b7280; font-size: 14px; width: 140px;">Order ID:</td>
                        <td style="padding: 4px 0; color: #111827; font-size: 14px; font-weight: 600;">${orderId.slice(0, 8).toUpperCase()}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Volledig ID:</td>
                        <td style="padding: 4px 0; color: #111827; font-size: 12px; font-family: monospace;">${orderId}</td>
                      </tr>
                      ${customerName ? `
                      <tr>
                        <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Klant:</td>
                        <td style="padding: 4px 0; color: #111827; font-size: 14px;">${customerName}</td>
                      </tr>
                      ` : ''}
                      ${customerEmail ? `
                      <tr>
                        <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Email:</td>
                        <td style="padding: 4px 0; color: #111827; font-size: 14px;"><a href="mailto:${customerEmail}" style="color: #dc2626;">${customerEmail}</a></td>
                      </tr>
                      ` : ''}
                      ${trackingNumber ? `
                      <tr>
                        <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Trackingnummer:</td>
                        <td style="padding: 4px 0; color: #111827; font-size: 14px; font-family: monospace;">${trackingNumber}</td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Issue Description -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #fff7ed; border-radius: 8px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #9a3412; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                      Probleemomschrijving
                    </p>
                    <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">
                      ${issueDescription}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Action Required -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #fef3c7; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #92400e; font-size: 14px; font-weight: 600;">
                      💡 Aanbevolen acties:
                    </p>
                    <ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.8;">
                      <li>Controleer de tracking status bij de vervoerder</li>
                      <li>Neem contact op met de klant indien nodig</li>
                      <li>Overweeg een vervangend pakket te sturen</li>
                      <li>Log het probleem voor kwaliteitscontrole</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <div style="text-align: center; margin-top: 25px;">
                <a href="https://getpawsy.lovable.app/admin" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Bekijk in Admin Dashboard
                </a>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                Dit is een automatische notificatie van GetPawsy Order Management
              </p>
              <p style="margin: 8px 0 0; color: #9ca3af; font-size: 11px;">
                ${new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}
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

    // Send to admin email
    const adminEmail = Deno.env.get("ADMIN_EMAIL") || "admin@getpawsy.nl";

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "GetPawsy Alerts <noreply@getpawsy.nl>",
        to: [adminEmail],
        subject: `${issueIcon} Afleveringsprobleem: ${issueLabel} - Order #${orderId.slice(0, 8).toUpperCase()}`,
        html: emailHtml,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      throw new Error(emailData.message || "Failed to send email");
    }

    console.log("[NOTIFY-DELIVERY-ISSUE] Admin notification sent successfully:", emailData);

    return new Response(
      JSON.stringify({ success: true, emailId: emailData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[NOTIFY-DELIVERY-ISSUE] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
