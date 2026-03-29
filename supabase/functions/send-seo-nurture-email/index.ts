import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * SEO Nurture Email Flow
 * 
 * A 3-email automated nurture flow for users who sign up via blog or collection opt-ins.
 * Tone: Helpful, calm, non-salesy, trust-first
 * 
 * Email #1: Welcome & Value (immediately)
 * Email #2: Education & Trust (3 days)
 * Email #3: Soft Conversion (6 days)
 */

interface NurtureEmailRequest {
  email: string;
  emailType: "welcome" | "education" | "conversion";
  subscriberName?: string;
}

// Email template generation functions
const getWelcomeEmail = (preferenceToken: string): { subject: string; html: string } => {
  return {
    subject: "Welcome to GetPawsy 🐾",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to GetPawsy</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa; line-height: 1.6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #1a1a2e; padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                Welcome to GetPawsy
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="margin: 0 0 20px 0; color: #333; font-size: 16px;">
                Hi there! 👋
              </p>
              
              <p style="margin: 0 0 20px 0; color: #555; font-size: 15px;">
                Thanks for signing up — we're glad to have you here.
              </p>
              
              <p style="margin: 0 0 20px 0; color: #555; font-size: 15px;">
                At GetPawsy, we focus on one thing: <strong>practical pet products that make everyday life easier</strong> for you and your furry friend.
              </p>
              
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <p style="margin: 0 0 12px 0; color: #333; font-size: 15px; font-weight: 600;">
                  What to expect from us:
                </p>
                <ul style="margin: 0; padding-left: 20px; color: #555; font-size: 14px;">
                  <li style="margin-bottom: 8px;">Helpful pet care tips and guides</li>
                  <li style="margin-bottom: 8px;">New product updates (only the good stuff)</li>
                  <li style="margin-bottom: 8px;">Occasional special offers</li>
                  <li>No spam — ever</li>
                </ul>
              </div>
              
              <p style="margin: 0 0 24px 0; color: #555; font-size: 15px;">
                If you're looking for quality essentials for your pet, feel free to explore our collections:
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://getpawsy.pet/collections/dog-travel-accessories" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 500;">
                      Explore Collections
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 32px 0 0 0; color: #555; font-size: 15px;">
                Talk soon,<br>
                The GetPawsy Team
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 24px 32px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0 0 8px 0; color: #888; font-size: 12px;">
                GetPawsy — Trusted Pet Products with US Shipping
              </p>
              <p style="margin: 0; color: #aaa; font-size: 11px;">
                ${preferenceToken ? `<a href="https://getpawsy.pet/newsletter-preferences?token=${preferenceToken}" style="color: #888; text-decoration: underline;">Manage Preferences</a> | ` : ''}
                <a href="https://getpawsy.pet/unsubscribe" style="color: #888; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };
};

const getEducationEmail = (preferenceToken: string): { subject: string; html: string } => {
  return {
    subject: "Simple ways to make everyday pet care easier",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pet Care Tips</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa; line-height: 1.6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #1a1a2e; padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">
                Small changes, big difference 🐕
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="margin: 0 0 20px 0; color: #333; font-size: 16px;">
                Hi again,
              </p>
              
              <p style="margin: 0 0 24px 0; color: #555; font-size: 15px;">
                Taking care of a pet doesn't have to be complicated. Here are a few simple tips that can make a real difference:
              </p>
              
              <!-- Tip 1 -->
              <div style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #eee;">
                <h3 style="margin: 0 0 8px 0; color: #333; font-size: 16px;">
                  1. Slow down mealtime
                </h3>
                <p style="margin: 0; color: #555; font-size: 14px;">
                  Dogs that eat too fast can experience bloating and digestive issues. A slow feeder bowl encourages natural pacing and turns mealtime into a gentle mental exercise.
                </p>
              </div>
              
              <!-- Tip 2 -->
              <div style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #eee;">
                <h3 style="margin: 0 0 8px 0; color: #333; font-size: 16px;">
                  2. Create a safe travel routine
                </h3>
                <p style="margin: 0; color: #555; font-size: 14px;">
                  If your dog rides in the car often, a simple seat cover or travel carrier can reduce anxiety and keep everyone safe — especially during sudden stops.
                </p>
              </div>
              
              <!-- Tip 3 -->
              <div style="margin-bottom: 24px;">
                <h3 style="margin: 0 0 8px 0; color: #333; font-size: 16px;">
                  3. Indoor cats need stimulation too
                </h3>
                <p style="margin: 0; color: #555; font-size: 14px;">
                  Boredom can lead to stress and behavioral issues. Even 15 minutes of interactive play each day can make a noticeable difference for indoor cats.
                </p>
              </div>
              
              <!-- Common mistakes box -->
              <div style="background-color: #fff5f5; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #f97316;">
                <p style="margin: 0 0 8px 0; color: #333; font-size: 14px; font-weight: 600;">
                  Common mistake to avoid:
                </p>
                <p style="margin: 0; color: #555; font-size: 14px;">
                  Buying the cheapest option. Low-quality pet products often wear out quickly or don't work as expected — costing more in the long run and sometimes creating safety issues.
                </p>
              </div>
              
              <!-- Trust section -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <p style="margin: 0; color: #555; font-size: 14px;">
                  <strong>Why GetPawsy?</strong><br>
                  We carefully select products that balance quality and value — with US shipping and easy 30-day returns.
                </p>
              </div>
              
              <p style="margin: 24px 0 0 0; color: #555; font-size: 15px;">
                Hope this helps!<br>
                The GetPawsy Team
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 24px 32px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0 0 8px 0; color: #888; font-size: 12px;">
                GetPawsy — Trusted Pet Products with US Shipping
              </p>
              <p style="margin: 0; color: #aaa; font-size: 11px;">
                ${preferenceToken ? `<a href="https://getpawsy.pet/newsletter-preferences?token=${preferenceToken}" style="color: #888; text-decoration: underline;">Manage Preferences</a> | ` : ''}
                <a href="https://getpawsy.pet/unsubscribe" style="color: #888; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };
};

const getConversionEmail = (preferenceToken: string): { subject: string; html: string } => {
  return {
    subject: "Pet essentials designed for everyday life",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pet Essentials</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa; line-height: 1.6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #1a1a2e; padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">
                Made for everyday comfort 🐾
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="margin: 0 0 20px 0; color: #333; font-size: 16px;">
                Hi there,
              </p>
              
              <p style="margin: 0 0 20px 0; color: #555; font-size: 15px;">
                At GetPawsy, we believe pet care should feel simple — not overwhelming.
              </p>
              
              <p style="margin: 0 0 24px 0; color: #555; font-size: 15px;">
                That's why we focus on practical essentials that work quietly in the background of your daily routine: products designed for <strong>comfort, convenience, and reliability</strong>.
              </p>
              
              <!-- Value props -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin: 24px 0;">
                <p style="margin: 0 0 16px 0; color: #333; font-size: 15px; font-weight: 600;">
                  What we stand for:
                </p>
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding: 8px 0; vertical-align: top; width: 28px;">
                      <span style="color: #f97316;">✓</span>
                    </td>
                    <td style="padding: 8px 0; color: #555; font-size: 14px;">
                      <strong>Quality you can trust</strong> — We test and vet every product we sell
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; vertical-align: top; width: 28px;">
                      <span style="color: #f97316;">✓</span>
                    </td>
                    <td style="padding: 8px 0; color: #555; font-size: 14px;">
                      <strong>US shipping</strong> — Free on orders over $35
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; vertical-align: top; width: 28px;">
                      <span style="color: #f97316;">✓</span>
                    </td>
                    <td style="padding: 8px 0; color: #555; font-size: 14px;">
                      <strong>30-day easy returns</strong> — Contact us if something isn't right
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; vertical-align: top; width: 28px;">
                      <span style="color: #f97316;">✓</span>
                    </td>
                    <td style="padding: 8px 0; color: #555; font-size: 14px;">
                      <strong>Real support</strong> — We're here if you have questions
                    </td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 24px 0; color: #555; font-size: 15px;">
                Whether you're looking for feeding solutions, travel gear, or enrichment toys — we've got you covered.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://getpawsy.pet/products" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 500;">
                      Browse Products
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 32px 0 0 0; color: #555; font-size: 15px;">
                Thanks for being part of the GetPawsy community.<br><br>
                Take care,<br>
                The GetPawsy Team
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 24px 32px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0 0 8px 0; color: #888; font-size: 12px;">
                GetPawsy — Trusted Pet Products with US Shipping
              </p>
              <p style="margin: 0; color: #aaa; font-size: 11px;">
                ${preferenceToken ? `<a href="https://getpawsy.pet/newsletter-preferences?token=${preferenceToken}" style="color: #888; text-decoration: underline;">Manage Preferences</a> | ` : ''}
                <a href="https://getpawsy.pet/unsubscribe" style="color: #888; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };
};

const handler = async (req: Request): Promise<Response> => {
  console.log("Send SEO nurture email function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, emailType }: NurtureEmailRequest = await req.json();

    if (!email || !emailType) {
      return new Response(
        JSON.stringify({ error: "Email and emailType are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const validTypes = ["welcome", "education", "conversion"];
    if (!validTypes.includes(emailType)) {
      return new Response(
        JSON.stringify({ error: "Invalid emailType. Must be: welcome, education, or conversion" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get subscriber preference token
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: subscriber } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('preference_token, is_active')
      .eq('email', email.toLowerCase())
      .single();

    // Don't send to unsubscribed users
    if (subscriber && !subscriber.is_active) {
      console.log(`Skipping ${emailType} email for unsubscribed user: ${email}`);
      return new Response(
        JSON.stringify({ success: false, reason: "subscriber_inactive" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const preferenceToken = subscriber?.preference_token || '';

    // Get the appropriate email template
    let emailContent: { subject: string; html: string };
    
    switch (emailType) {
      case "welcome":
        emailContent = getWelcomeEmail(preferenceToken);
        break;
      case "education":
        emailContent = getEducationEmail(preferenceToken);
        break;
      case "conversion":
        emailContent = getConversionEmail(preferenceToken);
        break;
      default:
        emailContent = getWelcomeEmail(preferenceToken);
    }

    console.log(`Sending ${emailType} nurture email to: ${email}`);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "GetPawsy <newsletter@getpawsy.pet>",
        to: [email],
        subject: emailContent.subject,
        html: emailContent.html,
        reply_to: "support@getpawsy.pet",
        headers: {
          "List-Unsubscribe": `<https://getpawsy.pet/unsubscribe?email=${encodeURIComponent(email)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });

    const responseText = await emailResponse.text();

    if (!emailResponse.ok) {
      console.error("Resend API error:", responseText);
      throw new Error(`Failed to send email: ${responseText}`);
    }

    console.log(`${emailType} nurture email sent successfully to ${email}`);

    return new Response(
      JSON.stringify({ success: true, emailType, email }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    console.error("Error in send-seo-nurture-email function:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
