import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const traceId = crypto.randomUUID();
  const respond = (payload: Record<string, unknown>) =>
    new Response(JSON.stringify({ traceId, ...payload }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const { productId, productSlug } = await req.json().catch(() => ({}));
    console.log(`[pinterest-pin-generator] start trace=${traceId} productId=${productId} slug=${productSlug}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch product
    let query = sb.from("products").select("id, name, slug, description, price, category, image_url");
    if (productId) query = query.eq("id", productId);
    else if (productSlug) query = query.eq("slug", productSlug);
    else return respond({ ok: false, code: "MISSING_INPUT", message: "productId or productSlug required" });

    const { data: product, error } = await query.single();
    if (error || !product) {
      console.error(`[pinterest-pin-generator] Product lookup failed:`, error?.message);
      return respond({ ok: false, code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    }
    if (!product.image_url) {
      console.error(`[pinterest-pin-generator] Product "${product.slug}" has no image_url`);
      return respond({ ok: false, code: "NO_PRODUCT_IMAGES", message: "Product has no images — cannot render pins" });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[pinterest-pin-generator] LOVABLE_API_KEY missing");
      return respond({ ok: false, code: "LOVABLE_API_KEY_MISSING", message: "AI gateway key not configured" });
    }

    const BASE_URL = "https://getpawsy.pet";
    const baseProductUrl = `${BASE_URL}/products/${product.slug}`;

    // Hook groups MUST match useAdIntent.INTENT_MAP keys so the PDP swaps
    // its headline + benefit subline on arrival. Keep this list in sync.
    const HOOK_GROUPS = ["problem", "solution", "comparison", "transformation"] as const;
    const buildPinUrl = (hookGroup: string) =>
      `${baseProductUrl}?utm_source=pinterest&utm_medium=social&utm_campaign=organic_pin&hook=${hookGroup}`;

    const systemPrompt = `You are a Pinterest marketing expert for GetPawsy.pet, a US-based pet supply e-commerce store. You create high-CTR Pinterest pins that drive traffic and conversions.

STRICT RULES:
- Write for US pet parents
- NEVER include URLs inside pin descriptions
- NEVER use spammy wording, fake reviews, or misleading claims
- Keep language natural and persuasive
- Focus on: time saving, convenience, problem solving, emotional benefit
- Use ✔ format for bullet benefits
- Each pin MUST use a DIFFERENT angle/hook

HOOK GROUPS (MANDATORY — set "hookGroup" to ONE of these exact lowercase values):
- "problem"        → opens with a real, specific pain point
- "solution"       → leads with the easier/smarter way
- "comparison"     → why this beats the typical alternative
- "transformation" → before vs. after, daily-life upgrade

DESCRIPTION STRUCTURE (200–400 chars, NO hype, NO ALL-CAPS, NO clickbait):
1. Problem-focused opening (1 sentence — what frustrates the owner today)
2. Clear benefit (1 sentence — what changes once they have this)
3. 2–3 ✔ benefit bullets (concrete, scannable)
4. CTA: "Shop now" (or "See more" / "Browse the collection")
5. 3–5 lowercase hashtags

OUTPUT: Return valid JSON matching this exact structure:
{
  "productUrl": "string",
  "primaryKeyword": "string",
  "longTailKeywords": ["5 long-tail keyword variations"],
  "pinterestPhrases": ["5 Pinterest-friendly search phrases"],
  "pins": [
    {
      "pinNumber": 1,
      "hookGroup": "problem | solution | comparison | transformation",
      "hookAngle": "string (short label of the angle used)",
      "title": "string (max 100 chars, high-CTR, keyword-rich)",
      "description": "string (200-400 chars: Problem → Benefit → ✔ bullets → 'Shop now' CTA → hashtags)",
      "imagePrompt": "string (vertical 2:3 Pinterest style, clean product focus, emotional trigger, soft lighting, high contrast, include overlay text suggestion)",
      "suggestedOverlayText": "string (big bold headline for pin image)",
      "bestPostingTime": "string (morning/afternoon/evening US time)"
    }
  ],
  "postingSchedule": {
    "pin1": "string (e.g. '9:00 AM EST - Morning scroll')",
    "pin2": "string",
    "pin3": "string"
  },
  "suggestedBoards": ["3-5 board name suggestions"]
}`;

    const userPrompt = `Generate 3 unique Pinterest pins for this product:

Product Name: ${product.name}
Category: ${product.category || "Pet Products"}
Price: $${product.price}
Description: ${product.description || "No description"}
Product URL (do NOT include in description, used for tracking only): ${baseProductUrl}

Requirements:
- 3 pins, each with a DIFFERENT hookGroup from: problem, solution, comparison, transformation
- Titles max 100 chars, keyword-rich, high-CTR
- Descriptions follow: Problem → Benefit → ✔ bullets → "Shop now" CTA → 3-5 hashtags
- Image prompts for vertical 2:3 Pinterest format
- Extract primary keyword from the product name/slug
- Generate 5 long-tail keyword variations
- Include posting schedule (morning/afternoon/evening US time)
- Suggest Pinterest board names
- Occasionally include soft brand mention like "Browse more smart pet products on GetPawsy"`;

    let parsed: any;
    try {
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
            { role: "user", content: userPrompt },
          ],
          temperature: 0.8,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        const text = await response.text().catch(() => "");
        console.error(`[pinterest-pin-generator] AI gateway ${status}: ${text.slice(0, 300)}`);
        if (status === 429) return respond({ ok: false, code: "AI_RATE_LIMITED", message: "Rate limited. Try again shortly.", fallback: true });
        if (status === 402) return respond({ ok: false, code: "AI_CREDITS_EXHAUSTED", message: "AI credits exhausted — top up Lovable AI", fallback: true });
        return respond({ ok: false, code: "AI_GATEWAY_ERROR", message: `AI gateway error: ${status}`, fallback: true });
      }

      const aiData = await response.json();
      const raw = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("[pinterest-pin-generator] AI returned no JSON");
        return respond({ ok: false, code: "AI_PARSE_ERROR", message: "Failed to parse AI response", fallback: true });
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[pinterest-pin-generator] AI call threw:", msg);
      return respond({ ok: false, code: "AI_NETWORK_ERROR", message: msg, fallback: true });
    }

    // Hard cap to 3 pins per run
    if (Array.isArray(parsed?.pins)) parsed.pins = parsed.pins.slice(0, 3);

    // Tag every pin's destination URL with its hookGroup so the PDP can swap
    // headline + subline on arrival (see src/hooks/useAdIntent.ts).
    if (Array.isArray(parsed?.pins)) {
      parsed.pins = parsed.pins.map((pin: any, idx: number) => {
        const rawHook = String(pin?.hookGroup || "").toLowerCase().trim();
        const hookGroup = (HOOK_GROUPS as readonly string[]).includes(rawHook)
          ? rawHook
          : HOOK_GROUPS[idx % HOOK_GROUPS.length];
        return {
          ...pin,
          hookGroup,
          destinationUrl: buildPinUrl(hookGroup),
        };
      });
    }
    parsed.productUrl = baseProductUrl;

    // Store in database
    await sb.from("pinterest_pins").upsert({
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      product_url: baseProductUrl,
      pin_data: parsed,
      generated_at: new Date().toISOString(),
    }, { onConflict: "product_id" });

    console.log(`[pinterest-pin-generator] success trace=${traceId} pins=${parsed?.pins?.length ?? 0}`);
    return respond({ ok: true, data: parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[pinterest-pin-generator] UNCAUGHT trace=${traceId}:`, msg, e instanceof Error ? e.stack : "");
    return respond({ ok: false, code: "UNEXPECTED_ERROR", message: msg, fallback: true });
  }
});
