import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContactNotificationRequest {
  name: string;
  email: string;
  subject: string;
  message: string;
  orderNumber?: string;
}

const subjectLabels: Record<string, string> = {
  order: "Order Question",
  shipping: "Shipping & Delivery",
  return: "Returns & Refunds",
  product: "Product Question",
  other: "Other",
};

const handler = async (req: Request): Promise<Response> => {
  console.log("Notify contact message function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, subject, message, orderNumber }: ContactNotificationRequest = await req.json();
    
    console.log(`New contact message from: ${name} (${email})`);
    console.log(`Subject: ${subject}, Order Number: ${orderNumber || "N/A"}`);

    const subjectLabel = subjectLabels[subject] || subject;
    const adminEmail = "support@getpawsy.pet";

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Contact Message</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 32px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">
                      🐾 New Contact Message
                    </h1>
                    <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">
                      A customer has reached out via the contact form
                    </p>
                  </td>
                </tr>
                
                <!-- Customer Info -->
                <tr>
                  <td style="padding: 32px 40px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom: 24px;">
                          <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 18px; font-weight: 600;">
                            Customer Information
                          </h2>
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; border-radius: 8px; padding: 16px;">
                            <tr>
                              <td style="padding: 8px 16px;">
                                <p style="margin: 0; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Name</p>
                                <p style="margin: 4px 0 0 0; color: #18181b; font-size: 16px; font-weight: 500;">${name}</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 16px;">
                                <p style="margin: 0; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Email</p>
                                <p style="margin: 4px 0 0 0;">
                                  <a href="mailto:${email}" style="color: #f97316; font-size: 16px; font-weight: 500; text-decoration: none;">${email}</a>
                                </p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 16px;">
                                <p style="margin: 0; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Subject</p>
                                <p style="margin: 4px 0 0 0; color: #18181b; font-size: 16px; font-weight: 500;">${subjectLabel}</p>
                              </td>
                            </tr>
                            ${orderNumber ? `
                            <tr>
                              <td style="padding: 8px 16px;">
                                <p style="margin: 0; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Order Number</p>
                                <p style="margin: 4px 0 0 0; color: #18181b; font-size: 16px; font-weight: 600;">${orderNumber}</p>
                              </td>
                            </tr>
                            ` : ""}
                          </table>
                        </td>
                      </tr>
                      
                      <!-- Message -->
                      <tr>
                        <td>
                          <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 18px; font-weight: 600;">
                            Message
                          </h2>
                          <div style="background-color: #fef3c7; border-left: 4px solid #f97316; border-radius: 0 8px 8px 0; padding: 16px 20px;">
                            <p style="margin: 0; color: #18181b; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${message}</p>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Quick Reply Button -->
                <tr>
                  <td style="padding: 0 40px 32px 40px; text-align: center;">
                    <a href="mailto:${email}?subject=Re: ${subjectLabel}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Reply to Customer
                    </a>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center;">
                    <p style="margin: 0; color: #71717a; font-size: 13px;">
                      This notification was sent from Pawsy contact form.<br>
                      You can also view and manage messages in the admin panel.
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

    const emailResponse = await resend.emails.send({
      from: "Pawsy <noreply@getpawsy.pet>",
      to: [adminEmail],
      subject: `📬 New Contact: ${subjectLabel} from ${name}`,
      html: emailHtml,
      reply_to: email,
    });

    console.log("Admin notification email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in notify-contact-message function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
