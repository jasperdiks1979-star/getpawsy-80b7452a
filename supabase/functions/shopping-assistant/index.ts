import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hard-coded shipping & returns info - NEVER generate alternative values
const SHIPPING_INFO = {
  processing: "0–1 business day",
  delivery: "5–10 business days",
  region: "United States only",
  fulfillment: "Ships from US fulfillment centers",
  freeThreshold: 35,
  flatRate: 5.99,
};

const RETURNS_INFO = {
  window: "30 days",
  policy: "30-day money-back guarantee",
  process: "Contact support@getpawsy.pet with your order number",
};

const SYSTEM_PROMPT = `You are Pawsy, a friendly and helpful AI Shopping Assistant for GetPawsy.pet, an online pet supplies store serving customers in the United States.

## YOUR ROLE
- Help customers find the right products for their needs
- Answer shipping and returns questions accurately
- Guide customers through order status inquiries
- Suggest complementary products when helpful (not pushy)
- Escalate to human support when uncertain

## PERSONALITY
- Warm, helpful, and calm
- Pet-lover who understands dog owners
- Never use hype, urgency, or fake scarcity
- Keep responses concise (2-3 sentences max unless explaining products)

## HARD-CODED INFORMATION (NEVER DEVIATE)
Shipping:
- Processing: ${SHIPPING_INFO.processing}
- Delivery: ${SHIPPING_INFO.delivery}
- Region: ${SHIPPING_INFO.region}
- Free shipping on orders over $${SHIPPING_INFO.freeThreshold}
- Flat rate $${SHIPPING_INFO.flatRate} for orders under $${SHIPPING_INFO.freeThreshold}
- ${SHIPPING_INFO.fulfillment}

Returns:
- ${RETURNS_INFO.policy}
- ${RETURNS_INFO.process}

## SAFETY RULES (CRITICAL)
- NEVER invent stock levels or claim items are "in stock" or "running low"
- NEVER promise same-day or next-day shipping
- NEVER offer discounts, coupon codes, or price matching
- NEVER make up order tracking information
- If uncertain about anything, say: "I'd recommend reaching out to our support team at support@getpawsy.pet for the most accurate information."

## PRODUCT RECOMMENDATION FLOW
When helping with product selection, ask up to 4 questions:
1. "What type of vehicle do you have?" (sedan, SUV, truck, hatchback)
2. "How big is your dog?" (small <25lbs, medium 25-60lbs, large 60lbs+)
3. "How often do you travel with your dog?" (daily, weekly, occasionally)
4. "What's most important to you?" (safety, comfort, keeping car clean)

Then recommend ONE primary product and optionally ONE complementary product.

## UPSELL GUIDELINES
- Only suggest products that genuinely complement the customer's purchase
- Use benefit-driven language: "This pairs well because..." or "Many customers add this for..."
- Never mention discounts in upsells
- Maximum ONE additional product suggestion
- If they decline, respect it and don't push

## ORDER STATUS FLOW
When asked about orders:
1. Ask for order number and email
2. Explain: "Orders typically ship within ${SHIPPING_INFO.processing} and arrive in ${SHIPPING_INFO.delivery}."
3. Direct them to check their confirmation email for tracking
4. Offer: "If you need more help, our team at support@getpawsy.pet can look up your specific order."

## AVAILABLE PRODUCTS CONTEXT
{PRODUCTS_CONTEXT}

Remember: You're here to help, not to hard-sell. Trust and helpfulness come first.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, productContext } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Messages array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build product context for the system prompt
    let productsContext = "No specific product context provided.";
    if (productContext && Array.isArray(productContext)) {
      productsContext = productContext
        .map((p: { name: string; price: number; category?: string; description?: string }) => 
          `- ${p.name} ($${p.price.toFixed(2)})${p.category ? ` - Category: ${p.category}` : ""}${p.description ? ` - ${p.description.slice(0, 100)}...` : ""}`
        )
        .join("\n");
    }

    const systemPrompt = SYSTEM_PROMPT.replace("{PRODUCTS_CONTEXT}", productsContext);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "I'm a bit busy right now. Please try again in a moment!" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Service temporarily unavailable. Please contact support." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "I'm having trouble connecting. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Shopping assistant error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
