import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  image_url?: string;
  variant?: string;
}

interface ShippingAddress {
  name?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
}

interface OrderConfirmationRequest {
  orderId: string;
  customerEmail: string;
  customerName?: string;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  shippingAddress?: ShippingAddress;
  orderAccessToken?: string; // Secure token for guest order tracking
}

// Countries that should receive Dutch emails
const DUTCH_COUNTRIES = [
  'NL', 'Netherlands', 'Nederland', 'The Netherlands',
  'BE', 'Belgium', 'België', 'Belgique'
];

const isDutchCountry = (country?: string): boolean => {
  if (!country) return false;
  return DUTCH_COUNTRIES.some(c => 
    country.toLowerCase().includes(c.toLowerCase()) || 
    c.toLowerCase().includes(country.toLowerCase())
  );
};

const formatCurrency = (amount: number, currency: string, isDutch: boolean): string => {
  return new Intl.NumberFormat(isDutch ? 'nl-NL' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
};

// Translation strings
const translations = {
  nl: {
    thankYou: "Bedankt voor je bestelling!",
    greeting: (name: string) => `Hoi ${name}! 👋`,
    intro: "Super dat je bij ons hebt besteld! We hebben je bestelling ontvangen en gaan er meteen mee aan de slag.",
    orderNumber: "Ordernummer:",
    yourOrder: "Jouw bestelling",
    product: "Product",
    quantity: "Aantal",
    price: "Prijs",
    total: "Totaal:",
    shippingAddress: "📦 Bezorgadres",
    shippingInfo: "🚚 <strong>Verzending:</strong> Je ontvangt een aparte e-mail met track & trace zodra je pakket onderweg is.",
    support: "Heb je vragen over je bestelling? Neem gerust contact met ons op via onze website of reply op deze e-mail.",
    rights: "Alle rechten voorbehouden.",
    visitShop: "Bezoek onze webshop",
    emailTitle: "Orderbevestiging - GetPawsy",
    subject: (orderId: string) => `🐾 Orderbevestiging #${orderId} - GetPawsy`,
    trackOrder: "Volg je bestelling",
    trackOrderDescription: "Klik op de knop hieronder om de status van je bestelling te bekijken:",
  },
  en: {
    thankYou: "Thank you for your order!",
    greeting: (name: string) => `Hi ${name}! 👋`,
    intro: "Thanks for shopping with us! We have received your order and are working on it right away.",
    orderNumber: "Order number:",
    yourOrder: "Your order",
    product: "Product",
    quantity: "Qty",
    price: "Price",
    total: "Total:",
    shippingAddress: "📦 Shipping Address",
    shippingInfo: "🚚 <strong>Shipping:</strong> You will receive a separate email with tracking information once your package is on its way.",
    support: "Have questions about your order? Feel free to contact us through our website or reply to this email.",
    rights: "All rights reserved.",
    visitShop: "Visit our shop",
    emailTitle: "Order Confirmation - GetPawsy",
    subject: (orderId: string) => `🐾 Order Confirmation #${orderId} - GetPawsy`,
    trackOrder: "Track Your Order",
    trackOrderDescription: "Click the button below to view your order status:",
  }
};

const generateOrderEmailHtml = (
  orderId: string,
  customerName: string,
  items: OrderItem[],
  totalAmount: number,
  currency: string,
  shippingAddress?: ShippingAddress,
  orderAccessToken?: string
): string => {
  const country = shippingAddress?.address?.country;
  const isDutch = isDutchCountry(country);
  const t = isDutch ? translations.nl : translations.en;

  console.log(`[SEND-ORDER-CONFIRMATION] Language detection - Country: ${country}, Using Dutch: ${isDutch}`);

  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;" />` : ''}
          <div>
            <strong style="color: #1f2937;">${item.name}</strong>
            ${item.variant ? `<br><span style="color: #6b7280; font-size: 14px;">${item.variant}</span>` : ''}
          </div>
        </div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280;">
        ${item.quantity}x
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #1f2937; font-weight: 500;">
        ${formatCurrency(item.price * item.quantity, currency, isDutch)}
      </td>
    </tr>
  `).join('');

  const addressHtml = shippingAddress?.address ? `
    <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin-top: 24px;">
      <h3 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px;">${t.shippingAddress}</h3>
      <p style="margin: 0; color: #4b5563; line-height: 1.6;">
        ${shippingAddress.name || customerName}<br>
        ${shippingAddress.address.line1 || ''}<br>
        ${shippingAddress.address.line2 ? `${shippingAddress.address.line2}<br>` : ''}
        ${shippingAddress.address.postal_code || ''} ${shippingAddress.address.city || ''}<br>
        ${shippingAddress.address.country || ''}
      </p>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.emailTitle}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="margin: 0; color: white; font-size: 28px;">🐾 GetPawsy</h1>
      <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">${t.thankYou}</p>
    </div>
    
    <!-- Content -->
    <div style="background-color: white; padding: 32px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
      <p style="color: #1f2937; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        ${t.greeting(customerName)}
      </p>
      
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        ${t.intro}
      </p>
      
      <!-- Order Number -->
      <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
        <p style="margin: 0; color: #065f46; font-size: 14px;">
          <strong>${t.orderNumber}</strong> ${orderId.slice(0, 8).toUpperCase()}
        </p>
      </div>
      
      <!-- Order Items -->
      <h2 style="color: #1f2937; font-size: 18px; margin: 0 0 16px 0;">${t.yourOrder}</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #f9fafb;">
            <th style="padding: 12px; text-align: left; color: #6b7280; font-size: 14px; font-weight: 500;">${t.product}</th>
            <th style="padding: 12px; text-align: center; color: #6b7280; font-size: 14px; font-weight: 500;">${t.quantity}</th>
            <th style="padding: 12px; text-align: right; color: #6b7280; font-size: 14px; font-weight: 500;">${t.price}</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding: 16px 12px; text-align: right; font-weight: 600; color: #1f2937; font-size: 16px;">
              ${t.total}
            </td>
            <td style="padding: 16px 12px; text-align: right; font-weight: 600; color: #10b981; font-size: 18px;">
              ${formatCurrency(totalAmount, currency, isDutch)}
            </td>
          </tr>
        </tfoot>
      </table>
      
      ${addressHtml}
      
      <!-- Shipping Info -->
      <div style="background-color: #fef3c7; border: 1px solid #fcd34d; padding: 16px; border-radius: 8px; margin-top: 24px;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          ${t.shippingInfo}
        </p>
      </div>
      
      <!-- Track Order Button (with secure link for guest orders) -->
      ${orderAccessToken ? `
      <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 20px; border-radius: 8px; margin-top: 24px; text-align: center;">
        <p style="margin: 0 0 16px 0; color: #065f46; font-size: 14px;">
          ${t.trackOrderDescription}
        </p>
        <a href="https://getpawsy.pet/track-order?order=${encodeURIComponent(orderId)}&email=${encodeURIComponent(shippingAddress?.name ? '' : customerName)}&token=${encodeURIComponent(orderAccessToken)}" 
           style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
          📦 ${t.trackOrder}
        </a>
      </div>
      ` : ''}
      
      <!-- Support -->
      <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 24px;">
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0;">
          ${t.support}
        </p>
      </div>
      
      <!-- Footer -->
      <div style="text-align: center; margin-top: 32px;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} GetPawsy. ${t.rights}
        </p>
        <p style="margin: 8px 0 0 0;">
          <a href="https://getpawsy.pet" style="color: #10b981; text-decoration: none; font-size: 14px;">
            ${t.visitShop}
          </a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ---- Internal-caller guard ----
  const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-internal-secret") ?? "";
    if (provided !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("[SEND-ORDER-CONFIRMATION] RESEND_API_KEY not configured");
    return new Response(
      JSON.stringify({ error: "Email service not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const resend = new Resend(resendApiKey);

  try {
    const requestData: OrderConfirmationRequest = await req.json();
    const { orderId, customerEmail, customerName, items, totalAmount, currency, shippingAddress, orderAccessToken } = requestData;

    console.log("[SEND-ORDER-CONFIRMATION] Processing order:", orderId);
    console.log("[SEND-ORDER-CONFIRMATION] Customer email:", customerEmail);
    console.log("[SEND-ORDER-CONFIRMATION] Items count:", items?.length || 0);
    console.log("[SEND-ORDER-CONFIRMATION] Shipping country:", shippingAddress?.address?.country);
    console.log("[SEND-ORDER-CONFIRMATION] Has access token:", !!orderAccessToken);

    if (!customerEmail || !orderId) {
      console.error("[SEND-ORDER-CONFIRMATION] Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields: orderId and customerEmail" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const displayName = customerName || shippingAddress?.name || customerEmail.split('@')[0];
    
    const emailHtml = generateOrderEmailHtml(
      orderId,
      displayName,
      items || [],
      totalAmount,
      currency || 'EUR',
      shippingAddress,
      orderAccessToken
    );

    // Determine subject based on language
    const isDutch = isDutchCountry(shippingAddress?.address?.country);
    const t = isDutch ? translations.nl : translations.en;
    const subject = t.subject(orderId.slice(0, 8).toUpperCase());

    const emailResponse = await resend.emails.send({
      from: "GetPawsy <noreply@getpawsy.pet>",
      to: [customerEmail],
      subject: subject,
      html: emailHtml,
    });

    console.log("[SEND-ORDER-CONFIRMATION] Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[SEND-ORDER-CONFIRMATION] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
