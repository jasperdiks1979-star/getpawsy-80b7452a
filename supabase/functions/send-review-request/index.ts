import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Store-owner addresses used for live payment smoke tests. Mirrors
 * INTERNAL_ORDER_EMAILS in src/components/admin/CommercialKpiCard.tsx.
 */
const INTERNAL_ORDER_EMAILS = [
  "jasperdiks@hotmail.com",
  "jasperdiks1979@gmail.com",
];
/** Live smoke tests are charged at token amounts; treat them as internal too. */
const SMOKE_TEST_MAX_AMOUNT = 2;

function isInternalOrder(row: { customer_email: string | null; total_amount?: number | string | null }): boolean {
  const email = (row.customer_email || "").trim().toLowerCase();
  if (INTERNAL_ORDER_EMAILS.includes(email)) return true;
  const amount = Number(row.total_amount || 0);
  return amount > 0 && amount <= SMOKE_TEST_MAX_AMOUNT;
}


/**
 * Cron-triggered: finds delivered orders from ~7 days ago without a review request,
 * creates the request row, and sends a friendly review email.
 * Trust-first: no urgency, no fake incentives.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SAFETY GATE (Phase 4 D): review-request emails go to real customers.
    // Sending stays off until the store owner explicitly enables it by setting
    // REVIEW_REQUEST_EMAILS_ENABLED=true. Until then the function reports what
    // it would do and sends nothing. Never remove this gate silently.
    if (Deno.env.get("REVIEW_REQUEST_EMAILS_ENABLED") !== "true") {
      console.log("[REVIEW-REQUEST] disabled: REVIEW_REQUEST_EMAILS_ENABLED is not 'true'. No email sent.");
      return new Response(
        JSON.stringify({ sent: 0, disabled: true, reason: "REVIEW_REQUEST_EMAILS_ENABLED is not set to 'true'" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find delivered orders from 5-10 days ago without a review request
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const { data: orders, error: fetchError } = await supabase
      .from("orders")
      .select("id, customer_email, items, shipping_address, created_at, total_amount")
      // Delivered only. A shipped order has not demonstrably arrived, and the
      // email says "since your order arrived" — that must be true when sent.
      .eq("status", "delivered")
      .not("customer_email", "is", null)
      .lt("created_at", fiveDaysAgo)
      .gt("created_at", tenDaysAgo)
      .limit(20);

    if (fetchError) throw fetchError;

    console.log(`[REVIEW-REQUEST] Found ${orders?.length || 0} candidate orders`);

    const results: { email: string; success: boolean }[] = [];

    for (const order of orders || []) {
      // Owner / smoke-test orders are real Stripe charges but not customers.
      // Same rule as the commercial KPI card — they must never be mailed.
      if (isInternalOrder(order)) {
        console.log(`[REVIEW-REQUEST] skipped internal/owner order ${order.id}`);
        continue;
      }

      // Check if already requested
      const { data: existing } = await supabase
        .from("review_requests")
        .select("id")
        .eq("order_id", order.id)
        .maybeSingle();

      if (existing) continue;

      // Suppression: never mail an address that unsubscribed.
      const { data: suppressed } = await supabase
        .from("newsletter_subscribers")
        .select("email, is_active")
        .eq("email", order.customer_email)
        .eq("is_active", false)
        .maybeSingle();

      if (suppressed) {
        console.log(`[REVIEW-REQUEST] suppressed (unsubscribed): ${order.customer_email}`);
        continue;
      }

      const items = Array.isArray(order.items) ? order.items : [];
      if (items.length === 0) continue;

      const customerName = (order.shipping_address as any)?.name || order.customer_email.split("@")[0];
      const productIds = items.map((i: any) => i.id).filter(Boolean);
      const topItem = items[0] as any;

      // Create review request record
      await supabase.from("review_requests").insert({
        order_id: order.id,
        customer_email: order.customer_email,
        customer_name: customerName,
        product_ids: productIds,
        status: "sent",
        sent_at: new Date().toISOString(),
      });

      // Build email
      const itemsHtml = items.slice(0, 3).map((item: any) => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f0f0f0;">
          ${item.image_url || item.image ? `<img src="${item.image_url || item.image}" alt="${item.name}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;" />` : ""}
          <div>
            <p style="margin:0;font-weight:600;color:#1f2937;">${item.name}</p>
            <p style="margin:4px 0 0;color:#6b7280;font-size:14px;">Qty: ${item.quantity || 1}</p>
          </div>
        </div>
      `).join("");

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
      <h2 style="color:#1f2937;margin:0 0 16px;">Hi ${customerName}! How's it going? 🐕</h2>
      <p style="color:#4b5563;line-height:1.7;margin:0 0 24px;">
        It's been about a week since your order arrived. We'd love to hear how your pet is enjoying their new goodies!
      </p>
      <p style="color:#4b5563;line-height:1.7;margin:0 0 20px;">
        Your honest feedback helps other pet parents make great choices for their furry friends.
      </p>
      
      ${itemsHtml}

      <div style="text-align:center;margin:28px 0 16px;">
        <a href="https://getpawsy.pet/products/${topItem?.slug || ""}?order=${order.id}#reviews" 
           style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:white;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;">
          Share Your Experience ✨
        </a>
      </div>

      <p style="color:#9ca3af;font-size:13px;text-align:center;margin:24px 0 0;">
        No obligation — we just appreciate hearing from happy pet parents!
      </p>

      <div style="border-top:1px solid #e5e7eb;margin-top:28px;padding-top:20px;text-align:center;">
        <p style="color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} GetPawsy. All rights reserved.</p>
        <a href="https://getpawsy.pet" style="color:#10b981;text-decoration:none;font-size:13px;">Visit our shop</a>
        <p style="color:#9ca3af;font-size:12px;margin:12px 0 0;">
          Don't want emails like this?
          <a href="https://getpawsy.pet/unsubscribe?email=${encodeURIComponent(order.customer_email)}" style="color:#9ca3af;">Unsubscribe</a>.
        </p>
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
          to: [order.customer_email],
          subject: `How's your pet enjoying their new ${topItem?.name || "goodies"}? 🐾`,
          html: emailHtml,
        }),
      });

      const sent = emailRes.ok;
      if (!sent) console.error(`[REVIEW-REQUEST] Failed for ${order.customer_email}:`, await emailRes.text());
      else console.log(`[REVIEW-REQUEST] Sent to ${order.customer_email}`);

      results.push({ email: order.customer_email, success: sent });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[REVIEW-REQUEST] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
