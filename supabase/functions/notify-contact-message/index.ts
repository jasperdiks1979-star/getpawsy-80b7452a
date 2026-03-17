import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

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
    
    // Validate required fields
    if (!name || !email || !subject || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase admin client for rate limiting
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check rate limit - 3 messages per hour per email address
    const rateLimitId = `contact_${email.toLowerCase().trim()}`;
    const { data: rateLimitData, error: rateLimitError } = await supabaseAdmin.rpc('check_rate_limit', {
      p_user_id: rateLimitId,
      p_function_name: 'notify-contact-message',
      p_max_requests: 3,
      p_window_minutes: 60
    });

    if (rateLimitError) {
      console.error("Rate limit check error:", rateLimitError);
      // Continue without rate limiting if check fails (fail-open for user experience)
    } else if (rateLimitData && rateLimitData[0] && !rateLimitData[0].allowed) {
      console.log(`Rate limit exceeded for email: ${email}`);
      return new Response(
        JSON.stringify({ 
          error: "Too many messages sent. Please try again later.",
          reset_at: rateLimitData[0].reset_at 
        }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    console.log(`New contact message from: ${name} (${email})`);
    console.log(`Subject: ${subject}, Order Number: ${orderNumber || "N/A"}`);

    const subjectLabel = subjectLabels[subject] || subject;
    const adminEmail = "support@getpawsy.pet";

    // Escape HTML in user-provided content to prevent email injection
    const escapeHtml = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message);
    const safeSubjectLabel = escapeHtml(subjectLabel);
    const safeOrderNumber = orderNumber ? escapeHtml(orderNumber) : null;

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
                                <p style="margin: 4px 0 0 0; color: #18181b; font-size: 16px; font-weight: 500;">${safeName}</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 16px;">
                                <p style="margin: 0; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Email</p>
                                <p style="margin: 4px 0 0 0;">
                                  <a href="mailto:${safeEmail}" style="color: #f97316; font-size: 16px; font-weight: 500; text-decoration: none;">${safeEmail}</a>
                                </p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 16px;">
                                <p style="margin: 0; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Subject</p>
                                <p style="margin: 4px 0 0 0; color: #18181b; font-size: 16px; font-weight: 500;">${safeSubjectLabel}</p>
                              </td>
                            </tr>
                            ${safeOrderNumber ? `
                            <tr>
                              <td style="padding: 8px 16px;">
                                <p style="margin: 0; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Order Number</p>
                                <p style="margin: 4px 0 0 0; color: #18181b; font-size: 16px; font-weight: 600;">${safeOrderNumber}</p>
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
                            <p style="margin: 0; color: #18181b; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${safeMessage}</p>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Quick Reply Button -->
                <tr>
                  <td style="padding: 0 40px 32px 40px; text-align: center;">
                    <a href="mailto:${safeEmail}?subject=Re: ${safeSubjectLabel}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
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

    // Send admin notification email
    const adminEmailResponse = await resend.emails.send({
      from: "Pawsy <noreply@getpawsy.pet>",
      to: [adminEmail],
      subject: `📬 New Contact: ${safeSubjectLabel} from ${safeName}`,
      html: emailHtml,
      reply_to: email,
    });

    console.log("Admin notification email sent successfully:", adminEmailResponse);

    // Send customer confirmation email
    const customerConfirmationHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>We received your message!</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 32px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                      🐾 GetPawsy
                    </h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 24px; font-weight: 600;">
                      Thanks for reaching out, ${safeName}! 💌
                    </h2>
                    <p style="margin: 0 0 24px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                      We've received your message and our team will get back to you within <strong>24-48 business hours</strong>.
                    </p>
                    
                    <!-- Message Summary Box -->
                    <div style="background-color: #f4f4f5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                      <p style="margin: 0 0 8px 0; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Your message</p>
                      <p style="margin: 0 0 16px 0; color: #18181b; font-size: 14px; font-weight: 500;">Subject: ${safeSubjectLabel}</p>
                      <p style="margin: 0; color: #52525b; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${safeMessage.substring(0, 200)}${safeMessage.length > 200 ? '...' : ''}</p>
                    </div>
                    
                    <p style="margin: 0 0 24px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                      In the meantime, you might find answers to common questions in our <a href="https://getpawsy.pet/faq" style="color: #f97316; text-decoration: none; font-weight: 500;">FAQ section</a>.
                    </p>
                    
                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 8px 0;">
                          <a href="https://getpawsy.pet/products" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                            Continue Shopping
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #71717a; font-size: 13px;">
                      Need urgent help? Reply to this email or contact us at
                    </p>
                    <a href="mailto:support@getpawsy.pet" style="color: #f97316; font-size: 14px; font-weight: 500; text-decoration: none;">support@getpawsy.pet</a>
                    <p style="margin: 16px 0 0 0; color: #a1a1aa; font-size: 12px;">
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

    const customerEmailResponse = await resend.emails.send({
      from: "GetPawsy Support <noreply@getpawsy.pet>",
      to: [email],
      subject: `We received your message! 🐾`,
      html: customerConfirmationHtml,
      reply_to: adminEmail,
    });

    console.log("Customer confirmation email sent successfully:", customerEmailResponse);

    return new Response(JSON.stringify({ success: true, adminEmailResponse, customerEmailResponse }), {
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
