import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Email templates for different days
const emailTemplates = {
  day_14: {
    subject: "🎒 Je hond is klaar voor avontuur! 10% korting op Pet Carrier",
    productName: "Pet Carrier Backpack",
    discountCode: "SLOWFEEDER10",
    discountPercent: 10,
    getHtml: (customerName: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Je hond is klaar voor avontuur!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">🎒 Tijd voor Avontuur!</h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="font-size: 18px; color: #333; margin-bottom: 20px;">
        Hey ${customerName || 'daar'}! 👋
      </p>
      
      <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 20px;">
        Je Slow Feeder zorgt voor <strong>gezonde eetmomenten</strong> voor je huisdier... 
        Maar wist je dat gezonde huisdieren ook <strong>actieve huisdieren</strong> zijn?
      </p>
      
      <div style="background: #fff5f0; border-radius: 12px; padding: 25px; margin: 30px 0; border-left: 4px solid #FF6B35;">
        <h2 style="color: #FF6B35; margin: 0 0 15px 0; font-size: 20px;">
          Pet Carrier Backpack
        </h2>
        <ul style="color: #555; padding-left: 20px; margin: 0; line-height: 1.8;">
          <li>✓ Uitbreidbaar design - 2x meer ruimte</li>
          <li>✓ Ademend mesh voor ventilatie</li>
          <li>✓ TSA-approved voor vliegreizen</li>
          <li>✓ Geschikt tot 12 kg</li>
        </ul>
      </div>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin: 35px 0;">
        <a href="https://getpawsy.pet/bestseller/pet-carrier-backpack?utm_source=remarketing&utm_medium=email&utm_campaign=day14_upsell&discount=SLOWFEEDER10" 
           style="display: inline-block; background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 30px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(255,107,53,0.3);">
          Bekijk Pet Carrier →
        </a>
      </div>
      
      <!-- Discount Code -->
      <div style="background: #1a1a2e; border-radius: 12px; padding: 25px; text-align: center; margin: 30px 0;">
        <p style="color: #aaa; margin: 0 0 10px 0; font-size: 14px;">EXCLUSIEF VOOR JOU</p>
        <p style="color: #FF6B35; font-size: 32px; font-weight: bold; margin: 0 0 10px 0;">10% KORTING</p>
        <div style="background: white; display: inline-block; padding: 12px 25px; border-radius: 8px; margin-top: 10px;">
          <code style="font-size: 20px; color: #1a1a2e; font-weight: bold;">SLOWFEEDER10</code>
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #888; font-size: 12px; margin: 0;">
        Je ontvangt deze email omdat je onlangs een aankoop deed bij GetPawsy.<br>
        <a href="https://getpawsy.pet/unsubscribe" style="color: #FF6B35;">Uitschrijven</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
  },
  day_21: {
    subject: "🛡️ Bescherm je huisdier ook buitenshuis - 15% korting!",
    productName: "GPS Dog Fence",
    discountCode: "SAFEPET15",
    discountPercent: 15,
    getHtml: (customerName: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bescherm je huisdier!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #2D5A27 0%, #4A7C43 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">🛡️ Veiligheid Voorop!</h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="font-size: 18px; color: #333; margin-bottom: 20px;">
        Hey ${customerName || 'daar'}! 👋
      </p>
      
      <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 20px;">
        Je geeft je huisdier het <strong>beste voer</strong> met de Slow Feeder...
        Geef hem ook de <strong>beste bescherming</strong>!
      </p>
      
      <div style="background: #f0f7ef; border-radius: 12px; padding: 25px; margin: 30px 0; border-left: 4px solid #2D5A27;">
        <h2 style="color: #2D5A27; margin: 0 0 15px 0; font-size: 20px;">
          GPS Dog Fence System
        </h2>
        <ul style="color: #555; padding-left: 20px; margin: 0; line-height: 1.8;">
          <li>📍 Real-time GPS tracking</li>
          <li>🚧 Onzichtbare virtuele grenzen</li>
          <li>📱 Volledige app-bediening</li>
          <li>🔔 Instant escape alerts</li>
          <li>🌧️ Waterbestendig design</li>
        </ul>
      </div>
      
      <!-- Stats -->
      <div style="display: flex; justify-content: space-around; margin: 30px 0; text-align: center;">
        <div>
          <p style="font-size: 36px; color: #2D5A27; font-weight: bold; margin: 0;">500m</p>
          <p style="color: #888; font-size: 12px; margin: 5px 0 0 0;">Bereik</p>
        </div>
        <div>
          <p style="font-size: 36px; color: #2D5A27; font-weight: bold; margin: 0;">30</p>
          <p style="color: #888; font-size: 12px; margin: 5px 0 0 0;">Dagen batterij</p>
        </div>
        <div>
          <p style="font-size: 36px; color: #2D5A27; font-weight: bold; margin: 0;">IP67</p>
          <p style="color: #888; font-size: 12px; margin: 5px 0 0 0;">Waterproof</p>
        </div>
      </div>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin: 35px 0;">
        <a href="https://getpawsy.pet/bestseller/gps-dog-fence?utm_source=remarketing&utm_medium=email&utm_campaign=day21_upsell&discount=SAFEPET15" 
           style="display: inline-block; background: linear-gradient(135deg, #2D5A27 0%, #4A7C43 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 30px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(45,90,39,0.3);">
          Bekijk GPS Fence →
        </a>
      </div>
      
      <!-- Discount Code -->
      <div style="background: #1a1a2e; border-radius: 12px; padding: 25px; text-align: center; margin: 30px 0;">
        <p style="color: #aaa; margin: 0 0 10px 0; font-size: 14px;">SPECIALE AANBIEDING</p>
        <p style="color: #4A7C43; font-size: 32px; font-weight: bold; margin: 0 0 10px 0;">15% KORTING</p>
        <div style="background: white; display: inline-block; padding: 12px 25px; border-radius: 8px; margin-top: 10px;">
          <code style="font-size: 20px; color: #1a1a2e; font-weight: bold;">SAFEPET15</code>
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #888; font-size: 12px; margin: 0;">
        Je ontvangt deze email omdat je onlangs een aankoop deed bij GetPawsy.<br>
        <a href="https://getpawsy.pet/unsubscribe" style="color: #2D5A27;">Uitschrijven</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
  },
  day_30: {
    subject: "🎁 Laatste kans: Complete Pet Care Bundle - 20% korting!",
    productName: "Bundle Deal",
    discountCode: "BUNDLE20",
    discountPercent: 20,
    getHtml: (customerName: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Laatste Kans!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">🎁 Laatste Kans!</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Je exclusieve korting verloopt bijna</p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="font-size: 18px; color: #333; margin-bottom: 20px;">
        Hey ${customerName || 'daar'}! 👋
      </p>
      
      <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 20px;">
        Een maand geleden begon je met de <strong>Slow Feeder</strong> - en je huisdier geniet er nog steeds van! 
        Nu is het tijd voor de <strong>ultieme upgrade</strong>...
      </p>
      
      <!-- Bundle Deal -->
      <div style="background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border-radius: 16px; padding: 30px; margin: 30px 0; border: 2px solid #8B5CF6;">
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="background: #8B5CF6; color: white; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: bold;">BUNDLE DEAL</span>
        </div>
        
        <h2 style="color: #8B5CF6; margin: 0 0 20px 0; font-size: 22px; text-align: center;">
          Complete Pet Care Kit
        </h2>
        
        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
          <div style="flex: 1; background: white; padding: 15px; border-radius: 10px; text-align: center;">
            <p style="font-size: 24px; margin: 0;">🎒</p>
            <p style="font-size: 13px; color: #555; margin: 8px 0 0 0;">Pet Carrier</p>
          </div>
          <div style="flex: 1; background: white; padding: 15px; border-radius: 10px; text-align: center;">
            <p style="font-size: 24px; margin: 0;">📍</p>
            <p style="font-size: 13px; color: #555; margin: 8px 0 0 0;">GPS Fence</p>
          </div>
        </div>
        
        <div style="text-align: center;">
          <p style="color: #888; font-size: 14px; margin: 0; text-decoration: line-through;">Was: €184.98</p>
          <p style="color: #8B5CF6; font-size: 32px; font-weight: bold; margin: 5px 0;">€147.98</p>
          <p style="color: #22c55e; font-size: 14px; margin: 0;">Je bespaart €36.99!</p>
        </div>
      </div>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin: 35px 0;">
        <a href="https://getpawsy.pet/products?utm_source=remarketing&utm_medium=email&utm_campaign=day30_bundle&discount=BUNDLE20" 
           style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 30px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(139,92,246,0.3);">
          Claim Bundle Deal →
        </a>
      </div>
      
      <!-- Urgency -->
      <div style="background: #fef2f2; border-radius: 12px; padding: 20px; text-align: center; margin: 30px 0; border: 1px solid #fecaca;">
        <p style="color: #dc2626; font-size: 14px; font-weight: bold; margin: 0;">
          ⏰ Deze aanbieding verloopt over 48 uur!
        </p>
      </div>
      
      <!-- Discount Code -->
      <div style="background: #1a1a2e; border-radius: 12px; padding: 25px; text-align: center; margin: 30px 0;">
        <p style="color: #aaa; margin: 0 0 10px 0; font-size: 14px;">LAATSTE KANS</p>
        <p style="color: #A78BFA; font-size: 32px; font-weight: bold; margin: 0 0 10px 0;">20% KORTING</p>
        <div style="background: white; display: inline-block; padding: 12px 25px; border-radius: 8px; margin-top: 10px;">
          <code style="font-size: 20px; color: #1a1a2e; font-weight: bold;">BUNDLE20</code>
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee;">
      <p style="color: #888; font-size: 12px; margin: 0;">
        Je ontvangt deze email omdat je onlangs een aankoop deed bij GetPawsy.<br>
        <a href="https://getpawsy.pet/unsubscribe" style="color: #8B5CF6;">Uitschrijven</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
  },
};

interface OrderCandidate {
  id: string;
  customer_email: string;
  created_at: string;
  days_since_purchase: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find orders with Slow Feeder products from 14, 21, or 30 days ago
    const now = new Date();
    const targetDays = [14, 21, 30];
    
    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const days of targetDays) {
      // Calculate date range for this day (with 24 hour window)
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() - days);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      console.log(`Checking orders from ${days} days ago (${startOfDay.toISOString()} to ${endOfDay.toISOString()})`);

      // Get orders with Slow Feeder from this date
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id, customer_email, created_at, items")
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString())
        .eq("status", "paid")
        .not("customer_email", "is", null);

      if (ordersError) {
        console.error("Error fetching orders:", ordersError);
        results.errors.push(`Error fetching orders for day ${days}: ${ordersError.message}`);
        continue;
      }

      if (!orders || orders.length === 0) {
        console.log(`No orders found for day ${days}`);
        continue;
      }

      // Filter for orders containing Slow Feeder products
      const slowFeederOrders = orders.filter((order) => {
        const items = order.items as Array<{ name?: string }>;
        return items?.some((item) => 
          item.name?.toLowerCase().includes("slow") && 
          item.name?.toLowerCase().includes("feeder")
        );
      });

      console.log(`Found ${slowFeederOrders.length} Slow Feeder orders for day ${days}`);

      const emailType = `day_${days}` as keyof typeof emailTemplates;
      const template = emailTemplates[emailType];

      for (const order of slowFeederOrders) {
        results.processed++;

        // Check if we already sent this email
        const { data: existingEmail } = await supabase
          .from("remarketing_emails")
          .select("id")
          .eq("order_id", order.id)
          .eq("email_type", emailType)
          .single();

        if (existingEmail) {
          console.log(`Already sent ${emailType} email for order ${order.id}`);
          results.skipped++;
          continue;
        }

        // Check if customer unsubscribed
        const { data: subscriber } = await supabase
          .from("newsletter_subscribers")
          .select("is_active")
          .eq("email", order.customer_email)
          .single();

        if (subscriber && !subscriber.is_active) {
          console.log(`Customer ${order.customer_email} is unsubscribed`);
          results.skipped++;
          continue;
        }

        // Send the email via Resend
        try {
          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "GetPawsy <noreply@getpawsy.pet>",
              to: [order.customer_email],
              subject: template.subject,
              html: template.getHtml(order.customer_email.split("@")[0]),
            }),
          });

          if (!emailResponse.ok) {
            const errorText = await emailResponse.text();
            throw new Error(`Resend API error: ${errorText}`);
          }

          // Log the sent email
          const { error: insertError } = await supabase
            .from("remarketing_emails")
            .insert({
              order_id: order.id,
              customer_email: order.customer_email,
              email_type: emailType,
              product_upsold: template.productName,
            });

          if (insertError) {
            console.error("Error logging email:", insertError);
          }

          results.sent++;
          console.log(`Sent ${emailType} email to ${order.customer_email}`);

        } catch (emailError: unknown) {
          console.error("Error sending email:", emailError);
          const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
          results.errors.push(`Failed to send to ${order.customer_email}: ${errorMessage}`);
        }
      }
    }

    console.log("Remarketing email results:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: unknown) {
    console.error("Error in send-remarketing-email:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
