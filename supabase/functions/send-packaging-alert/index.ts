import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    // Verify admin authorization
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      
      const { data: { user }, error: userError } = await authClient.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check admin role
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      if (!roleData) {
        return new Response(
          JSON.stringify({ error: "Admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all packaging inventory items
    const { data: inventory, error: inventoryError } = await supabase
      .from("packaging_inventory")
      .select("*")
      .order("item_type");

    if (inventoryError) {
      console.error("Error fetching inventory:", inventoryError);
      throw inventoryError;
    }

    // Find items that are at or below reorder threshold
    const lowStockItems = inventory?.filter(
      (item) => item.quantity <= item.reorder_threshold
    ) || [];

    if (lowStockItems.length === 0) {
      console.log("No low stock items found");
      return new Response(
        JSON.stringify({ message: "No low stock items", sent: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if we've already sent an alert today for the same items
    const today = new Date().toISOString().split('T')[0];
    const { data: recentLogs } = await supabase
      .from("packaging_inventory_logs")
      .select("item_type")
      .eq("change_type", "low_stock_alert")
      .gte("created_at", `${today}T00:00:00Z`);

    const alreadyNotified = new Set(recentLogs?.map(log => log.item_type) || []);
    const newLowStockItems = lowStockItems.filter(
      item => !alreadyNotified.has(item.item_type)
    );

    if (newLowStockItems.length === 0) {
      console.log("All low stock items already notified today");
      return new Response(
        JSON.stringify({ message: "Already notified today", sent: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build email content
    const criticalItems = newLowStockItems.filter(item => item.quantity <= item.reorder_threshold / 2);
    const lowItems = newLowStockItems.filter(item => item.quantity > item.reorder_threshold / 2);

    const formatItem = (item: typeof newLowStockItems[0]) => {
      const status = item.quantity <= 0 ? "🔴 UITVERKOCHT" : 
                     item.quantity <= item.reorder_threshold / 2 ? "🟠 KRITIEK" : "🟡 BIJNA OP";
      return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.item_name}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.reorder_threshold}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${status}</td>
        </tr>
      `;
    };

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">📦 Packaging Voorraad Alert</h1>
            </div>
            
            <!-- Content -->
            <div style="padding: 32px;">
              <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">
                De volgende packaging items zijn onder het herbestel-niveau:
              </p>
              
              <!-- Table -->
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Item</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Voorraad</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Minimum</th>
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${newLowStockItems.map(formatItem).join('')}
                </tbody>
              </table>
              
              <!-- Summary -->
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; color: #991b1b; font-weight: 600;">
                  ${criticalItems.length > 0 ? `⚠️ ${criticalItems.length} item(s) kritiek laag!` : ''}
                  ${lowItems.length > 0 ? `📉 ${lowItems.length} item(s) bijna op.` : ''}
                </p>
              </div>
              
              <!-- CTA Button -->
              <a href="https://getpawsy.lovable.app/admin" style="display: block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; font-size: 16px; text-align: center;">
                Bekijk Voorraad in Admin →
              </a>
            </div>
            
            <!-- Footer -->
            <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                Dit is een automatische notificatie van GetPawsy Packaging Management.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "GetPawsy Alerts <alerts@getpawsy.pet>",
        to: ["support@getpawsy.pet"],
        subject: `⚠️ Packaging Voorraad Alert: ${newLowStockItems.length} item(s) bijbestellen`,
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Failed to send email:", errorText);
      throw new Error(`Email send failed: ${errorText}`);
    }

    // Log the alerts to prevent duplicate notifications
    for (const item of newLowStockItems) {
      await supabase.from("packaging_inventory_logs").insert({
        inventory_id: item.id,
        item_type: item.item_type,
        change_amount: 0,
        change_type: "low_stock_alert",
        notes: `Alert sent: ${item.quantity} remaining (threshold: ${item.reorder_threshold})`,
      });
    }

    console.log(`Sent packaging alert for ${newLowStockItems.length} items`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: true,
        itemsAlerted: newLowStockItems.length,
        items: newLowStockItems.map(i => i.item_name)
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in send-packaging-alert:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
