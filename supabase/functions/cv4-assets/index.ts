// Cinematic V4: Asset resolver.
// Pulls product gallery + product_media for the slug. If <3 unique images,
// generates lifestyle/benefit AI backdrops via Lovable AI image gen and uploads
// them to the existing `cinematic-ads` public bucket. Updates the storyboard
// row with scene_assets[] aligned to its beats.
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
      .select("image_url, gallery_images")
      .eq("id", productId).maybeSingle();
    if (p?.image_url) urls.push(p.image_url);
    if (Array.isArray(p?.gallery_images)) urls.push(...p.gallery_images);
    const { data: media } = await sb.from("product_media")
      .select("url, media_type")
      .eq("product_id", productId)
      .eq("media_type", "image")
      .limit(10);
    for (const m of (media || [])) if (m.url) urls.push(m.url);
  }
  return uniqueUrls(urls);
}

async function generateAiBackdrop(beat: string, productName: string, category: string): Promise<string | null> {
  const prompts: Record<string, string> = {
    lifestyle: `Cinematic photo of a happy ${category.includes("Cat") ? "cat" : "dog"} in a sunlit modern home, soft natural light, lifestyle product photography, no text overlays, 9:16 vertical composition, premium editorial look`,
    benefit:   `Editorial flat-lay product photography of ${productName}, clean minimal background, soft shadows, 9:16 vertical, no text, premium quality`,
    cta:       `Cozy lifestyle scene with a pet at home, warm golden-hour light, soft bokeh, 9:16 vertical composition, no text, editorial advertising style`,
    problem:   `Documentary-style photo showing a common pet-owner frustration moment in a real home, natural light, 9:16 vertical, no text overlay`,
    solution:  `Hero product photo of ${productName} on a clean wooden surface, soft window light, 9:16 vertical, no text, premium look`,
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
    let galleryIdx = 0;

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      const beatName: string = beat?.beat || `scene${i}`;
      const wantsAi = beatName === "lifestyle" || beatName === "benefit";
      let url: string | null = null;
      let source: "gallery" | "ai" = "gallery";
      if (!wantsAi && galleryIdx < gallery.length) {
        url = gallery[galleryIdx++];
      } else {
        url = await generateAiBackdrop(beatName, productName, category);
        source = "ai";
        if (!url && galleryIdx < gallery.length) { url = gallery[galleryIdx++]; source = "gallery"; }
      }
      if (!url && gallery.length > 0) { url = gallery[i % gallery.length]; source = "gallery"; }
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