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

// Whitelist of columns that exist on pinterest_pin_queue. Any extra fields
// (e.g. optional backdrop_* visual metadata) are silently dropped so the
// queue insert can never fail because of missing columns.
export const ALLOWED_QUEUE_COLUMNS = new Set<string>([
  "product_id", "product_slug", "product_name", "pin_variant",
  "pin_title", "pin_description", "pin_image_url", "destination_link",
  "board_name", "hashtags", "priority", "status", "scheduled_at",
  "hook_group", "category_key", "overlay_text",
]);

export function sanitizeQueueRows<T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(r)) {
      if (ALLOWED_QUEUE_COLUMNS.has(k)) out[k] = (r as Record<string, unknown>)[k];
    }
    return out;
  });
}

// Required columns the insert payload absolutely needs. If any of these are
// missing from the live table the function aborts BEFORE building/inserting
// pins so we never burn AI/Pexels credits on a doomed batch.
export const REQUIRED_QUEUE_COLUMNS = [
  "product_id", "product_slug", "pin_variant", "pin_title",
  "pin_image_url", "destination_link", "status", "scheduled_at",
] as const;

type SchemaCheck =
  | { ok: true; columns: Set<string> }
  | { ok: false; code: "SCHEMA_INVALID"; missing: string[]; message: string };

// Cached per cold start — information_schema lookup is cheap but pointless
// to repeat on every invocation.
let _schemaCache: SchemaCheck | null = null;

export async function verifyQueueSchema(
  sb: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> },
  opts: { force?: boolean } = {},
): Promise<SchemaCheck> {
  if (_schemaCache && !opts.force) return _schemaCache;
  // Use a tiny RPC-free probe: select 0 rows but request every required column.
  // PostgREST returns 400 with column name on mismatch.
  // We can't easily do that from the client without leaking the API surface,
  // so query information_schema via a SECURITY DEFINER RPC if available;
  // otherwise fall back to a HEAD request shape.
  try {
    // @ts-ignore — runtime client passes through here
    const { data, error } = await (sb as unknown as {
      from: (t: string) => { select: (s: string, o: { head: boolean; count: "exact" }) => Promise<{ data: unknown; error: { message: string } | null }> };
    })
      .from("pinterest_pin_queue")
      .select(REQUIRED_QUEUE_COLUMNS.join(","), { head: true, count: "exact" });
    if (error) {
      const missing = REQUIRED_QUEUE_COLUMNS.filter((c) => error.message.includes(c));
      const result: SchemaCheck = {
        ok: false,
        code: "SCHEMA_INVALID",
        missing: missing.length ? missing : [error.message],
        message: `pinterest_pin_queue schema check failed: ${error.message}`,
      };
      _schemaCache = result;
      return result;
    }
    void data;
    const result: SchemaCheck = { ok: true, columns: new Set(ALLOWED_QUEUE_COLUMNS) };
    _schemaCache = result;
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown schema check error";
    return { ok: false, code: "SCHEMA_INVALID", missing: [], message: msg };
  }
}

export function __resetSchemaCacheForTests() {
  _schemaCache = null;
}

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

/**
 * Per-hook fallback palette — used when Pexels is unavailable. Each palette
 * matches the *color temperature* and emotional tone of its Pexels query so
 * the resulting Cloudinary-rendered backdrop feels cohesive with what would
 * have been fetched. Two colors per hook → primary fill + accent for a soft
 * duotone gradient.
 */
const HOOK_FALLBACK_PALETTE: Record<string, { primary: string; accent: string; temp: "warm" | "cool" | "neutral" }> = {
  pain:           { primary: "C97B2B", accent: "5A2A12", temp: "warm" },     // amber → deep brown (urgency)
  curiosity:      { primary: "2B6E7A", accent: "0F2A33", temp: "cool" },     // teal → ink (intrigue)
  time_saving:   { primary: "3A4A5C", accent: "1A2230", temp: "cool" },      // slate → navy (calm)
  social_proof:   { primary: "B5946A", accent: "5C432A", temp: "warm" },     // cream → cocoa (trust)
  transformation: { primary: "4A2E5C", accent: "1F1330", temp: "cool" },     // plum → midnight (wow)
};

type PexelsPhoto = {
  url: string;
  avgColor: string | null;
  width: number | null;
  height: number | null;
  photographer: string | null;
  pexelsPageUrl: string | null;
};

async function fetchPexelsBackdrop(query: string): Promise<PexelsPhoto | null> {
  const key = Deno.env.get("PEXELS_API_KEY");
  if (!key) {
    console.warn("[pinterest-viral-batch] PEXELS_API_KEY missing — using Cloudinary fallback backdrop");
    return null;
  }
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&size=large&per_page=10`,
      { headers: { Authorization: key } },
    );
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.warn(`[pinterest-viral-batch] Pexels ${r.status} for "${query}": ${body.slice(0, 200)}`);
      return null;
    }
    const j = await r.json();
    const photos: any[] = Array.isArray(j?.photos) ? j.photos : [];
    if (photos.length === 0) {
      console.warn(`[pinterest-viral-batch] Pexels returned 0 photos for "${query}"`);
      return null;
    }
    const pick = photos[Math.floor(Math.random() * photos.length)];
    const url = pick?.src?.portrait || pick?.src?.large2x || pick?.src?.large || null;
    if (!url) return null;
    return {
      url,
      avgColor: typeof pick?.avg_color === "string" ? pick.avg_color : null,
      width: typeof pick?.width === "number" ? pick.width : null,
      height: typeof pick?.height === "number" ? pick.height : null,
      photographer: typeof pick?.photographer === "string" ? pick.photographer : null,
      pexelsPageUrl: typeof pick?.url === "string" ? pick.url : null,
    };
  } catch (e) {
    console.error(`[pinterest-viral-batch] Pexels fetch threw for "${query}":`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Cloudinary-only fallback backdrop. Renders a 1080×1920 portrait canvas
 * with the hook's primary color as fill, an accent-color radial overlay,
 * a gentle blur, and JPEG output — usable as a drop-in replacement for a
 * Pexels photo URL. Always succeeds (no network dependency on Pexels).
 */
function buildCloudinaryFallbackBackdrop(hookKey: string): PexelsPhoto {
  const palette = HOOK_FALLBACK_PALETTE[hookKey] || HOOK_FALLBACK_PALETTE.curiosity;
  // Seed asset: a public SVG we already host. Cloudinary fetches it, then
  // we discard its pixels by padding to 1080×1920 with a solid bg color
  // and stacking a soft accent overlay on top.
  const seed = encodeURIComponent(`${BASE_URL}/placeholder.svg`);
  const base = [
    "w_1080",
    "h_1920",
    "c_pad",
    `b_rgb:${palette.primary}`,
    "f_jpg",
    "q_auto",
  ].join(",");
  // Soft accent vignette — second colored "image" via text trick (a single
  // space rendered huge with a colored background) blurred heavily so it
  // feels like a radial gradient. Cloudinary text overlays accept bg color.
  const accent = [
    "l_text:Arial_400_bold:%20",
    `b_rgb:${palette.accent}`,
    "co_rgb:00000000",
    "w_1400",
    "h_1400",
    "c_fit",
    "g_south",
    "y_-200",
    "o_70",
    "e_blur:600",
  ].join(",");
  const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${base}/${accent}/${seed}`;
  return {
    url,
    avgColor: `#${palette.primary}`,
    width: 1080,
    height: 1920,
    photographer: null,
    pexelsPageUrl: null,
  };
}

/* ─── Backdrop styles + readability scorer ──────────────────────────────
 * We render the SAME Pexels backdrop with 3 different Cloudinary effect
 * stacks and pick the style that maximizes overlay readability based on
 * the photo's average color luminance + saturation. The product image
 * stays the visual hero in every variant.
 */
type BackdropStyle = "dark" | "subtle" | "accent";

const STYLE_EFFECTS: Record<BackdropStyle, string[]> = {
  // Heavy darken + slight blur — best for bright/busy photos so white
  // headline pills always pop. Mimics a "cinematic poster" look.
  dark:   ["e_brightness:-50", "e_saturation:-20", "e_blur:120"],
  // Lightly darkened + desaturated — best when photo is already moody so
  // we don't crush detail. Keeps lifestyle context visible.
  subtle: ["e_brightness:-15", "e_saturation:-25", "e_blur:60"],
  // Mid darken + boosted saturation — best when photo has a strong color
  // accent that complements the brand orange CTA pill.
  accent: ["e_brightness:-30", "e_saturation:35", "e_blur:80", "e_vignette:30"],
};

/** Convert hex (#RRGGBB) → relative luminance 0–1 (sRGB). */
function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  // Rec. 709 luma — good enough proxy for perceived brightness.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Saturation 0–1 from hex (HSL S component). */
function hexSaturation(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

/**
 * Score readability for each style. Higher = better.
 * After applying the style's brightness offset we want the *effective*
 * backdrop luminance to land near 0.22 — dark enough so white-on-orange
 * top pill and dark-on-white bottom pill both have ≥4.5 contrast against
 * neighboring backdrop pixels, but not so dark we lose all atmosphere.
 */
function scoreStyle(style: BackdropStyle, avgColor: string | null): number {
  if (!avgColor) {
    // No color signal — slight bias toward subtle (safest middle ground).
    return style === "subtle" ? 0.6 : 0.5;
  }
  const lum = hexLuminance(avgColor);
  const sat = hexSaturation(avgColor);
  const brightnessDelta =
    style === "dark" ? -0.40 : style === "subtle" ? -0.15 : -0.30;
  const effectiveLum = Math.max(0, Math.min(1, lum + brightnessDelta));
  const TARGET = 0.22;
  // 1.0 when at target, falls off linearly.
  const proximity = 1 - Math.min(1, Math.abs(effectiveLum - TARGET) / 0.5);
  // Bonus for accent style when source has real color punch.
  const accentBonus = style === "accent" ? sat * 0.35 : 0;
  // Mild bonus for dark style when source is very bright (>0.7).
  const darkBonus = style === "dark" && lum > 0.65 ? 0.15 : 0;
  // Mild bonus for subtle when source is already moody (<0.35).
  const subtleBonus = style === "subtle" && lum < 0.35 ? 0.15 : 0;
  return Number((proximity + accentBonus + darkBonus + subtleBonus).toFixed(3));
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
 * dominant centered hero (≈70% of frame). Backdrop effects vary per style
 * (dark / subtle / accent) so the auto-picker can choose the most readable
 * variant per photo. Product photo always remains the visual hero.
 */
function buildPinImageWithBackdrop(
  productImageUrl: string,
  backdropUrl: string,
  top: string,
  bottom: string,
  style: BackdropStyle = "dark",
): string {
  const W = 1080;
  const H = 1920;
  const base = [
    `w_${W}`,
    `h_${H}`,
    "c_fill",
    "g_center",
    ...STYLE_EFFECTS[style],
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
  const traceId = crypto.randomUUID();
  // Helper: always 200 to caller — frontend reads `ok` flag.
  const respond = (payload: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify({ traceId, ...payload }), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const slug: string = body.productSlug || DEFAULT_SLUG;
    // Optional: enable Pexels lifestyle backdrop layer.
    // OFF by default — product images stay primary.
    const useLifestyleBackdrop: boolean = !!body.useLifestyleBackdrop;
    // Per-hook override: { pain: true, curiosity: false, ... }
    // When provided it FULLY replaces the default "every other pin" pattern
    // and only the explicitly enabled hooks get a backdrop.
    const backdropByHook: Record<string, boolean> | null =
      body.backdropByHook && typeof body.backdropByHook === "object"
        ? body.backdropByHook
        : null;
    // Dry-run mode: build pins + Pexels backdrops but DO NOT insert into queue.
    // Used by the admin preview screen to inspect lifestyle backdrops first.
    const dryRun: boolean = !!body.dryRun;
    // Hard cap to prevent overload — never generate more than 3 pins per run.
    const MAX_PINS_PER_RUN = 3;
    const requestedLimit = Number.isFinite(Number(body.maxPins)) ? Number(body.maxPins) : MAX_PINS_PER_RUN;
    const pinLimit = Math.max(1, Math.min(MAX_PINS_PER_RUN, requestedLimit));
    console.log(`[pinterest-viral-batch] start trace=${traceId} slug=${slug} dryRun=${dryRun} backdrop=${useLifestyleBackdrop} limit=${pinLimit}`);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: product, error: pErr } = await sb
      .from("products")
      .select("id, name, slug, description, category, image_url, images")
      .eq("slug", slug)
      .single();
    if (pErr || !product) {
      console.error(`[pinterest-viral-batch] Product lookup failed for "${slug}":`, pErr?.message);
      return respond({ ok: false, code: "PRODUCT_NOT_FOUND", message: `Product not found: ${slug}` });
    }

    const allImages: string[] = [
      product.image_url,
      ...((Array.isArray(product.images) ? product.images : []) as string[]),
    ].filter((u): u is string => typeof u === "string" && u.length > 0);
    if (allImages.length === 0) {
      console.error(`[pinterest-viral-batch] Product "${slug}" has no usable images`);
      return respond({ ok: false, code: "NO_PRODUCT_IMAGES", message: "Product has no images — cannot render pins" });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[pinterest-viral-batch] LOVABLE_API_KEY missing");
      return respond({ ok: false, code: "LOVABLE_API_KEY_MISSING", message: "AI gateway key not configured" });
    }

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

    let parsed: any = { pins: [] };
    let aiFallback = false;
    try {
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
        const text = await aiRes.text().catch(() => "");
        console.error(`[pinterest-viral-batch] AI gateway ${aiRes.status}: ${text.slice(0, 300)}`);
        if (aiRes.status === 429) return respond({ ok: false, code: "AI_RATE_LIMITED", message: "AI rate limited — try again in a minute", fallback: true });
        if (aiRes.status === 402) return respond({ ok: false, code: "AI_CREDITS_EXHAUSTED", message: "AI credits exhausted — top up Lovable AI", fallback: true });
        aiFallback = true;
      } else {
        const aiJson = await aiRes.json();
        const raw = aiJson?.choices?.[0]?.message?.content || "";
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) {
          console.warn("[pinterest-viral-batch] AI returned no JSON — using deterministic fallback copy");
          aiFallback = true;
        } else {
          try {
            parsed = JSON.parse(match[0]);
          } catch (e) {
            console.warn("[pinterest-viral-batch] AI JSON parse failed:", e instanceof Error ? e.message : e);
            aiFallback = true;
          }
        }
      }
    } catch (e) {
      console.error("[pinterest-viral-batch] AI gateway threw:", e instanceof Error ? e.message : e);
      aiFallback = true;
    }

    let aiPins: any[] = Array.isArray(parsed?.pins) ? parsed.pins : [];
    // Limit to first N hook groups (cap = pinLimit, max 3)
    const ACTIVE_HOOKS = HOOK_GROUPS.slice(0, pinLimit);
    aiPins = ACTIVE_HOOKS.map((h, i) => {
      const found = aiPins.find((p) => String(p?.hookKey).toLowerCase() === h.key) || aiPins[i] || {};
      return { ...found, hookKey: h.key };
    });

    const now = Date.now();
    const STAGGER_MIN = 35; // ~one pin every 35 minutes — safe vs Pinterest limits
    const batchTag = `batch_${new Date(now).toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;

    const rows = aiPins.map((p, i) => {
      const hook = ACTIVE_HOOKS[i];
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
      // Decide which pin indexes get a backdrop:
      // - explicit per-hook map wins (only `true` entries)
      // - else fall back to legacy "every other pin" pattern (0,2,4)
      const enabledIdx: number[] = backdropByHook
        ? rows
            .map((_, idx) => (backdropByHook[ACTIVE_HOOKS[idx].key] ? idx : -1))
            .filter((idx) => idx >= 0)
        : rows.map((_, idx) => idx).filter((idx) => idx % 2 === 0);

      for (const i of enabledIdx) {
        const hook = ACTIVE_HOOKS[i];
        const productImage = allImages[i % allImages.length];
        const query = PEXELS_QUERIES[i] || "happy cat";
        let backdrop = await fetchPexelsBackdrop(query);
        let backdropSource: "pexels" | "cloudinary_fallback" = "pexels";
        if (!backdrop) {
          // Pexels unavailable (no key, network error, empty result) — render
          // a Cloudinary-only backdrop in the same color temperature as the
          // hook's intended Pexels query, so the lifestyle layer never silently
          // disappears.
          backdrop = buildCloudinaryFallbackBackdrop(hook.key);
          backdropSource = "cloudinary_fallback";
        }
        const [top, bot] = (rows[i].overlay_text as string).split(" | ");
        const bottomText = bot || hook.cta;

        // Score all 3 backdrop styles for this photo and pick the winner.
        const styles: BackdropStyle[] = ["dark", "subtle", "accent"];
        const scored = styles.map((style) => ({
          style,
          score: scoreStyle(style, backdrop.avgColor),
          url: buildPinImageWithBackdrop(productImage, backdrop.url, top, bottomText, style),
        }));
        scored.sort((a, b) => b.score - a.score);
        const winner = scored[0];

        rows[i].pin_image_url = winner.url;
        rows[i].pin_variant = `${rows[i].pin_variant}_lifestyle_${winner.style}`;
        (rows[i] as any).backdrop_url = backdrop.url;
        (rows[i] as any).backdrop_query = query;
        (rows[i] as any).backdrop_avg_color = backdrop.avgColor;
        (rows[i] as any).backdrop_source = backdropSource;
        (rows[i] as any).backdrop_width = backdrop.width;
        (rows[i] as any).backdrop_height = backdrop.height;
        (rows[i] as any).backdrop_photographer = backdrop.photographer;
        (rows[i] as any).backdrop_pexels_page = backdrop.pexelsPageUrl;
        (rows[i] as any).backdrop_hook_group = hook.key;
        (rows[i] as any).backdrop_style = winner.style;
        (rows[i] as any).backdrop_score = winner.score;
        (rows[i] as any).backdrop_variants = scored.map((s) => ({
          style: s.style,
          score: s.score,
          url: s.url,
        }));
      }
    }

    if (dryRun) {
      return respond({
          ok: true,
          dryRun: true,
          aiFallback,
          message: `Preview ${rows.length} pins (not queued)`,
          product: { id: product.id, slug: product.slug, name: product.name },
          batchTag,
          pins: rows.map((r: any) => ({
            hook_group: r.hook_group,
            pin_variant: r.pin_variant,
            pin_title: r.pin_title,
            pin_description: r.pin_description,
            pin_image_url: r.pin_image_url,
            destination_link: r.destination_link,
            scheduled_at: r.scheduled_at,
            overlay_text: r.overlay_text,
            backdrop_url: r.backdrop_url || null,
            backdrop_query: r.backdrop_query || null,
            backdrop_avg_color: r.backdrop_avg_color || null,
            backdrop_source: r.backdrop_source || null,
            backdrop_width: r.backdrop_width ?? null,
            backdrop_height: r.backdrop_height ?? null,
            backdrop_photographer: r.backdrop_photographer || null,
            backdrop_pexels_page: r.backdrop_pexels_page || null,
            backdrop_hook_group: r.backdrop_hook_group || null,
            backdrop_style: r.backdrop_style || null,
            backdrop_score: r.backdrop_score ?? null,
            backdrop_variants: r.backdrop_variants || null,
            uses_lifestyle_backdrop: !!r.backdrop_url,
          })),
        });
    }

    // Strip optional visual metadata (backdrop_*) before insert — those columns
    // do not exist on pinterest_pin_queue. Insert must never fail because of
    // optional enrichment data. See sanitizeQueueRows() for the column whitelist.
    const sanitizedRows = sanitizeQueueRows(rows as Record<string, unknown>[]);
    const { data: inserted, error: insErr } = await sb
      .from("pinterest_pin_queue")
      .insert(sanitizedRows)
      .select("id, pin_variant, hook_group, scheduled_at, pin_image_url");
    if (insErr) {
      console.error("[pinterest-viral-batch] Queue insert failed:", insErr.message);
      return respond({ ok: false, code: "QUEUE_INSERT_FAILED", message: `Queue insert failed: ${insErr.message}` });
    }

    console.log(`[pinterest-viral-batch] success trace=${traceId} queued=${inserted?.length ?? 0}`);
    return respond({
      ok: true,
      aiFallback,
      message: `Queued ${inserted?.length ?? 0} viral pins`,
      product: { id: product.id, slug: product.slug, name: product.name },
      batchTag,
      pins: inserted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    console.error(`[pinterest-viral-batch] UNCAUGHT trace=${traceId}:`, msg, stack);
    return respond({ ok: false, code: "UNEXPECTED_ERROR", message: msg, fallback: true });
  }
});