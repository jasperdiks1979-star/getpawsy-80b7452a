// Cinematic V5: Render worker callback. Finalizes the storyboard with the MP4 URL.
// Auth: Bearer RUNWAY_MERGE_TOKEN. Never auto-publishes — flips queue to awaiting_review only.
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
      return new Response(JSON.stringify({ ok: false, code: "UNAUTHORIZED" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const body = await req.json();
    const { storyboard_id, qa_pass, post_render_reject_reasons, workflow_status, upload_completed, render_file_exists } = body || {};
    if (!storyboard_id) throw new Error("storyboard_id required");
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: row } = await sb.from("cv5_storyboards").select("id, quality_breakdown").eq("id", storyboard_id).maybeSingle();
    if (!row) return new Response(JSON.stringify({ ok: false, code: "NOT_FOUND" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!qa_pass) {
      const isRenderFailure = workflow_status && workflow_status !== "success";
      if (isRenderFailure || render_file_exists === false || upload_completed === false) {
        const reason = isRenderFailure ? `workflow_${workflow_status}` : (render_file_exists === false ? "mp4_not_rendered" : "upload_not_completed");
        await sb.from("cv5_storyboards").update({ status: "upload_failed", render_error: reason }).eq("id", storyboard_id);
        await sb.from("pinterest_video_queue").update({ status: "awaiting_render", error_message: reason }).eq("storyboard_id", storyboard_id);
        return new Response(JSON.stringify({ ok: false, code: "RENDER_OR_UPLOAD_FAILED", reason }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const merged = Array.from(new Set([...(post_render_reject_reasons || [])]));
      await sb.from("cv5_storyboards").update({ status: "rejected", rejected_reason: merged.join("|"), render_error: "qa_failed" }).eq("id", storyboard_id);
      await sb.from("pinterest_video_queue").update({ status: "creative_rejected", error_message: "cv5_post_render_qa_failed" }).eq("storyboard_id", storyboard_id);
      return new Response(JSON.stringify({ ok: true, rejected: true, reasons: merged }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Sign a long URL for the MP4 (private bucket).
    const signed = await sb.storage.from(BUCKET).createSignedUrl(`mp4/${storyboard_id}.mp4`, 60 * 60 * 24 * 30);
    const mp4_url = signed.data?.signedUrl;
    if (!mp4_url) {
      await sb.from("cv5_storyboards").update({ status: "callback_failed", render_error: "sign_url_failed" }).eq("id", storyboard_id);
      return new Response(JSON.stringify({ ok: false, code: "SIGN_FAILED" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Verify the MP4 is reachable and playable.
    try {
      const head = await fetch(mp4_url, { method: "HEAD" });
      const ctype = head.headers.get("content-type") || "";
      const clen = Number(head.headers.get("content-length") || "0");
      if (!head.ok || !ctype.startsWith("video/") || clen < 50_000) {
        await sb.from("cv5_storyboards").update({ status: "upload_failed", render_error: `mp4_not_playable status=${head.status} type=${ctype} bytes=${clen}` }).eq("id", storyboard_id);
        return new Response(JSON.stringify({ ok: false, code: "UPLOAD_FAILED", head_status: head.status }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } catch (e) {
      await sb.from("cv5_storyboards").update({ status: "callback_failed", render_error: `head_check_failed:${String(e).slice(0,200)}` }).eq("id", storyboard_id);
      return new Response(JSON.stringify({ ok: false, code: "HEAD_CHECK_FAILED" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    await sb.from("cv5_storyboards").update({ status: "rendered", mp4_url }).eq("id", storyboard_id);
    await sb.from("pinterest_video_queue").update({ status: "awaiting_review" }).eq("storyboard_id", storyboard_id);
    return new Response(JSON.stringify({ ok: true, mp4_url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[cv5-render-callback]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});