// Cinematic V4: Render worker callback.
// Called by render-cinematic-v4.yml on success OR failure. On qa_pass=true,
// hands off to cv4-finalize with the public MP4 URL so the queue row flips to
// awaiting_review. On qa_pass=false, marks the storyboard rejected with the
// post-render OCR reasons. Auth: Bearer RUNWAY_MERGE_TOKEN.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RUNWAY_MERGE_TOKEN = Deno.env.get("RUNWAY_MERGE_TOKEN")!;
const BUCKET = "cinematic-ads";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const auth = req.headers.get("authorization") || "";
    if (!RUNWAY_MERGE_TOKEN || auth !== `Bearer ${RUNWAY_MERGE_TOKEN}`) {
      return new Response(JSON.stringify({ ok: false, code: "UNAUTHORIZED", traceId: trace_id }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const body = await req.json();
    const { storyboard_id, qa_pass, post_render_reject_reasons } = body || {};
    if (!storyboard_id) return new Response(JSON.stringify({ ok: false, code: "MISSING_STORYBOARD_ID", traceId: trace_id }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: row } = await sb.from("cinematic_v4_storyboards").select("id, cv4_reject_reasons").eq("id", storyboard_id).maybeSingle();
    if (!row) return new Response(JSON.stringify({ ok: false, code: "NOT_FOUND", traceId: trace_id }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!qa_pass) {
      const merged = Array.from(new Set([...(row.cv4_reject_reasons || []), ...(post_render_reject_reasons || [])]));
      await sb.from("cinematic_v4_storyboards").update({
        status: "rejected", rejected_at: new Date().toISOString(), cv4_reject_reasons: merged,
      }).eq("id", storyboard_id);
      // Also flip any awaiting_render queue row to creative_rejected.
      await sb.from("pinterest_video_queue").update({
        status: "creative_rejected", error_message: "cv4_post_render_qa_failed",
      }).eq("storyboard_id", storyboard_id);
      return new Response(JSON.stringify({ ok: true, traceId: trace_id, rejected: true, reasons: merged }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const mp4_url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/cv4/${storyboard_id}.mp4`;
    // Delegate to cv4-finalize so queue row flips to awaiting_review.
    const fr = await fetch(`${SUPABASE_URL}/functions/v1/cv4-finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ storyboard_id, mp4_url }),
    });
    const fj = await fr.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: true, traceId: trace_id, finalize: fj, mp4_url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[cv4-render-callback]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});