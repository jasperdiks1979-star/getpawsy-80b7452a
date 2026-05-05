// Pinterest Viral Batch — generates 5 high-converting pins per run for a single
// product, using rotating hook frameworks (pain / curiosity / time-saving /
// social proof / transformation). 9:16 pin images are composited via
// Cloudinary's fetch API (text overlays on real product photos — no AI images,
// no stock footage). Pins are inserted into pinterest_pin_queue with
// staggered scheduled_at so the existing cron worker publishes them
// progressively.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
  "https://id-preview--597d7eb2-8207-4374-9ac1-67ffe0048ce1.lovable.app",
];

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const CLOUDINARY_CLOUD = "dlkqycfzn";
const BASE_URL = "https://getpawsy.pet";
const DEFAULT_SLUG = "automatic-cat-litter-box-self-cleaning-app-control";

// ---- Pexels (OPTIONAL secondary layer) ---------------------------------
// Used ONLY as a subtle lifestyle backdrop behind the real product image
// when the caller explicitly opts in (`useLifestyleBackdrop: true`).
// Product photo always remains the dominant visual — never replaced.
const PEXELS_QUERIES = [
  "happy cat home",        // pain
  "curious cat",           // curiosity
  "clean modern living room", // time_saving
  "cat owner with cat",    // social_proof
  "cozy cat sleeping",     // transformation
];

async function fetchPexelsBackdrop(query: string): Promise<string | null> {
  const key = Deno.env.get("PEXELS_API_KEY");
  if (!key) return null;
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&size=large&per_page=10`,
      { headers: { Authorization: key } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const photos: any[] = Array.isArray(j?.photos) ? j.photos : [];
    if (photos.length === 0) return null;
    const pick = photos[Math.floor(Math.random() * photos.length)];
    return pick?.src?.portrait || pick?.src?.large2x || pick?.src?.large || null;
  } catch (_e) {
    return null;
  }
}

// Hook frameworks — the AI must produce ONE variant per group, in this order.
const HOOK_GROUPS = [
  { key: "pain",            angle: "Pain point",       cta: "End the Daily Scoop" },
  { key: "curiosity",       angle: "Curiosity",        cta: "See Why" },
  { key: "time_saving",     angle: "Time-saving",      cta: "Save Hours Weekly" },
  { key: "social_proof",    angle: "Social proof",     cta: "Join 10,000+ Owners" },
  { key: "transformation",  angle: "Transformation",   cta: "Shop the Upgrade" },
] as const;

/** Map our 5 hooks → the 4 PDP intent slots (problem/solution/comparison/transformation). */
const HOOK_TO_INTENT: Record<string, string> = {
  pain: "problem",
  curiosity: "solution",
  time_saving: "solution",
  social_proof: "comparison",
  transformation: "transformation",
};

function escapeOverlay(s: string): string {
  // Cloudinary text param: replace commas/slashes which delimit transforms,
  // URL-encode spaces, keep it short and ASCII-safe.
  return encodeURIComponent(
    s.replace(/[,/]/g, " ")
      .replace(/[""'']/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60)
  );
}

/** Build a 9:16 (1080×1920) Cloudinary URL with top + bottom text overlays on the product image. */
function buildPinImage(productImageUrl: string, top: string, bottom: string): string {
  const W = 1080;
  const H = 1920;
  const base = [
    `w_${W}`,
    `h_${H}`,
    "c_fill",
    "g_center",
    "b_rgb:FAF6F0", // cream brand background
    "q_auto",
    "f_jpg",
  ].join(",");

  // Top headline — bold orange pill
  const topOverlay = [
    `l_text:Arial_72_bold:${escapeOverlay(top)}`,
    "co_rgb:FFFFFF",
    "b_rgb:FF6A1A",
    "bo_8px_solid_rgb:FFFFFF",
    "r_24",
    "w_900",
    "c_fit",
    "g_north",
    "y_120",
  ].join(",");

  // Bottom CTA — ink-on-white pill
  const bottomOverlay = [
    `l_text:Arial_56_bold:${escapeOverlay(bottom)}`,
    "co_rgb:1A1410",
    "b_rgb:FFFFFF",
    "r_20",
    "w_900",
    "c_fit",
    "g_south",
    "y_140",
  ].join(",");

  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${base}/${topOverlay}/${bottomOverlay}/${productImageUrl}`;
}

/**
 * Variant: Pexels lifestyle backdrop with the REAL product image as the
 * dominant centered hero (≈70% of frame). Backdrop is darkened so it never
 * competes with the product. Only used when caller opts in AND Pexels returns
 * a valid image — otherwise we fall back to buildPinImage.
 */
function buildPinImageWithBackdrop(
  productImageUrl: string,
  backdropUrl: string,
  top: string,
  bottom: string,
): string {
  const W = 1080;
  const H = 1920;
  const base = [
    `w_${W}`,
    `h_${H}`,
    "c_fill",
    "g_center",
    "e_brightness:-25",
    "q_auto",
    "f_jpg",
  ].join(",");

  // Product image overlay — large, centered, dominant
  const productOverlay = [
    `l_fetch:${btoa(productImageUrl).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`,
    "w_820",
    "h_1100",
    "c_fit",
    "g_center",
    "y_60",
    "r_32",
    "bo_6px_solid_rgb:FFFFFF",
  ].join(",");

  const topOverlay = [
    `l_text:Arial_72_bold:${escapeOverlay(top)}`,
    "co_rgb:FFFFFF",
    "b_rgb:FF6A1A",
    "bo_8px_solid_rgb:FFFFFF",
    "r_24",
    "w_900",
    "c_fit",
    "g_north",
    "y_120",
  ].join(",");

  const bottomOverlay = [
    `l_text:Arial_56_bold:${escapeOverlay(bottom)}`,
    "co_rgb:1A1410",
    "b_rgb:FFFFFF",
    "r_20",
    "w_900",
    "c_fit",
    "g_south",
    "y_140",
  ].join(",");

  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${base}/${productOverlay}/${topOverlay}/${bottomOverlay}/${backdropUrl}`;
}

function buildPinUrl(slug: string, hookKey: string): string {
  const intent = HOOK_TO_INTENT[hookKey] || "solution";
  return `${BASE_URL}/products/${slug}?utm_source=pinterest&utm_medium=social&utm_campaign=viral_batch&utm_content=${hookKey}&hook=${intent}`;
}

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers });

  try {
    const body = await req.json().catch(() => ({}));
    const slug: string = body.productSlug || DEFAULT_SLUG;
    // Optional: enable Pexels lifestyle backdrop layer.
    // OFF by default — product images stay primary.
    const useLifestyleBackdrop: boolean = !!body.useLifestyleBackdrop;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: product, error: pErr } = await sb
      .from("products")
      .select("id, name, slug, description, category, image_url, images")
      .eq("slug", slug)
      .single();
    if (pErr || !product) throw new Error(`Product not found: ${slug}`);

    const allImages: string[] = [
      product.image_url,
      ...((Array.isArray(product.images) ? product.images : []) as string[]),
    ].filter((u): u is string => typeof u === "string" && u.length > 0);
    if (allImages.length === 0) throw new Error("Product has no images");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const systemPrompt = `You write US-targeted Pinterest pins that convert clicks into product views.
RULES:
- Mobile-first, scroll-stopping, plain-spoken English (US audience)
- NO clickbait, NO ALL CAPS, NO emojis in titles, NO fake stats
- NO words: "vet-approved", "eco-friendly", "best ever", "guaranteed"
- Each variant uses a DIFFERENT hook framework (provided)

Return STRICT JSON, no prose, matching:
{ "pins": [
  {
    "hookKey": "pain|curiosity|time_saving|social_proof|transformation",
    "topOverlay":   "string, max 6 words, big bold headline",
    "bottomOverlay":"string, max 4 words, CTA",
    "title":        "string, 60-100 chars, keyword-rich, US English",
    "description":  "string, 2-3 sentences, includes keywords like 'self cleaning litter box', 'automatic litter box', ends with a soft CTA. NO URLs.",
    "tags":         ["5-8 lowercase keyword tags, no #"]
  } x 5 ]
}`;

    const userPrompt = `Generate exactly 5 pins for this product, one per hook framework, IN THIS ORDER:
${HOOK_GROUPS.map((h, i) => `${i + 1}. ${h.key} (${h.angle})`).join("\n")}

PRODUCT
Name: ${product.name}
Category: ${product.category || "Cat Litter Boxes"}
Description: ${product.description || ""}

SEO keywords to weave in naturally: self cleaning litter box, automatic litter box, smart litter box, cat hygiene, app controlled litter box.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      if (aiRes.status === 429) return new Response(JSON.stringify({ ok: false, message: "AI rate limited" }), { status: 429, headers: { ...headers, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ ok: false, message: "AI credits exhausted" }), { status: 402, headers: { ...headers, "Content-Type": "application/json" } });
      throw new Error(`AI gateway ${aiRes.status}: ${text.slice(0, 200)}`);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content || "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned no JSON");
    const parsed = JSON.parse(match[0]);

    let aiPins: any[] = Array.isArray(parsed?.pins) ? parsed.pins : [];
    // Ensure exactly 5, in hook order
    aiPins = HOOK_GROUPS.map((h, i) => {
      const found = aiPins.find((p) => String(p?.hookKey).toLowerCase() === h.key) || aiPins[i] || {};
      return { ...found, hookKey: h.key };
    });

    const now = Date.now();
    const STAGGER_MIN = 35; // ~one pin every 35 minutes — safe vs Pinterest limits
    const batchTag = `batch_${new Date(now).toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;

    const rows = aiPins.map((p, i) => {
      const hook = HOOK_GROUPS[i];
      const productImage = allImages[i % allImages.length];
      const topOverlay = String(p.topOverlay || "Stop scooping every day").slice(0, 50);
      const bottomOverlay = String(p.bottomOverlay || hook.cta).slice(0, 30);
      const pinImageUrl = buildPinImage(productImage, topOverlay, bottomOverlay);
      const title = String(p.title || `${product.name} — ${hook.angle}`).slice(0, 100);
      const description = String(p.description || "Self-cleaning automatic litter box with app control. Less mess, less smell, more time. Shop now.").slice(0, 480);
      const tags: string[] = Array.isArray(p.tags) ? p.tags.map((t: string) => String(t).toLowerCase().replace(/^#/, "").trim()).filter(Boolean).slice(0, 8) : [];

      return {
        product_id: product.id,
        product_slug: product.slug,
        product_name: product.name,
        pin_variant: `viral_${hook.key}_${batchTag}`,
        pin_title: title,
        pin_description: description,
        pin_image_url: pinImageUrl,
        destination_link: buildPinUrl(product.slug, hook.key),
        board_name: "Smart Pet Gadgets",
        hashtags: tags,
        priority: "high",
        status: "queued",
        scheduled_at: new Date(now + i * STAGGER_MIN * 60_000).toISOString(),
        hook_group: hook.key,
        category_key: "cat-litter",
        overlay_text: `${topOverlay} | ${bottomOverlay}`,
      };
    });

    // Optional secondary layer: enrich SOME pins (every other one) with a
    // Pexels lifestyle backdrop while keeping the product image dominant.
    if (useLifestyleBackdrop) {
      for (let i = 0; i < rows.length; i += 2) {
        const hook = HOOK_GROUPS[i];
        const productImage = allImages[i % allImages.length];
        const backdrop = await fetchPexelsBackdrop(PEXELS_QUERIES[i] || "happy cat");
        if (!backdrop) continue; // graceful fallback to product-only pin
        const [top, bot] = (rows[i].overlay_text as string).split(" | ");
        rows[i].pin_image_url = buildPinImageWithBackdrop(
          productImage,
          backdrop,
          top,
          bot || hook.cta,
        );
        rows[i].pin_variant = `${rows[i].pin_variant}_lifestyle`;
      }
    }

    const { data: inserted, error: insErr } = await sb
      .from("pinterest_pin_queue")
      .insert(rows)
      .select("id, pin_variant, hook_group, scheduled_at, pin_image_url");
    if (insErr) throw new Error(`Queue insert failed: ${insErr.message}`);

    const traceId = crypto.randomUUID();
    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: `Queued ${inserted?.length ?? 0} viral pins`,
        product: { id: product.id, slug: product.slug, name: product.name },
        batchTag,
        pins: inserted,
      }),
      { headers: { ...headers, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[pinterest-viral-batch]", e);
    return new Response(
      JSON.stringify({ ok: false, message: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors(req), "Content-Type": "application/json" } },
    );
  }
});