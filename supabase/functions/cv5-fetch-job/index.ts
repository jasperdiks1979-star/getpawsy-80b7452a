// Cinematic V5: Worker fetch. Returns beats, signed scene image URLs, signed VO
// audio URLs, and a signed PUT URL for the rendered MP4 upload.
// Auth: Bearer RUNWAY_MERGE_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RUNWAY_MERGE_TOKEN = Deno.env.get("RUNWAY_MERGE_TOKEN")!;
const BUCKET = "cinematic-ads-v5";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const auth = req.headers.get("authorization") || "";
    if (!RUNWAY_MERGE_TOKEN || auth !== `Bearer ${RUNWAY_MERGE_TOKEN}`) {
      return new Response(JSON.stringify({ ok: false, code: "UNAUTHORIZED", traceId: trace_id }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const url = new URL(req.url);
    const id = url.searchParams.get("storyboard_id");
    if (!id) throw new Error("storyboard_id required");
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: row } = await sb.from("cv5_storyboards").select("*").eq("id", id).maybeSingle();
    if (!row) return new Response(JSON.stringify({ ok: false, code: "NOT_FOUND" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Re-sign scene and VO URLs in case originals expired.
    const sceneUrls: string[] = [];
    for (let i = 0; i < (row.beats || []).length; i++) {
      const s = await sb.storage.from(BUCKET).createSignedUrl(`scenes/${id}/beat_${i}.png`, 60 * 60 * 6);
      sceneUrls.push(s.data?.signedUrl || "");
    }
    const voUrls: string[] = [];
    for (let i = 0; i < (row.beats || []).length; i++) {
      const s = await sb.storage.from(BUCKET).createSignedUrl(`vo/${id}/beat_${i}.mp3`, 60 * 60 * 6);
      voUrls.push(s.data?.signedUrl || "");
    }
    const upload = await sb.storage.from(BUCKET).createSignedUploadUrl(`mp4/${id}.mp4`);
    return new Response(JSON.stringify({
      ok: true, traceId: trace_id,
      storyboard: { id, beats: row.beats, scene_urls: sceneUrls, vo_urls: voUrls },
      upload: upload.data,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});