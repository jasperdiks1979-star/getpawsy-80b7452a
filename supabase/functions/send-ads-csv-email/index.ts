import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  email: string;
  csvFiles: {
    filename: string;
    content: string;
  }[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, csvFiles }: EmailRequest = await req.json();

    if (!email || !csvFiles || csvFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Email and CSV files are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    // Convert CSV content to base64 for attachments
    const attachments = csvFiles.map((file) => ({
      filename: file.filename,
      content: btoa(unescape(encodeURIComponent(file.content))),
    }));

    const timestamp = new Date().toISOString().split('T')[0];

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "GetPawsy <noreply@getpawsy.pet>",
        to: [email],
        subject: `Google Ads CSV Export - ${timestamp}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">Your Google Ads CSV Files</h1>
            <p>Hi there,</p>
            <p>Here are your Google Ads CSV files for import into Google Ads Editor:</p>
            <ul>
              ${csvFiles.map(f => `<li>${f.filename}</li>`).join('')}
            </ul>
            <h3>Import Instructions:</h3>
            <ol>
              <li>Download and install <a href="https://ads.google.com/intl/en_us/home/tools/ads-editor/">Google Ads Editor</a></li>
              <li>Open Google Ads Editor and sign in to your account</li>
              <li>Go to Account → Import → From file</li>
              <li>Import each CSV file in this order: Campaigns → Ads → Keywords → Sitelinks → Images</li>
              <li>Review the changes and click "Post" to publish to your account</li>
            </ol>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              Best regards,<br>
              The GetPawsy Team
            </p>
          </div>
        `,
        attachments: attachments,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend API error:", errorText);
      throw new Error(`Failed to send email: ${errorText}`);
    }

    const result = await emailResponse.json();
    console.log("Email sent successfully:", result);

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
