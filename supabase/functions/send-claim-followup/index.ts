import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  damaged: "Damaged Product",
  not_received: "Not Received",
  wrong_item: "Wrong Item",
  quality_issue: "Quality Issue",
  other: "Other",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find disputes that:
    // 1. Are pending or under_review
    // 2. Have no updates in the last 48 hours
    // 3. Haven't received a follow-up email yet OR last follow-up was more than 48 hours ago
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: staleDisputes, error: fetchError } = await supabase
      .from("disputes")
      .select("*")
      .in("status", ["pending", "under_review"])
      .lt("updated_at", fortyEightHoursAgo)
      .or(`last_followup_sent_at.is.null,last_followup_sent_at.lt.${fortyEightHoursAgo}`);

    if (fetchError) {
      console.error("Error fetching stale disputes:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${staleDisputes?.length || 0} stale disputes needing follow-up`);

    const results: { disputeId: string; email: string; success: boolean; error?: string }[] = [];

    for (const dispute of staleDisputes || []) {
      try {
        // Send follow-up email
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "GetPawsy Support <support@getpawsy.pet>",
            to: [dispute.customer_email],
            subject: `Update on Your Claim #${dispute.id.slice(0, 8).toUpperCase()}`,
            html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claim Follow-Up</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">🐾 GetPawsy</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Claim Update</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 22px; font-weight: 600;">
                We're Still Working on Your Claim
              </h2>
              
              <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Dear Customer,
              </p>
              
              <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                We wanted to let you know that we haven't forgotten about your claim. Our team is still reviewing your case and we appreciate your patience.
              </p>
              
              <!-- Claim Details Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fff7ed; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <span style="color: #9a3412; font-size: 12px; font-weight: 600; text-transform: uppercase;">Claim Reference</span>
                          <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 16px; font-weight: 600;">#${dispute.id.slice(0, 8).toUpperCase()}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <span style="color: #9a3412; font-size: 12px; font-weight: 600; text-transform: uppercase;">Issue Type</span>
                          <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 16px;">${DISPUTE_TYPE_LABELS[dispute.dispute_type] || dispute.dispute_type}</p>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <span style="color: #9a3412; font-size: 12px; font-weight: 600; text-transform: uppercase;">Current Status</span>
                          <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 16px;">${dispute.status === "pending" ? "Pending Review" : "Under Review"}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                If you have any additional information or photos that might help us resolve your claim faster, please reply to this email or log in to view your claim status.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 8px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                    <a href="https://getpawsy.pet/my-claims" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                      View My Claim
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 32px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Our support team typically responds within 24-48 business hours. We'll notify you as soon as there's an update on your claim.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                Need help? Contact us at <a href="mailto:support@getpawsy.pet" style="color: #f97316; text-decoration: none;">support@getpawsy.pet</a>
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
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
            `,
          }),
        });

        if (!emailResponse.ok) {
          const errorData = await emailResponse.text();
          throw new Error(`Failed to send email: ${errorData}`);
        }

        // Update the dispute to mark follow-up as sent
        const { error: updateError } = await supabase
          .from("disputes")
          .update({ last_followup_sent_at: new Date().toISOString() })
          .eq("id", dispute.id);

        if (updateError) {
          console.error(`Error updating dispute ${dispute.id}:`, updateError);
        }

        // Add a system message to the dispute
        await supabase.from("dispute_messages").insert({
          dispute_id: dispute.id,
          sender_type: "system",
          message: "Automated follow-up email sent to customer (48 hours with no update).",
          is_internal: true,
        });

        results.push({
          disputeId: dispute.id,
          email: dispute.customer_email,
          success: true,
        });

        console.log(`Follow-up email sent for dispute ${dispute.id} to ${dispute.customer_email}`);
      } catch (emailError) {
        console.error(`Error sending follow-up for dispute ${dispute.id}:`, emailError);
        results.push({
          disputeId: dispute.id,
          email: dispute.customer_email,
          success: false,
          error: emailError instanceof Error ? emailError.message : "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in send-claim-followup:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
