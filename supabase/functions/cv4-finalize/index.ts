// Cinematic V4: Finalize handoff.
// Called by the render worker (GH Actions / render-worker) once an MP4 has
// been produced for a storyboard. Inserts the row into pinterest_video_queue
// with engine_version='v4' and status='awaiting_review' so the existing
// publisher cannot fire it until an admin approves it in the review UI.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://getpawsy.pet";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json();
    const { storyboard_id, mp4_url, preview_thumb_url } = body || {};
    if (!storyboard_id) {
      return new Response(JSON.stringify({ ok: false, code: "MISSING_STORYBOARD_ID", traceId: trace_id }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: row } = await sb.from("cinematic_v4_storyboards").select("*").eq("id", storyboard_id).maybeSingle();
    if (!row) return new Response(JSON.stringify({ ok: false, code: "STORYBOARD_NOT_FOUND", traceId: trace_id }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (row.status === "rejected") return new Response(JSON.stringify({ ok: false, code: "STORYBOARD_REJECTED", traceId: trace_id }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const beats = Array.isArray(row.beats) ? row.beats : [];
    const assets = Array.isArray(row.scene_assets) ? row.scene_assets : [];
    const firstAsset = assets[0]?.image_url || null;
    const destination_url = `${SITE_URL}/products/${row.product_slug}`;
    const title = beats[1]?.caption || beats[0]?.caption || row.product_slug;
    const description = beats.map((b: any) => b?.caption).filter(Boolean).join(" · ");
    const cta_text = beats[4]?.caption || "Shop now";
    const variation_hash = `cv4-${storyboard_id}`;

    await sb.from("cinematic_v4_storyboards").update({
      mp4_url: mp4_url || null,
      preview_thumb_url: preview_thumb_url || firstAsset,
      destination_url,
      status: mp4_url ? "rendered" : "awaiting_render",
    }).eq("id", storyboard_id);

    // Idempotent queue insert keyed on storyboard_id.
    const { data: existing } = await sb.from("pinterest_video_queue")
      .select("id").eq("storyboard_id", storyboard_id).maybeSingle();

    let queue_id = existing?.id || null;
    if (!queue_id) {
      // Stub asset row — V4 queue rows must satisfy the legacy FK to
      // pinterest_video_assets, but the real MP4 may not exist yet.
      const stubPublicUrl = mp4_url || preview_thumb_url || firstAsset || `${SITE_URL}/placeholder.svg`;
      const { data: stubAsset, error: assetErr } = await sb.from("pinterest_video_assets").insert({
        filename: `cv4-${storyboard_id}.mp4`,
        storage_bucket: "cinematic-ads",
        storage_path: `cv4/${storyboard_id}.mp4`,
        public_url: stubPublicUrl,
        hook_type: row.hook_archetype || "curiosity",
        product_slug: row.product_slug,
        content_hash: `cv4-${storyboard_id}`,
        is_active: true,
      }).select("id").single();
      if (assetErr) throw assetErr;

      const { data: q, error } = await sb.from("pinterest_video_queue").insert({
        asset_id: stubAsset.id,
        storyboard_id,
        engine_version: "v4",
        status: mp4_url ? "awaiting_review" : "awaiting_render",
        title,
        description,
        cta_text,
        variation_hash,
        destination_url,
        scene_count: row.scene_count ?? beats.length,
        unique_image_count: row.unique_image_count ?? new Set(assets.map((a: any) => a.image_url)).size,
        quality_score: row.quality_score,
      }).select("id").single();
      if (error) throw error;
      queue_id = q.id;
    } else if (mp4_url) {
      await sb.from("pinterest_video_queue").update({
        status: "awaiting_review",
        title, description, cta_text,
      }).eq("id", queue_id);
    }

    return new Response(JSON.stringify({ ok: true, traceId: trace_id, queue_id, storyboard_id, status: mp4_url ? "awaiting_review" : "awaiting_render" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cv4-finalize]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});