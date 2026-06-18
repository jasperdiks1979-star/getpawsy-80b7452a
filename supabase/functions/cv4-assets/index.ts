// Cinematic V4: Asset resolver.
// Pulls product gallery + product_media for the slug. V4 now requires at least
// 5 usable real gallery images; weak galleries are held as needs_better_assets.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const BUCKET = "cinematic-ads";

type SceneAsset = { beat: string; index: number; image_url: string; source: "gallery" | "ai" };

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw) continue;
    const u = String(raw).trim();
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

async function gatherGalleryImages(sb: any, productId: string | null, slug: string): Promise<string[]> {
  const urls: string[] = [];
  if (productId) {
    const { data: p } = await sb.from("products")
      .select("image_url, images")
      .eq("id", productId).maybeSingle();
    if (p?.image_url) urls.push(p.image_url);
    if (Array.isArray(p?.images)) urls.push(...p.images);
    const { data: media } = await sb.from("product_media")
      .select("url, media_type")
      .eq("product_id", productId)
      .eq("media_type", "image")
      .limit(10);
    for (const m of (media || [])) if (m.url) urls.push(m.url);
  }
  return uniqueUrls(urls);
}

async function generateAiBackdrop(beat: string, _productName: string, category: string): Promise<string | null> {
  // HARD RULE: AI lifestyle backdrops MUST NOT depict any pet touching, holding,
  // sitting on, or otherwise interacting with the product. The product is never
  // rendered by AI — we only generate empty rooms / textures / lifestyle scenes
  // where the real product image will be composited.
  const room = category.toLowerCase().includes("cat")
    ? "a calm sunlit modern living room styled for cats, no animals in frame"
    : "a calm sunlit modern living room styled for dogs, no animals in frame";
  const prompts: Record<string, string> = {
    lifestyle: `Editorial interior photograph of ${room}, soft natural window light, neutral palette, premium pet-home aesthetic, empty floor in foreground, NO animals, NO products, NO text, NO logos, 9:16 vertical composition`,
    benefit:   `Minimalist textured backdrop, warm beige and cream tones, soft shadows, premium editorial advertising surface, NO animals, NO products, NO text, NO logos, 9:16 vertical composition`,
    cta:       `Warm golden-hour interior scene, soft bokeh background, empty floor in foreground, NO animals, NO products, NO text, NO logos, 9:16 vertical composition`,
    problem:   `Documentary photo of a tidy real home with neutral light, empty room, NO animals, NO products, NO text, NO logos, 9:16 vertical composition`,
    solution:  `Clean wooden surface in soft window light with empty space ready for product placement, NO animals, NO products, NO text, NO logos, 9:16 vertical composition`,
  };
  const prompt = prompts[beat] || prompts.lifestyle;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        prompt,
        n: 1,
        size: "1024x1792",
      }),
    });
    if (!res.ok) {
      console.error("[cv4-assets] ai img status", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    const url = json?.data?.[0]?.url;
    if (url) return url;
    if (!b64) return null;
    // Decode and upload to public bucket
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const path = `cv4-ai/${beat}-${crypto.randomUUID()}.png`;
    const up = await sb.storage.from(BUCKET).upload(path, bin, { contentType: "image/png", upsert: false });
    if (up.error) { console.error("[cv4-assets] upload err", up.error); return null; }
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  } catch (e) {
    console.error("[cv4-assets] ai backdrop err", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json();
    const { storyboard_id, skip_ai } = body || {};
    if (!storyboard_id) {
      return new Response(JSON.stringify({ ok: false, code: "MISSING_STORYBOARD_ID", traceId: trace_id }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: sb_row } = await sb.from("cinematic_v4_storyboards").select("*").eq("id", storyboard_id).maybeSingle();
    if (!sb_row) return new Response(JSON.stringify({ ok: false, code: "STORYBOARD_NOT_FOUND", traceId: trace_id }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: product } = await sb.from("products")
      .select("id, name, category").eq("slug", sb_row.product_slug).maybeSingle();
    const productName = product?.name || sb_row.product_slug;
    const category = product?.category || "";

    const gallery = await gatherGalleryImages(sb, product?.id || null, sb_row.product_slug);
    const beats = Array.isArray(sb_row.beats) ? sb_row.beats : [];
    const scene_assets: SceneAsset[] = [];

    if (gallery.length < 5) {
      const reasons = Array.from(new Set([...(sb_row.cv4_reject_reasons || []), `needs_better_assets:usable_gallery_lt_5:${gallery.length}`]));
      await sb.from("cinematic_v4_storyboards").update({
        scene_assets: [],
        unique_image_count: gallery.length,
        cv4_reject_reasons: reasons,
        status: "needs_better_assets",
        rejected_at: new Date().toISOString(),
      }).eq("id", storyboard_id);
      return new Response(JSON.stringify({ ok: false, traceId: trace_id, code: "NEEDS_BETTER_ASSETS", usable_gallery_count: gallery.length, reasons }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // HARD RULE (per user constraint #1):
    // Use real product/gallery/CJ images FIRST for every scene.
    // V4 is review-only and must not synthesize missing scene variety.
    const realImages = gallery.slice(); // already unique

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      const beatName: string = beat?.beat || `scene${i}`;
      let url: string | null = null;
      let source: "gallery" | "ai" = "gallery";

      // First pass: every gallery image gets used before any reuse / AI.
      if (i < realImages.length) {
        url = realImages[i];
        source = "gallery";
      } else if (realImages.length > 0) {
        url = realImages[i % realImages.length];
        source = "gallery";
      }
      if (url) scene_assets.push({ beat: beatName, index: i, image_url: url, source });
    }

    const unique = new Set(scene_assets.map((s) => s.image_url));
    await sb.from("cinematic_v4_storyboards").update({
      scene_assets,
      unique_image_count: unique.size,
    }).eq("id", storyboard_id);

    return new Response(JSON.stringify({ ok: true, traceId: trace_id, scene_assets, unique_image_count: unique.size, gallery_count: gallery.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cv4-assets]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});