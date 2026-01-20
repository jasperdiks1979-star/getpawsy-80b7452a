import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  product_id?: string;
  cost_price?: number;
}

interface ProductProfit {
  product_id: string;
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  quantity: number;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting loss-making products notification check...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Get admin email addresses
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (rolesError) {
      console.error("Error fetching admin roles:", rolesError);
      throw rolesError;
    }

    if (!adminRoles || adminRoles.length === 0) {
      console.log("No admin users found, skipping notification");
      return new Response(
        JSON.stringify({ message: "No admin users to notify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin emails from profiles
    const adminUserIds = adminRoles.map(r => r.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("email")
      .in("id", adminUserIds);

    if (profilesError) {
      console.error("Error fetching admin profiles:", profilesError);
      throw profilesError;
    }

    const adminEmails = profiles?.filter(p => p.email).map(p => p.email) || [];
    
    if (adminEmails.length === 0) {
      console.log("No admin emails found, skipping notification");
      return new Response(
        JSON.stringify({ message: "No admin emails configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${adminEmails.length} admin email(s) to notify`);

    // Fetch products for cost price lookup
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, price, cost_price");

    if (productsError) {
      console.error("Error fetching products:", productsError);
      throw productsError;
    }

    const productCostMap: Record<string, { costPrice: number; name: string }> = {};
    products?.forEach(p => {
      productCostMap[p.id] = {
        costPrice: p.cost_price || 0,
        name: p.name
      };
    });

    // Fetch paid orders from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .in("status", ["paid", "processing", "shipped", "delivered"])
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (ordersError) {
      console.error("Error fetching orders:", ordersError);
      throw ordersError;
    }

    console.log(`Processing ${orders?.length || 0} orders from last 30 days`);

    // Calculate profit per product
    const productProfits: Record<string, ProductProfit> = {};

    orders?.forEach(order => {
      const items = order.items as unknown as OrderItem[];
      if (Array.isArray(items)) {
        items.forEach(item => {
          if (!item.product_id) return;
          
          const key = item.product_id;
          const qty = item.quantity || 1;
          const itemRevenue = (item.price || 0) * qty;
          
          let itemCost = 0;
          if (productCostMap[item.product_id]) {
            itemCost = productCostMap[item.product_id].costPrice * qty;
          } else if (item.cost_price) {
            itemCost = item.cost_price * qty;
          }

          if (!productProfits[key]) {
            productProfits[key] = {
              product_id: item.product_id,
              name: item.name || productCostMap[item.product_id]?.name || "Unknown",
              revenue: 0,
              cost: 0,
              profit: 0,
              margin: 0,
              quantity: 0
            };
          }

          productProfits[key].quantity += qty;
          productProfits[key].revenue += itemRevenue;
          productProfits[key].cost += itemCost;
          productProfits[key].profit += (itemRevenue - itemCost);
        });
      }
    });

    // Find loss-making products (negative profit)
    const lossProducts = Object.values(productProfits)
      .filter(p => p.profit < 0 && p.cost > 0) // Only if we have cost data
      .map(p => ({
        ...p,
        margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : -100
      }));

    console.log(`Found ${lossProducts.length} loss-making products`);

    if (lossProducts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No loss-making products found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check which products have already been notified recently (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentNotifications, error: notifError } = await supabase
      .from("loss_making_notifications")
      .select("product_id")
      .gte("notified_at", sevenDaysAgo.toISOString());

    if (notifError) {
      console.error("Error fetching recent notifications:", notifError);
      throw notifError;
    }

    const recentlyNotifiedIds = new Set(recentNotifications?.map(n => n.product_id) || []);

    // Filter to only new loss-making products
    const newLossProducts = lossProducts.filter(p => !recentlyNotifiedIds.has(p.product_id));

    console.log(`${newLossProducts.length} new loss-making products to notify about`);

    if (newLossProducts.length === 0) {
      return new Response(
        JSON.stringify({ message: "All loss-making products already notified recently" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format currency
    const formatCurrency = (cents: number) => {
      return new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
      }).format(cents / 100);
    };

    // Build email HTML
    const productRows = newLossProducts
      .sort((a, b) => a.profit - b.profit) // Most loss first
      .map(p => `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px 8px; font-weight: 500;">${p.name}</td>
          <td style="padding: 12px 8px; text-align: right;">${p.quantity}x</td>
          <td style="padding: 12px 8px; text-align: right;">${formatCurrency(p.revenue)}</td>
          <td style="padding: 12px 8px; text-align: right;">${formatCurrency(p.cost)}</td>
          <td style="padding: 12px 8px; text-align: right; color: #dc2626; font-weight: bold;">${formatCurrency(p.profit)}</td>
          <td style="padding: 12px 8px; text-align: right; color: #dc2626;">${p.margin.toFixed(1)}%</td>
        </tr>
      `).join("");

    const totalLoss = newLossProducts.reduce((sum, p) => sum + p.profit, 0);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">⚠️ Verliesgevende Producten Gedetecteerd</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Er zijn ${newLossProducts.length} product(en) gevonden die verlies opleveren</p>
        </div>
        
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 30px; border-radius: 0 0 12px 12px;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0; color: #991b1b; font-weight: 600;">
              💸 Totaal Verlies: <span style="font-size: 1.2em;">${formatCurrency(totalLoss)}</span>
            </p>
            <p style="margin: 8px 0 0 0; color: #7f1d1d; font-size: 14px;">
              Deze producten kosten meer dan ze opbrengen. Overweeg prijsverhoging of stop met verkopen.
            </p>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Product</th>
                <th style="padding: 12px 8px; text-align: right; font-weight: 600;">Verkocht</th>
                <th style="padding: 12px 8px; text-align: right; font-weight: 600;">Omzet</th>
                <th style="padding: 12px 8px; text-align: right; font-weight: 600;">Kosten</th>
                <th style="padding: 12px 8px; text-align: right; font-weight: 600;">Verlies</th>
                <th style="padding: 12px 8px; text-align: right; font-weight: 600;">Marge</th>
              </tr>
            </thead>
            <tbody>
              ${productRows}
            </tbody>
          </table>

          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
            <h3 style="margin: 0 0 12px 0; font-size: 16px;">📋 Aanbevolen Acties:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
              <li>Verhoog de verkoopprijs van deze producten</li>
              <li>Zoek naar goedkopere leveranciers</li>
              <li>Overweeg producten uit het assortiment te halen</li>
              <li>Controleer of de kostprijzen correct zijn ingesteld</li>
            </ul>
          </div>

          <div style="margin-top: 24px; text-align: center;">
            <a href="https://getpawsy.lovable.app/admin" 
               style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Bekijk Admin Dashboard
            </a>
          </div>
        </div>

        <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">
          Deze email is automatisch verstuurd door GetPawsy<br>
          Je ontvangt deze notificatie omdat je admin bent
        </p>
      </body>
      </html>
    `;

    // Send email to all admins
    console.log(`Sending notification email to: ${adminEmails.join(", ")}`);

    const emailResponse = await resend.emails.send({
      from: "GetPawsy Alerts <alerts@getpawsy.pet>",
      to: adminEmails,
      subject: `⚠️ ${newLossProducts.length} Verliesgevende Product${newLossProducts.length > 1 ? "en" : ""} Gedetecteerd`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    // Record notifications to prevent duplicate emails
    const notificationRecords = newLossProducts.map(p => ({
      product_id: p.product_id,
      product_name: p.name,
      margin_percentage: p.margin,
      total_loss: p.profit,
      notified_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase
      .from("loss_making_notifications")
      .insert(notificationRecords);

    if (insertError) {
      console.error("Error recording notifications:", insertError);
      // Don't throw - email was already sent
    } else {
      console.log(`Recorded ${notificationRecords.length} notification(s)`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Notification sent for ${newLossProducts.length} loss-making product(s)`,
        products: newLossProducts.map(p => p.name),
        emailsSentTo: adminEmails
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in notify-loss-products function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});