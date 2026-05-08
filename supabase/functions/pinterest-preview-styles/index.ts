// Pinterest Preview Styles — admin-only dry-run endpoint.
// Builds 6 premium pin previews (one per visual style) for a selected
// product and returns the rendered Cloudinary URLs WITHOUT touching the
// pinterest_pin_queue, calling the AI gateway, or Pexels. Pure renderer.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { scrubProductImages } from "../_shared/pinterest-image-scrub.ts";
import {
  buildStyledPin,
  HOOK_TO_STYLE,
  pickSoftCta,
  pickCtrBadge,
  type PinStyleKey,
} from "../_shared/pinterest-templates.ts";

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

// 6 visual styles × default headline / CTA suggestions. The admin can
// override per-style copy via the request body (`overrides`) but defaults
// are tuned so a "blank" preview already looks like a polished pin.
interface StyleSpec {
  hookKey: string;
  style: PinStyleKey;
  defaultTop: string;
  defaultBottom: string;
  needsBackdrop: boolean;
}

const STYLE_SPECS: StyleSpec[] = [
  { hookKey: "pain",            style: "problem",      defaultTop: "Tired of the daily mess?",        defaultBottom: "See the fix",            needsBackdrop: true  },
  { hookKey: "transformation",  style: "before_after", defaultTop: "From chaos to calm",              defaultBottom: "See the transformation", needsBackdrop: true  },
  { hookKey: "time_saving",     style: "benefit",      defaultTop: "Save hours every week",           defaultBottom: "Discover more",          needsBackdrop: false },
  { hookKey: "social_proof",    style: "lifestyle",    defaultTop: "Cat owners love this",            defaultBottom: "Shop the upgrade",       needsBackdrop: true  },
  { hookKey: "curiosity",       style: "viral",        defaultTop: "The one thing every cat needs",   defaultBottom: "See why",                needsBackdrop: false },
  { hookKey: "infographic",     style: "infographic",  defaultTop: "3 steps to a happier home",       defaultBottom: "See the checklist",      needsBackdrop: false },
];

// Cloudinary-only fallback backdrop — keeps this endpoint network-light
// (no Pexels round-trip) while still giving lifestyle-style templates a
// non-empty backdrop URL to composite over.
const CLOUDINARY_CLOUD = "dlkqycfzn";
const FALLBACK_PALETTES: Record<string, { primary: string; accent: string }> = {
  problem:      { primary: "C97B2B", accent: "5A2A12" },
  before_after: { primary: "4A2E5C", accent: "1F1330" },
  lifestyle:    { primary: "B5946A", accent: "5C432A" },
};
function buildFallbackBackdrop(style: string): string {
  const p = FALLBACK_PALETTES[style] || FALLBACK_PALETTES.lifestyle;
  const seed = encodeURIComponent("https://getpawsy.pet/placeholder.svg");
  const base = ["w_1080", "h_1920", "c_pad", `b_rgb:${p.primary}`, "f_jpg", "q_auto"].join(",");
  const accent = [
    "l_text:Arial_400_bold:%20", `b_rgb:${p.accent}`, "co_rgb:00000000",
    "w_1400", "h_1400", "c_fit", "g_south", "y_-200", "o_70", "e_blur:600",
  ].join(",");
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${base}/${accent}/${seed}`;
}

const DIRECT_TEST_ADMIN_EMAILS = new Set<string>(
  (Deno.env.get("PINTEREST_ADMIN_EMAIL_ALLOWLIST") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

async function requireAdmin(
  sb: ReturnType<typeof createClient>,
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Admin auth required" };
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!anonKey) return { ok: false, status: 500, error: "Backend missing anon key" };
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data?.user?.id) return { ok: false, status: 401, error: "Invalid admin token" };
  const { data: role } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  const email = String(data.user.email || "").trim().toLowerCase();
  if ((role as { role?: string } | null)?.role === "admin" || DIRECT_TEST_ADMIN_EMAILS.has(email)) {
    return { ok: true, userId: data.user.id };
  }
  return { ok: false, status: 403, error: "Admin role required" };
}

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers });
  const traceId = crypto.randomUUID();
  const respond = (payload: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify({ traceId, ...payload }), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") {
      return respond({ ok: false, message: "Use POST" }, 405);
    }
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const productSlug = String((body as { productSlug?: unknown }).productSlug || "").trim();
    if (!productSlug) {
      return respond({ ok: false, code: "MISSING_SLUG", message: "productSlug is required" }, 400);
    }
    const overrides = ((body as { overrides?: Record<string, { top?: string; bottom?: string }> })
      .overrides) || {};

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auth = await requireAdmin(sb, req);
    if (!auth.ok) return respond({ ok: false, code: "UNAUTHORIZED", message: auth.error }, auth.status);

    const { data: product, error: pErr } = await sb
      .from("products")
      .select("id, name, slug, image_url, images, category")
      .eq("slug", productSlug)
      .maybeSingle();
    if (pErr || !product) {
      return respond({ ok: false, code: "PRODUCT_NOT_FOUND", message: `No product for slug "${productSlug}"` }, 404);
    }

    const allImages: string[] = [
      (product as { image_url?: string }).image_url,
      ...(((product as { images?: unknown }).images as string[] | undefined) || []),
    ].filter((u): u is string => typeof u === "string" && u.length > 0);
    if (allImages.length === 0) {
      return respond({ ok: false, code: "NO_PRODUCT_IMAGES", message: "Product has no images" }, 422);
    }
    const scrub = scrubProductImages(allImages);
    if (scrub.clean.length === 0) {
      return respond({
        ok: false,
        code: "NO_CLEAN_IMAGE",
        message: "All product images were rejected by the supplier-image scrubber",
        rejected: scrub.rejected.slice(0, 10),
      }, 422);
    }
    const cleanImages = scrub.clean;

    const seedBase = (Date.now() / 60000) | 0;
    const previews = STYLE_SPECS.map((spec, i) => {
      const seed = seedBase + i * 7 + spec.hookKey.length;
      const productImage = cleanImages[i % cleanImages.length];
      const ovr = overrides[spec.hookKey] || overrides[spec.style] || {};
      const top = String(ovr.top || spec.defaultTop).slice(0, 60);
      const bottom = String(ovr.bottom || spec.defaultBottom).slice(0, 30);
      const ctrBadge = pickCtrBadge(seed);
      const backdropUrl = spec.needsBackdrop ? buildFallbackBackdrop(spec.style) : null;
      const built = buildStyledPin(spec.style, {
        productImageUrl: productImage,
        backdropUrl,
        top,
        bottom,
        ctrBadge,
        seed,
      });
      return {
        hook_group: spec.hookKey,
        style: spec.style,
        pin_image_url: built.url,
        layout_signature: built.layoutSignature,
        product_image_used: productImage,
        backdrop_url: backdropUrl,
        backdrop_source: backdropUrl ? "cloudinary_fallback" : "none",
        top_overlay: top,
        bottom_overlay: bottom,
        ctr_badge: ctrBadge,
        soft_cta_suggestion: pickSoftCta(seed),
      };
    });

    return respond({
      ok: true,
      dryRun: true,
      message: `Generated ${previews.length} style previews (no queue insert)`,
      product: {
        id: (product as { id: string }).id,
        slug: (product as { slug: string }).slug,
        name: (product as { name: string }).name,
        category: (product as { category?: string | null }).category ?? null,
      },
      images: {
        total: allImages.length,
        clean: cleanImages.length,
        rejected: scrub.rejected.length,
      },
      previews,
    });
  } catch (e) {
    console.error("[pinterest-preview-styles] threw:", e instanceof Error ? e.message : e);
    return respond({ ok: false, code: "UNHANDLED", message: e instanceof Error ? e.message : "unknown error" }, 500);
  }
});