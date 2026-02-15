import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Replenishment categories with estimated days until reorder.
 * Conservative estimates — no fake urgency.
 */
const REPLENISHABLE_CATEGORIES: Record<string, number> = {
  "cat-litter-boxes": 30,     // litter refills ~monthly
  "cat-food-treats": 28,
  "dog-food-treats": 28,
  "grooming": 45,
  "dental-care": 60,
};

const isReplenishable = (item: any): { match: boolean; days: number } => {
  const name = (item.name || "").toLowerCase();
  const category = (item.category || "").toLowerCase();

  for (const [cat, days] of Object.entries(REPLENISHABLE_CATEGORIES)) {
    if (category.includes(cat) || name.includes("litter") || name.includes("treat") || 
        name.includes("food") || name.includes("shampoo") || name.includes("dental")) {
      return { match: true, days };
    }
  }
  return { match: false, days: 0 };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Scan recent delivered orders for replenishable items and create reminders
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const { data: orders } = await supabase
      .from("orders")
      .select("id, customer_email, items, created_at, shipping_address")
      .in("status", ["delivered", "shipped"])
      .not("customer_email", "is", null)
      .lt("created_at", thirtyDaysAgo)
      .gt("created_at", sixtyDaysAgo)
      .limit(50);

    let created = 0;
    for (const order of orders || []) {
      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items as any[]) {
        const { match, days } = isReplenishable(item);
        if (!match) continue;

        const orderDate = new Date(order.created_at);
        const reorderDate = new Date(orderDate.getTime() + days * 24 * 60 * 60 * 1000);

        // Only create if not already exists
        const { data: existing } = await supabase
          .from("replenishment_reminders")
          .select("id")
          .eq("order_id", order.id)
          .eq("product_id", item.id)
          .maybeSingle();

        if (!existing) {
          await supabase.from("replenishment_reminders").insert({
            order_id: order.id,
            customer_email: order.customer_email,
            product_id: item.id,
            product_name: item.name,
            product_slug: item.slug || null,
            product_image: item.image_url || item.image || null,
            estimated_reorder_date: reorderDate.toISOString().split("T")[0],
          });
          created++;
        }
      }
    }

    // 2. Send reminders for items due today or in the past (pending only)
    const today = new Date().toISOString().split("T")[0];
    const { data: dueReminders } = await supabase
      .from("replenishment_reminders")
      .select("*")
      .eq("status", "pending")
      .lte("estimated_reorder_date", today)
      .limit(20);

    const results: { email: string; success: boolean }[] = [];

    for (const reminder of dueReminders || []) {
      const productUrl = reminder.product_slug 
        ? `https://getpawsy.pet/product/${reminder.product_slug}` 
        : "https://getpawsy.pet/products";

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#10b981,#059669);padding:28px;text-align:center;border-radius:12px 12px 0 0;">
      <h1 style="color:white;margin:0;font-size:24px;">🐾 GetPawsy</h1>
    </div>
    <div style="background:white;padding:32px;border-radius:0 0 12px 12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
      <h2 style="color:#1f2937;margin:0 0 16px;">Time for a restock? 📦</h2>
      <p style="color:#4b5563;line-height:1.7;margin:0 0 20px;">
        It's been about a month since you ordered <strong>${reminder.product_name}</strong>. If your pet is loving it, now might be a good time to restock!
      </p>

      <div style="display:flex;align-items:center;gap:16px;padding:16px;background:#f9fafb;border-radius:8px;margin:0 0 24px;">
        ${reminder.product_image ? `<img src="${reminder.product_image}" alt="${reminder.product_name}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;" />` : ""}
        <div>
          <p style="margin:0;font-weight:600;color:#1f2937;">${reminder.product_name}</p>
          <p style="margin:4px 0 0;color:#10b981;font-size:14px;">Ready to reorder</p>
        </div>
      </div>

      <div style="text-align:center;margin:24px 0;">
        <a href="${productUrl}" 
           style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:white;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;">
          Reorder Now →
        </a>
      </div>

      <p style="color:#9ca3af;font-size:13px;text-align:center;">
        Free shipping on orders over $35 🚚
      </p>

      <div style="border-top:1px solid #e5e7eb;margin-top:28px;padding-top:20px;text-align:center;">
        <p style="color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} GetPawsy</p>
      </div>
    </div>
  </div>
</body>
</html>`;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "GetPawsy <noreply@getpawsy.pet>",
          to: [reminder.customer_email],
          subject: `Time to restock ${reminder.product_name}? 📦`,
          html: emailHtml,
        }),
      });

      const ok = emailRes.ok;
      if (!ok) console.error(`[REPLENISH] Failed:`, await emailRes.text());

      await supabase
        .from("replenishment_reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", reminder.id);

      results.push({ email: reminder.customer_email, success: ok });
    }

    return new Response(JSON.stringify({ created, sent: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[REPLENISH] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
